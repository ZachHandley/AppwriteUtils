import type { Databases, Models } from "node-appwrite";
import type { OperationCreate } from "../storage/schemas.js";

/**
 * Legacy operation logger - deprecated
 * This function is maintained for backward compatibility but no longer performs any logging.
 * The operations table system has been refactored to use the dynamic adapter pattern.
 *
 * @deprecated This function will be removed in a future version
 */
export const logOperation = async (
  db: Databases,
  dbId: string,
  operationDetails: OperationCreate,
  operationId?: string
): Promise<Models.Document | null> => {
  // No-op: Operations logging has been moved to the new operations table system
  // Callers should migrate to using operationsTable.ts functions directly
  return null;
};
