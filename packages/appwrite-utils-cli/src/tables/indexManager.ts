// Re-export shim: implementation moved to appwrite-utils-helpers.
export {
  planIndexOperations,
  planIndexDeletions,
  executeIndexOperations,
  executeIndexDeletions,
  createOrUpdateIndexesViaAdapter,
  deleteObsoleteIndexesViaAdapter,
} from "appwrite-utils-helpers";
export type {
  IndexOperation,
  IndexOperationPlan,
  IndexExecutionResult,
} from "appwrite-utils-helpers";
