import { ID, Query, type Databases } from "node-appwrite";
import { BatchSchema, OperationSchema, type Operation } from "../storage/schemas.js";
import { AttributeMappingsSchema } from "appwrite-utils";
import { z } from "zod";
import { logger } from 'appwrite-utils-helpers';
import { tryAwaitWithRetry } from "appwrite-utils-helpers";
import {
  findOrCreateOperation as findOrCreateOp,
  updateOperation as updateOp,
  getOperation as getOp
} from "./operationsTable.js";
import type { DatabaseAdapter } from "appwrite-utils-helpers";
import { MessageFormatter } from 'appwrite-utils-helpers';

/**
 * Object that contains the context for an action that needs to be executed after import
 * Used in the afterImportActionsDefinitions
 * @type {ContextObject}
 * @typedef {Object} ContextObject
 * @property {string} collectionId - The ID of the collection
 * @property {any} finalItem - The final item that was imported
 * @property {string} action - The name of the action
 * @property {string[]} params - The parameters for the action
 * @property {Object} context - The context object for the action (all the data of this specific item)
 */
export const ContextObject = z.object({
  dbId: z.string(),
  collectionId: z.string(),
  finalItem: z.any(),
  attributeMappings: AttributeMappingsSchema,
  context: z.any(),
});

export type ContextObject = z.infer<typeof ContextObject>;

export const createOrFindAfterImportOperation = async (
  database: Databases,
  collectionId: string,
  context: ContextObject
) => {
  let operation = await findOrCreateOperationLegacy(
    database,
    collectionId,
    "afterImportAction"
  );
  if (!operation.batches) {
    operation.batches = [];
  }

  // Directly create a new batch for the context without checking for an existing batch
  const contextData = JSON.stringify(context);
  // Create a new batch with the contextData
  const newBatchId = await addBatch(database, contextData);
  // Update the operation with the new batch's $id
  operation.batches = [...operation.batches, newBatchId];
  await database.updateDocument(
    "migrations",
    "currentOperations",
    operation.$id,
    { batches: operation.batches }
  );
};

export const addBatch = async (database: Databases, data: string) => {
  const batch = await database.createDocument(
    "migrations",
    "batches",
    ID.unique(),
    {
      data,
      processed: false,
    }
  );
  return batch.$id;
};

export const getAfterImportOperations = async (
  database: Databases,
  collectionId: string
) => {
  let lastDocumentId: string | undefined;
  const allOperations = [];
  let total = 0;

  do {
    const query = [
      Query.equal("collectionId", collectionId),
      Query.equal("operationType", "afterImportAction"),
      Query.limit(100),
    ];

    if (lastDocumentId) {
      query.push(Query.cursorAfter(lastDocumentId));
    }

    const operations = await database.listDocuments(
      "migrations",
      "currentOperations",
      query
    );
    total = operations.total; // Update total with the latest fetch
    allOperations.push(...operations.documents);

    if (operations.documents.length > 0 && operations.documents.length >= 100) {
      lastDocumentId =
        operations.documents[operations.documents.length - 1].$id;
    }
  } while (allOperations.length < total);

  const allOps = allOperations.map((op) => OperationSchema.parse(op));
  return allOps;
};

// Legacy function for backward compatibility with old migrations database
const findOrCreateOperationLegacy = async (
  database: Databases,
  collectionId: string,
  operationType: string,
  additionalQueries?: string[]
) => {
  const operations = await tryAwaitWithRetry(
    async () =>
      await database.listDocuments("migrations", "currentOperations", [
        Query.equal("collectionId", collectionId),
        Query.equal("operationType", operationType),
        Query.equal("status", "pending"),
        ...(additionalQueries || []),
      ])
  );

  if (operations.documents.length > 0) {
    return OperationSchema.parse(operations.documents[0]);
  } else {
    const op = await tryAwaitWithRetry(
      async () =>
        await database.createDocument(
          "migrations",
          "currentOperations",
          ID.unique(),
          {
            operationType,
            collectionId,
            status: "pending",
            batches: [],
            progress: 0,
            total: 0,
            error: "",
          }
        )
    );

    return OperationSchema.parse(op);
  }
};

export const findOrCreateOperation = async (
  db: DatabaseAdapter,
  databaseId: string,
  operationType: string,
  collectionId?: string,
  data?: any
): Promise<any> => {
  // Use new operations table system
  return await findOrCreateOp(db, databaseId, operationType, {
    targetCollection: collectionId,
    data: data
  });
};

export const updateOperation = async (
  db: DatabaseAdapter,
  databaseId: string,
  operationId: string,
  updates: any
): Promise<any> => {
  // Use new operations table system
  return await updateOp(db, databaseId, operationId, updates);
};

export const getOperation = async (
  db: DatabaseAdapter,
  databaseId: string,
  operationId: string
): Promise<any> => {
  // Use new operations table system
  return await getOp(db, databaseId, operationId);
};

// Actual max 1073741824
export const maxDataLength = 1073741820;
export const maxBatchItems = 25;

export const splitIntoBatches = (data: any[]): any[][] => {
  let batches = [];
  let currentBatch: any[] = [];
  let currentBatchLength = 0;
  let currentBatchItemCount = 0;

  data.forEach((item, index) => {
    const itemLength = JSON.stringify(item).length;
    if (itemLength > maxDataLength) {
      MessageFormatter.warning(
        `Large item found at index ${index} with length ${itemLength}`,
        { prefix: "Batch Splitter" }
      );
      logger.debug("Large item data:", item);
    }
    // Check if adding the current item would exceed the max length or max items per batch
    if (
      currentBatchLength + itemLength >= maxDataLength ||
      currentBatchItemCount >= maxBatchItems
    ) {
      // If so, start a new batch
      batches.push(currentBatch);
      currentBatch = [item];
      currentBatchLength = itemLength;
      currentBatchItemCount = 1; // Reset item count for the new batch
    } else {
      // Otherwise, add the item to the current batch
      currentBatch.push(item);
      currentBatchLength += itemLength;
      currentBatchItemCount++;
    }
  });

  // Don't forget to add the last batch if it's not empty
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
};
