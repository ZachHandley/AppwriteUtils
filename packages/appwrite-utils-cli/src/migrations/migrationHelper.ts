import { ID, Query, type Databases } from "node-appwrite";
import { BatchSchema, OperationSchema, type Operation } from "./backup.js";
import { type AttributeMappings, AttributeMappingsSchema } from "./schema.js";
import { z } from "zod";
import { logger } from "./logging.js";

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
  let operation = await findOrCreateOperation(
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

export const findOrCreateOperation = async (
  database: Databases,
  collectionId: string,
  operationType: string,
  additionalQueries?: string[]
) => {
  const operations = await database.listDocuments(
    "migrations",
    "currentOperations",
    [
      Query.equal("collectionId", collectionId),
      Query.equal("operationType", operationType),
      Query.equal("status", "pending"),
      ...(additionalQueries || []),
    ]
  );

  if (operations.documents.length > 0) {
    return OperationSchema.parse(operations.documents[0]); // Assuming the first document is the operation we want
  } else {
    // Create a new operation document
    const op = await database.createDocument(
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
    );

    return OperationSchema.parse(op);
  }
};

export const updateOperation = async (
  database: Databases,
  operationId: string,
  updateFields: any
) => {
  await database.updateDocument(
    "migrations",
    "currentOperations",
    operationId,
    updateFields
  );
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
      console.log(
        item,
        `Large item found at index ${index} with length ${itemLength}:`
      );
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
