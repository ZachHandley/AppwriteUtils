import {
  Client,
  Databases,
  ID,
  Query,
} from "node-appwrite";
import { tryAwaitWithRetry, delay, calculateExponentialBackoff } from "../utils/helperFunctions.js";
import { MessageFormatter } from "../shared/messageFormatter.js";
import { chunk } from "es-toolkit";

/**
 * Transfers all documents from one collection to another in a different database
 * within the same Appwrite Project
 */
export const transferDocumentsBetweenDbsLocalToLocal = async (
  db: Databases,
  fromDbId: string,
  toDbId: string,
  fromCollId: string,
  toCollId: string
) => {
  let fromCollDocs = await tryAwaitWithRetry(async () =>
    db.listDocuments(fromDbId, fromCollId, [Query.limit(50)])
  );
  let totalDocumentsTransferred = 0;

  if (fromCollDocs.documents.length === 0) {
    MessageFormatter.info(`No documents found in collection ${fromCollId}`, { prefix: "Transfer" });
    return;
  } else if (fromCollDocs.documents.length < 50) {
    const batchedPromises = fromCollDocs.documents.map((doc) => {
      const toCreateObject: any = {
        ...doc,
      };
      delete toCreateObject.$databaseId;
      delete toCreateObject.$collectionId;
      delete toCreateObject.$createdAt;
      delete toCreateObject.$updatedAt;
      delete toCreateObject.$id;
      delete toCreateObject.$permissions;
      return tryAwaitWithRetry(
        async () =>
          await db.createDocument(
            toDbId,
            toCollId,
            doc.$id,
            toCreateObject,
            doc.$permissions
          )
      );
    });
    await Promise.all(batchedPromises);
    totalDocumentsTransferred += fromCollDocs.documents.length;
  } else {
    const batchedPromises = fromCollDocs.documents.map((doc) => {
      const toCreateObject: any = {
        ...doc,
      };
      delete toCreateObject.$databaseId;
      delete toCreateObject.$collectionId;
      delete toCreateObject.$createdAt;
      delete toCreateObject.$updatedAt;
      delete toCreateObject.$id;
      delete toCreateObject.$permissions;
      return tryAwaitWithRetry(async () =>
        db.createDocument(
          toDbId,
          toCollId,
          doc.$id,
          toCreateObject,
          doc.$permissions
        )
      );
    });
    await Promise.all(batchedPromises);
    totalDocumentsTransferred += fromCollDocs.documents.length;
    while (fromCollDocs.documents.length === 50) {
      fromCollDocs = await tryAwaitWithRetry(
        async () =>
          await db.listDocuments(fromDbId, fromCollId, [
            Query.limit(50),
            Query.cursorAfter(
              fromCollDocs.documents[fromCollDocs.documents.length - 1].$id
            ),
          ])
      );
      const batchedPromises = fromCollDocs.documents.map((doc) => {
        const toCreateObject: any = {
          ...doc,
        };
        delete toCreateObject.$databaseId;
        delete toCreateObject.$collectionId;
        delete toCreateObject.$createdAt;
        delete toCreateObject.$updatedAt;
        delete toCreateObject.$id;
        delete toCreateObject.$permissions;
        return tryAwaitWithRetry(
          async () =>
            await db.createDocument(
              toDbId,
              toCollId,
              doc.$id,
              toCreateObject,
              doc.$permissions
            )
        );
      });
      await Promise.all(batchedPromises);
      totalDocumentsTransferred += fromCollDocs.documents.length;
    }
  }

  MessageFormatter.success(
    `Transferred ${totalDocumentsTransferred} documents from database ${fromDbId} to database ${toDbId} -- collection ${fromCollId} to collection ${toCollId}`,
    { prefix: "Transfer" }
  );
};

/**
 * Enhanced document transfer with fault tolerance and exponential backoff
 */
