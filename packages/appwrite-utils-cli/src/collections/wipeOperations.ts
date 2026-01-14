import {
  Databases,
  Query,
  type Models,
} from "node-appwrite";
import type { DatabaseAdapter } from "appwrite-utils-helpers";
import { tryAwaitWithRetry } from "appwrite-utils-helpers";
import { MessageFormatter, isRetryableError, isCriticalError } from "appwrite-utils-helpers";
import { ProgressManager } from "../shared/progressManager.js";
import { delay } from "appwrite-utils-helpers";
import { chunk } from "es-toolkit";
import pLimit from "p-limit";
import { fetchAllCollections } from "./methods.js";

/**
 * Optimized streaming deletion of all documents from a collection
 * Uses memory-efficient pagination instead of loading all documents into memory
 */
async function wipeDocumentsFromCollection(
  database: Databases,
  databaseId: string,
  collectionId: string
) {
  try {
    // Use streaming deletion pattern - fetch and delete in batches without accumulating
    const FETCH_BATCH_SIZE = 1000; // How many to fetch per query
    const DELETE_BATCH_SIZE = 200; // How many to delete concurrently
    const MAX_CONCURRENT_DELETIONS = 10; // Concurrent deletion operations

    let totalDeleted = 0;
    let cursor: string | undefined;
    let hasMoreDocuments = true;

    MessageFormatter.info("Starting optimized document deletion...", { prefix: "Wipe" });

    // Create progress tracker (we'll update the total as we discover more documents)
    const progress = ProgressManager.create(
      `delete-${collectionId}`,
      1, // Start with 1, will update as we go
      { title: "Deleting documents" }
    );

    while (hasMoreDocuments) {
      // Fetch next batch of documents
      const queries = [Query.limit(FETCH_BATCH_SIZE)];
      if (cursor) {
        queries.push(Query.cursorAfter(cursor));
      }

      const response = await database.listDocuments(databaseId, collectionId, queries);
      const documents = response.documents;

      if (documents.length === 0) {
        hasMoreDocuments = false;
        break;
      }

      // Update progress total as we discover more documents
      if (documents.length === FETCH_BATCH_SIZE) {
        // There might be more documents, update progress total
        progress.setTotal(totalDeleted + documents.length + 1000); // Estimate more
      }

      MessageFormatter.progress(
        `Processing batch: ${documents.length} documents (${totalDeleted + documents.length} total so far)`,
        { prefix: "Wipe" }
      );

      // Delete this batch using optimized concurrent deletion
      const documentBatches = chunk(documents, DELETE_BATCH_SIZE);
      const limit = pLimit(MAX_CONCURRENT_DELETIONS);

      const deletePromises = documentBatches.map((batch) =>
        limit(async () => {
          const batchDeletePromises = batch.map(async (doc) => {
            try {
              await tryAwaitWithRetry(async () =>
                database.deleteDocument(databaseId, collectionId, doc.$id)
              );
              totalDeleted++;
              progress.update(totalDeleted);
            } catch (error: any) {
              const errorMessage = error.message || String(error);

              // Enhanced error handling for document deletion
              if (errorMessage.includes("Document with the requested ID could not be found")) {
                // Document already deleted, skip silently
                totalDeleted++;
                progress.update(totalDeleted);
              } else if (isCriticalError(errorMessage)) {
                // Critical error, log and rethrow to stop operation
                MessageFormatter.error(
                  `Critical error deleting document ${doc.$id}: ${errorMessage}`,
                  error,
                  { prefix: "Wipe" }
                );
                throw error;
              } else if (isRetryableError(errorMessage)) {
                // Retryable error, will be handled by tryAwaitWithRetry
                MessageFormatter.progress(
                  `Retryable error for document ${doc.$id}, will retry`,
                  { prefix: "Wipe" }
                );
                totalDeleted++;
                progress.update(totalDeleted);
              } else {
                // Other non-critical errors, log but continue
                MessageFormatter.error(
                  `Failed to delete document ${doc.$id}: ${errorMessage}`,
                  error,
                  { prefix: "Wipe" }
                );
                totalDeleted++;
                progress.update(totalDeleted);
              }
            }
          });

          await Promise.all(batchDeletePromises);
        })
      );

      await Promise.all(deletePromises);

      // Set up cursor for next iteration
      if (documents.length < FETCH_BATCH_SIZE) {
        hasMoreDocuments = false;
      } else {
        cursor = documents[documents.length - 1].$id;
      }

      // Small delay between fetch cycles to be respectful to the API
      await delay(10);
    }

    // Update final progress total
    progress.setTotal(totalDeleted);
    progress.stop();

    if (totalDeleted === 0) {
      MessageFormatter.info("No documents found to delete", { prefix: "Wipe" });
    } else {
      MessageFormatter.success(
        `Successfully deleted ${totalDeleted} documents from collection ${collectionId}`,
        { prefix: "Wipe" }
      );
    }

  } catch (error) {
    MessageFormatter.error(
      `Error wiping documents from collection ${collectionId}`,
      error instanceof Error ? error : new Error(String(error)),
      { prefix: "Wipe" }
    );
    throw error;
  }
}

