import { ID, Query, type Databases } from "node-appwrite";
import { OperationSchema } from "./schema";

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

export const splitIntoBatches = (data: any[], batchSize: number): any[][] => {
  let batches = [];
  for (let i = 0; i < data.length; i += batchSize) {
    batches.push(data.slice(i, i + batchSize));
  }
  return batches;
};