const transferDocumentWithRetry = async (
  db: Databases,
  dbId: string,
  collectionId: string,
  documentId: string,
  documentData: any,
  permissions: string[],
  maxRetries: number = 3,
  retryCount: number = 0
): Promise<boolean> => {
  try {
    await db.createDocument(
      dbId,
      collectionId,
      documentId,
      documentData,
      permissions
    );
    return true;
  } catch (error: any) {
    // Check if document already exists
    if (error.code === 409 || error.message?.toLowerCase().includes('already exists')) {
      await db.updateDocument(
        dbId,
        collectionId,
        documentId,
        documentData,
        permissions
      );
    }

    if (retryCount < maxRetries) {
      // Calculate exponential backoff: 1s, 2s, 4s, max 8s
      const exponentialDelay = calculateExponentialBackoff(retryCount, 1000, 8000);
      MessageFormatter.progress(`Retrying document ${documentId} (attempt ${retryCount + 1}/${maxRetries}, backoff: ${exponentialDelay}ms)`, { prefix: "Transfer" });

      await delay(exponentialDelay);

      return await transferDocumentWithRetry(
        db,
        dbId,
        collectionId,
        documentId,
        documentData,
        permissions,
        maxRetries,
        retryCount + 1
      );
    }

    MessageFormatter.error(`Failed to transfer document ${documentId} after ${maxRetries} retries`, error, { prefix: "Transfer" });
    return false;
  }
};

/**
 * Check if endpoint supports bulk operations (cloud.appwrite.io)
 */
const supportsBulkOperations = (endpoint: string): boolean => {
  return endpoint.includes('cloud.appwrite.io');
};

/**
 * Direct HTTP implementation of bulk upsert API
 */
const bulkUpsertDocuments = async (
  client: any,
  dbId: string,
  collectionId: string,
  documents: any[]
): Promise<any> => {
  const apiPath = `/databases/${dbId}/collections/${collectionId}/documents`;
  const url = new URL(client.config.endpoint + apiPath);

  const headers = {
    'Content-Type': 'application/json',
    'X-Appwrite-Project': client.config.project,
    'X-Appwrite-Key': client.config.key
  };

  const response = await fetch(url.toString(), {
    method: 'PUT',
    headers,
    body: JSON.stringify({ documents })
  });

  if (!response.ok) {
    const errorData: any = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Bulk upsert failed: ${response.status} - ${errorData.message || 'Unknown error'}`);
  }

  return await response.json();
};

/**
 * Direct HTTP implementation of bulk create API
 */
const bulkCreateDocuments = async (
  client: any,
  dbId: string,
  collectionId: string,
  documents: any[]
): Promise<any> => {
  const apiPath = `/databases/${dbId}/collections/${collectionId}/documents`;
  const url = new URL(client.config.endpoint + apiPath);

  const headers = {
    'Content-Type': 'application/json',
    'X-Appwrite-Project': client.config.project,
    'X-Appwrite-Key': client.config.key
  };

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ documents })
  });

  if (!response.ok) {
    const errorData: any = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Bulk create failed: ${response.status} - ${errorData.message || 'Unknown error'}`);
  }

  return await response.json();
};

/**
 * Enhanced bulk document creation using direct HTTP calls
 */
