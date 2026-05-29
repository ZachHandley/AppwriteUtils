// Re-export shim: implementation moved to appwrite-utils-helpers.
export {
  queuedOperations,
  nameToIdMapping,
  processedCollections,
  processedAttributes,
  enqueueOperation,
  clearProcessingState,
  isCollectionProcessed,
  markCollectionProcessed,
  isAttributeProcessed,
  markAttributeProcessed,
  processQueue,
} from "appwrite-utils-helpers";
export type { QueuedOperation } from "appwrite-utils-helpers";
