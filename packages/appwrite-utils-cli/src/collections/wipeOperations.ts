import {
  Databases,
  Query,
  type Models,
} from "node-appwrite";
import type { DatabaseAdapter } from "../adapters/DatabaseAdapter.js";
import { tryAwaitWithRetry } from "../utils/helperFunctions.js";
import { MessageFormatter } from "../shared/messageFormatter.js";
import { ProgressManager } from "../shared/progressManager.js";
import { isRetryableError, isBulkNotSupportedError, isCriticalError } from "../shared/errorUtils.js";
import { delay } from "../utils/helperFunctions.js";
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
 * Optimized streaming deletion of all rows from a table
 * Uses bulk deletion when available, falls back to optimized individual deletion
 */
export const wipeTableRows = async (
  adapter: DatabaseAdapter,
  databaseId: string,
  tableId: string
): Promise<void> => {
  try {
    // Configuration for optimized deletion
    const FETCH_BATCH_SIZE = 1000; // How many to fetch per query
    const BULK_DELETE_BATCH_SIZE = 500; // How many to bulk delete at once
    const INDIVIDUAL_DELETE_BATCH_SIZE = 200; // For fallback individual deletion
    const MAX_CONCURRENT_OPERATIONS = 10; // Concurrent bulk/individual operations

    let totalDeleted = 0;
    let cursor: string | undefined;
    let hasMoreRows = true;

    MessageFormatter.info("Starting optimized table row deletion...", { prefix: "Wipe" });

    // Create progress tracker (we'll update the total as we discover more rows)
    const progress = ProgressManager.create(
      `delete-${tableId}`,
      1, // Start with 1, will update as we go
      { title: "Deleting table rows" }
    );

    while (hasMoreRows) {
      // Fetch next batch of rows
      const queries = [Query.limit(FETCH_BATCH_SIZE)];
      if (cursor) {
        queries.push(Query.cursorAfter(cursor));
      }

      const response = await adapter.listRows({ databaseId, tableId, queries });
      const rows: any[] = (response as any).rows || [];

      if (rows.length === 0) {
        hasMoreRows = false;
        break;
      }

      // Update progress total as we discover more rows
      if (rows.length === FETCH_BATCH_SIZE) {
        // There might be more rows, update progress total
        progress.setTotal(totalDeleted + rows.length + 1000); // Estimate more
      }

      MessageFormatter.progress(
        `Processing batch: ${rows.length} rows (${totalDeleted + rows.length} total so far)`,
        { prefix: "Wipe" }
      );

      // Try to use bulk deletion first, fall back to individual deletion
      const rowIds = rows.map((row: any) => row.$id);

      // Check if bulk deletion is available and try it first
      if (adapter.bulkDeleteRows) {
        try {
          // Attempt bulk deletion (available in TablesDB)
          await tryBulkDeletion(adapter, databaseId, tableId, rowIds, BULK_DELETE_BATCH_SIZE, MAX_CONCURRENT_OPERATIONS);
          totalDeleted += rows.length;
          progress.update(totalDeleted);
        } catch (bulkError) {
          // Enhanced error handling: categorize the error and decide on fallback strategy
          const errorMessage = bulkError instanceof Error ? bulkError.message : String(bulkError);

          if (isRetryableError(errorMessage)) {
            MessageFormatter.progress(
              `Bulk deletion encountered retryable error, retrying with individual deletion for ${rows.length} rows`,
              { prefix: "Wipe" }
            );
          } else if (isBulkNotSupportedError(errorMessage)) {
            MessageFormatter.progress(
              `Bulk deletion not supported by server, switching to individual deletion for ${rows.length} rows`,
              { prefix: "Wipe" }
            );
          } else {
            MessageFormatter.progress(
              `Bulk deletion failed (${errorMessage}), falling back to individual deletion for ${rows.length} rows`,
              { prefix: "Wipe" }
            );
          }

          await tryIndividualDeletion(
            adapter,
            databaseId,
            tableId,
            rows,
            INDIVIDUAL_DELETE_BATCH_SIZE,
            MAX_CONCURRENT_OPERATIONS,
            progress,
            totalDeleted
          );
          totalDeleted += rows.length;
        }
      } else {
        // Bulk deletion not available, use optimized individual deletion
        MessageFormatter.progress(
          `Using individual deletion for ${rows.length} rows (bulk deletion not available)`,
          { prefix: "Wipe" }
        );

        await tryIndividualDeletion(
          adapter,
          databaseId,
          tableId,
          rows,
          INDIVIDUAL_DELETE_BATCH_SIZE,
          MAX_CONCURRENT_OPERATIONS,
          progress,
          totalDeleted
        );
        totalDeleted += rows.length;
      }

      // Set up cursor for next iteration
      if (rows.length < FETCH_BATCH_SIZE) {
        hasMoreRows = false;
      } else {
        cursor = rows[rows.length - 1].$id;
      }

      // Small delay between fetch cycles to be respectful to the API
      await delay(10);
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

/**
 * Helper function to attempt bulk deletion of row IDs
 */
async function tryBulkDeletion(
  adapter: DatabaseAdapter,
  databaseId: string,
  tableId: string,
  rowIds: string[],
  batchSize: number,
  maxConcurrent: number
): Promise<void> {
  if (!adapter.bulkDeleteRows) {
    throw new Error("Bulk deletion not available on this adapter");
  }

  const limit = pLimit(maxConcurrent);
  const batches = chunk(rowIds, batchSize);

  const deletePromises = batches.map((batch) =>
    limit(async () => {
      try {
        await tryAwaitWithRetry(async () =>
          adapter.bulkDeleteRows!({ databaseId, tableId, rowIds: batch })
        );
      } catch (error: any) {
        const errorMessage = error.message || String(error);

        // Enhanced error handling for bulk deletion
        if (isCriticalError(errorMessage)) {
          MessageFormatter.error(
            `Critical error in bulk deletion batch: ${errorMessage}`,
            error,
            { prefix: "Wipe" }
          );
          throw error;
        } else {
          // For non-critical errors in bulk deletion, re-throw to trigger fallback
          throw new Error(`Bulk deletion batch failed: ${errorMessage}`);
        }
      }
    })
  );

  await Promise.all(deletePromises);
}

/**
 * Helper function for fallback individual deletion
 */
async function tryIndividualDeletion(
  adapter: DatabaseAdapter,
  databaseId: string,
  tableId: string,
  rows: any[],
  batchSize: number,
  maxConcurrent: number,
  progress: any,
  baseDeleted: number
): Promise<void> {
  const limit = pLimit(maxConcurrent);
  const batches = chunk(rows, batchSize);
  let processedInBatch = 0;

  const deletePromises = batches.map((batch) =>
    limit(async () => {
      const batchDeletePromises = batch.map(async (row: any) => {
        try {
          await tryAwaitWithRetry(async () =>
            adapter.deleteRow({ databaseId, tableId, id: row.$id })
          );
        } catch (error: any) {
          const errorMessage = error.message || String(error);

          // Enhanced error handling for row deletion
          if (errorMessage.includes("Row with the requested ID could not be found")) {
            // Row already deleted, skip silently
          } else if (isCriticalError(errorMessage)) {
            // Critical error, log and rethrow to stop operation
            MessageFormatter.error(
              `Critical error deleting row ${row.$id}: ${errorMessage}`,
              error,
              { prefix: "Wipe" }
            );
            throw error;
          } else if (isRetryableError(errorMessage)) {
            // Retryable error, will be handled by tryAwaitWithRetry
            MessageFormatter.progress(
              `Retryable error for row ${row.$id}, will retry`,
              { prefix: "Wipe" }
            );
          } else {
            // Other non-critical errors, log but continue
            MessageFormatter.error(
              `Failed to delete row ${row.$id}: ${errorMessage}`,
              error,
              { prefix: "Wipe" }
            );
          }
        }
        processedInBatch++;
        progress.update(baseDeleted + processedInBatch);
      });

      await Promise.all(batchDeletePromises);
    })
  );

  await Promise.all(deletePromises);
}