const transferDocumentsBulkUpsert = async (
  client: any,
  dbId: string,
  collectionId: string,
  documents: any[],
  maxBatchSize: number = 1000
): Promise<{ successful: number; failed: number }> => {
  let successful = 0;
  let failed = 0;

  // Prepare documents for bulk upsert
  const preparedDocs = documents.map(doc => {
    const toCreateObject: any = { ...doc };
    delete toCreateObject.$databaseId;
    delete toCreateObject.$collectionId;
    delete toCreateObject.$createdAt;
    delete toCreateObject.$updatedAt;

    // Keep $id and $permissions for upsert functionality
    return toCreateObject;
  });

  // Process in batches based on plan limits
  const documentBatches = chunk(preparedDocs, maxBatchSize);

  for (const batch of documentBatches) {
    MessageFormatter.progress(`Bulk upserting ${batch.length} documents...`, { prefix: "Transfer" });

    try {
      // Try bulk upsert with direct HTTP call
      const result = await bulkUpsertDocuments(client, dbId, collectionId, batch);
      successful += result.documents?.length || batch.length;
      MessageFormatter.success(`Bulk upserted ${result.documents?.length || batch.length} documents`, { prefix: "Transfer" });

    } catch (error: any) {
      MessageFormatter.progress(`Bulk upsert failed, trying smaller batch size...`, { prefix: "Transfer" });

      // If bulk upsert fails, try with smaller batch size (Pro plan limit)
      if (maxBatchSize > 100) {
        const smallerBatches = chunk(batch, 100);

        for (const smallBatch of smallerBatches) {
          try {
            const result = await bulkUpsertDocuments(client, dbId, collectionId, smallBatch);
            successful += result.documents?.length || smallBatch.length;
            MessageFormatter.success(`Bulk upserted ${result.documents?.length || smallBatch.length} documents (smaller batch)`, { prefix: "Transfer" });
          } catch (smallBatchError: any) {
            MessageFormatter.progress(`Smaller batch failed, falling back to individual transfers...`, { prefix: "Transfer" });

            // Fall back to individual document transfer for this batch
            const db = new Databases(client);
            const { successful: indivSuccessful, failed: indivFailed } = await transferDocumentBatchWithRetryFallback(
              db, dbId, collectionId, smallBatch.map((doc, index) => ({
                ...doc,
                $id: documents[documentBatches.indexOf(batch) * maxBatchSize + smallerBatches.indexOf(smallBatch) * 100 + index]?.$id || ID.unique(),
                $permissions: documents[documentBatches.indexOf(batch) * maxBatchSize + smallerBatches.indexOf(smallBatch) * 100 + index]?.$permissions || []
              }))
            );
            successful += indivSuccessful;
            failed += indivFailed;
          }

          // Add delay between batches
          await delay(200);
        }
      } else {
        // Fall back to individual document transfer
        const db = new Databases(client);
        const { successful: indivSuccessful, failed: indivFailed } = await transferDocumentBatchWithRetryFallback(
          db, dbId, collectionId, batch.map((doc, index) => ({
            ...doc,
            $id: documents[documentBatches.indexOf(batch) * maxBatchSize + index]?.$id || ID.unique(),
            $permissions: documents[documentBatches.indexOf(batch) * maxBatchSize + index]?.$permissions || []
          }))
        );
        successful += indivSuccessful;
        failed += indivFailed;
      }
    }

    // Add delay between major batches
    if (documentBatches.indexOf(batch) < documentBatches.length - 1) {
      await delay(500);
    }
  }

  return { successful, failed };
};

/**
 * Fallback batch document transfer with individual retry logic
 */
const transferDocumentBatchWithRetryFallback = async (
  db: Databases,
  dbId: string,
  collectionId: string,
  documents: any[],
  batchSize: number = 10
): Promise<{ successful: number; failed: number }> => {
  let successful = 0;
  let failed = 0;

  // Process documents in smaller batches to avoid overwhelming the server
  const documentBatches = chunk(documents, batchSize);

  for (const batch of documentBatches) {
    MessageFormatter.progress(`Processing batch of ${batch.length} documents...`, { prefix: "Transfer" });

    const batchPromises = batch.map(async (doc) => {
      const toCreateObject: Partial<typeof doc> = { ...doc };
      delete toCreateObject.$databaseId;
      delete toCreateObject.$collectionId;
      delete toCreateObject.$createdAt;
      delete toCreateObject.$updatedAt;
      delete toCreateObject.$id;
      delete toCreateObject.$permissions;

      const result = await transferDocumentWithRetry(
        db,
        dbId,
        collectionId,
        doc.$id,
        toCreateObject,
        doc.$permissions || []
      );

      return { docId: doc.$id, success: result };
    });

    const results = await Promise.allSettled(batchPromises);

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          successful++;
        } else {
          failed++;
        }
      } else {
        MessageFormatter.error(`Batch promise rejected for document ${batch[index].$id}`, new Error(String(result.reason)), { prefix: "Transfer" });
        failed++;
      }
    });

    // Add delay between batches to avoid rate limiting
    if (documentBatches.indexOf(batch) < documentBatches.length - 1) {
      await delay(500);
    }
  }

  return { successful, failed };
};

