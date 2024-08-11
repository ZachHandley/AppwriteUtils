import type { Databases, Models } from "node-appwrite";
import type { OperationCreate } from "../storage/schemas.js";
import { tryAwaitWithRetry } from "appwrite-utils";
import { ulid } from "ulidx";

export const logOperation = async (
  db: Databases,
  dbId: string,
  operationDetails: OperationCreate,
  operationId?: string
): Promise<Models.Document> => {
  try {
    let operation;
    if (operationId) {
      // Update existing operation log
      operation = await tryAwaitWithRetry(
        async () =>
          await db.updateDocument(
            "migrations",
            "currentOperations",
            operationId,
            operationDetails
          )
      );
    } else {
      // Create new operation log
      operation = await db.createDocument(
        "migrations",
        "currentOperations",
        ulid(),
        operationDetails
      );
    }
    console.log(`Operation logged: ${operation.$id}`);
    return operation;
  } catch (error) {
    console.error(`Error logging operation: ${error}`);
    throw error;
  }
};