export const wipeDatabase = async (
  database: Databases,
  databaseId: string
): Promise<{ collectionId: string; collectionName: string }[]> => {
  MessageFormatter.info(`Wiping database: ${databaseId}`, { prefix: "Wipe" });
  const existingCollections = await fetchAllCollections(databaseId, database);
  let collectionsDeleted: { collectionId: string; collectionName: string }[] =
    [];

  if (existingCollections.length === 0) {
    MessageFormatter.info("No collections to delete", { prefix: "Wipe" });
    return collectionsDeleted;
  }

  const progress = ProgressManager.create(
    `wipe-db-${databaseId}`,
    existingCollections.length,
    { title: "Deleting collections" }
  );

  let processed = 0;
  for (const { $id: collectionId, name: name } of existingCollections) {
    MessageFormatter.progress(`Deleting collection: ${collectionId}`, { prefix: "Wipe" });
    collectionsDeleted.push({
      collectionId: collectionId,
      collectionName: name,
    });
    tryAwaitWithRetry(
      async () => await database.deleteCollection(databaseId, collectionId)
    ); // Try to delete the collection and ignore errors if it doesn't exist or if it's already being deleted
    processed++;
    progress.update(processed);
    await delay(100);
  }

  progress.stop();
  MessageFormatter.success(`Deleted ${collectionsDeleted.length} collections from database`, { prefix: "Wipe" });
  return collectionsDeleted;
};

export const wipeCollection = async (
  database: Databases,
  databaseId: string,
  collectionId: string
): Promise<void> => {
  const collections = await database.listCollections(databaseId, [
    Query.equal("$id", collectionId),
  ]);
  if (collections.total === 0) {
    MessageFormatter.warning(`Collection ${collectionId} not found`, { prefix: "Wipe" });
    return;
  }
  const collection = collections.collections[0];
  await wipeDocumentsFromCollection(database, databaseId, collection.$id);
};

// TablesDB helpers for wiping
export const wipeAllTables = async (
  adapter: DatabaseAdapter,
  databaseId: string
): Promise<{ tableId: string; tableName: string }[]> => {
  MessageFormatter.info(`Wiping tables in database: ${databaseId}`, { prefix: 'Wipe' });
  const res = await adapter.listTables({ databaseId, queries: [Query.limit(500)] });
  const tables: any[] = (res as any).tables || [];
  const deleted: { tableId: string; tableName: string }[] = [];
  const progress = ProgressManager.create(`wipe-db-${databaseId}`, tables.length, { title: 'Deleting tables' });
  let processed = 0;
  for (const t of tables) {
    try {
      await adapter.deleteTable({ databaseId, tableId: t.$id });
      deleted.push({ tableId: t.$id, tableName: t.name });
    } catch (e) {
      MessageFormatter.error(`Failed deleting table ${t.$id}`, e instanceof Error ? e : new Error(String(e)), { prefix: 'Wipe' });
    }
    processed++; progress.update(processed);
    await delay(100);
  }
  progress.stop();
  return deleted;
};

/**
 * Optimized deletion of all rows from a table using direct bulk deletion
 * Uses Query.limit() to delete rows without fetching IDs first
 */
export const wipeTableRows = async (
  adapter: DatabaseAdapter,
  databaseId: string,
  tableId: string
): Promise<void> => {
  try {
    // Check if bulk deletion is available
    if (!adapter.bulkDeleteRows) {
      MessageFormatter.error(
        "Bulk deletion not available for this adapter - wipe operation not supported",
        new Error("bulkDeleteRows not available"),
        { prefix: "Wipe" }
      );
      throw new Error("Bulk deletion required for wipe operations");
    }

    const DELETE_BATCH_SIZE = 250; // How many rows to delete per batch
    let totalDeleted = 0;
    let hasMoreRows = true;

    MessageFormatter.info("Starting optimized table row deletion...", { prefix: "Wipe" });

    const progress = ProgressManager.create(
      `delete-${tableId}`,
      1, // Start with 1, will update as we discover more
      { title: "Deleting table rows" }
    );

    while (hasMoreRows) {
      try {
        // Delete next batch using Query.limit() - no fetching needed!
        const result = await tryAwaitWithRetry(async () =>
          adapter.bulkDeleteRows!({
            databaseId,
            tableId,
            rowIds: [], // Empty array signals we want to use Query.limit instead
            batchSize: DELETE_BATCH_SIZE
          })
        );

        const deletedCount = (result as any).total || 0;

        if (deletedCount === 0) {
          hasMoreRows = false;
          break;
        }

        totalDeleted += deletedCount;
        progress.setTotal(totalDeleted + 100); // Estimate more rows exist
        progress.update(totalDeleted);

        MessageFormatter.progress(
          `Deleted ${deletedCount} rows (${totalDeleted} total so far)`,
          { prefix: "Wipe" }
        );

        // Small delay between batches to be respectful to the API
        await delay(10);

      } catch (error: any) {
        const errorMessage = error.message || String(error);

        if (isCriticalError(errorMessage)) {
          MessageFormatter.error(
            `Critical error during bulk deletion: ${errorMessage}`,
            error,
            { prefix: "Wipe" }
          );
          throw error;
        } else {
          MessageFormatter.error(
            `Error during deletion batch: ${errorMessage}`,
            error,
            { prefix: "Wipe" }
          );
          // Continue trying with next batch
        }
      }
    }

    // Update final progress total
    progress.setTotal(totalDeleted);
    progress.stop();

    if (totalDeleted === 0) {
      MessageFormatter.info("No rows found to delete", { prefix: "Wipe" });
    } else {
      MessageFormatter.success(
        `Successfully deleted ${totalDeleted} rows from table ${tableId}`,
        { prefix: "Wipe" }
      );
    }

  } catch (error) {
    MessageFormatter.error(
      `Error wiping rows from table ${tableId}`,
      error instanceof Error ? error : new Error(String(error)),
      { prefix: "Wipe" }
    );
    throw error;
  }
};