/**
 * Enhanced batch document transfer with fault tolerance and bulk API support
 */
const transferDocumentBatchWithRetry = async (
  db: Databases,
  client: any,
  dbId: string,
  collectionId: string,
  documents: any[],
  batchSize: number = 10
): Promise<{ successful: number; failed: number }> => {
  // Check if we can use bulk operations
  if (supportsBulkOperations(client.config.endpoint)) {
    MessageFormatter.info(`Using bulk upsert API for faster document transfer`, { prefix: "Transfer" });

    // Try with Scale plan limit first (2500), then Pro (1000), then Free (100)
    const batchSizes = [1000, 100]; // Start with Pro plan, fallback to Free

    for (const maxBatchSize of batchSizes) {
      try {
        return await transferDocumentsBulkUpsert(client, dbId, collectionId, documents, maxBatchSize);
      } catch (error: any) {
        MessageFormatter.progress(`Bulk upsert with batch size ${maxBatchSize} failed, trying smaller size...`, { prefix: "Transfer" });
        continue;
      }
    }

    // If all bulk operations fail, fall back to individual transfers
    MessageFormatter.progress(`All bulk operations failed, falling back to individual document transfers`, { prefix: "Transfer" });
  }

  // Fall back to individual document transfer
  return await transferDocumentBatchWithRetryFallback(db, dbId, collectionId, documents, batchSize);
};

export const transferDocumentsBetweenDbsLocalToRemote = async (
  localDb: Databases,
  endpoint: string,
  projectId: string,
  apiKey: string,
  fromDbId: string,
  toDbId: string,
  fromCollId: string,
  toCollId: string
) => {
  MessageFormatter.info(`Starting enhanced document transfer from ${fromCollId} to ${toCollId}...`, { prefix: "Transfer" });

  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);

  const remoteDb = new Databases(client);
  let totalDocumentsProcessed = 0;
  let totalSuccessful = 0;
  let totalFailed = 0;

  // Fetch documents in larger batches (1000 at a time)
  let hasMoreDocuments = true;
  let lastDocumentId: string | undefined;

  while (hasMoreDocuments) {
    const queries = [Query.limit(1000)]; // Fetch 1000 documents at a time
    if (lastDocumentId) {
      queries.push(Query.cursorAfter(lastDocumentId));
    }

    const fromCollDocs = await tryAwaitWithRetry(async () =>
      localDb.listDocuments(fromDbId, fromCollId, queries)
    );

    if (fromCollDocs.documents.length === 0) {
      hasMoreDocuments = false;
      break;
    }

    MessageFormatter.progress(`Fetched ${fromCollDocs.documents.length} documents, processing for transfer...`, { prefix: "Transfer" });

    const { successful, failed } = await transferDocumentBatchWithRetry(
      remoteDb,
      client,
      toDbId,
      toCollId,
      fromCollDocs.documents
    );

    totalDocumentsProcessed += fromCollDocs.documents.length;
    totalSuccessful += successful;
    totalFailed += failed;

    // Check if we have more documents to process
    if (fromCollDocs.documents.length < 1000) {
      hasMoreDocuments = false;
    } else {
      lastDocumentId = fromCollDocs.documents[fromCollDocs.documents.length - 1].$id;
    }

    MessageFormatter.debug(`Batch complete: ${successful} successful, ${failed} failed`, undefined, { prefix: "Transfer" });
  }

  if (totalDocumentsProcessed === 0) {
    MessageFormatter.info(`No documents found in collection ${fromCollId}`, { prefix: "Transfer" });
    return;
  }

  const message = `Total documents processed: ${totalDocumentsProcessed}, successful: ${totalSuccessful}, failed: ${totalFailed}`;

  if (totalFailed > 0) {
    MessageFormatter.warning(message, { prefix: "Transfer" });
  } else {
    MessageFormatter.success(message, { prefix: "Transfer" });
  }
};
