import { ID, Query, type Databases } from "node-appwrite";
import { OperationSchema } from "./backup.js";

export const findOrCreateOperation = async (
  database: Databases,
  collectionId: string,
  operationType: string
) => {
  // Here you would query your database for an existing operation
  // If it doesn't exist, create a new one
  // This is a simplified example
  const operations = await database.listDocuments(
    "migrations",
    "currentOperations",
    [
      Query.equal("collectionId", collectionId),
      Query.equal("operationType", operationType),
      Query.equal("status", "in_progress"),
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
        status: "in_progress",
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
export const maxBatchItems = 100;

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
