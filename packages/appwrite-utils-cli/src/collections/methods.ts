// Re-export shim: sync engine moved to appwrite-utils-helpers; wipe/transfer stay local.
export {
  documentExists,
  checkForCollection,
  fetchAndCacheCollectionByName,
  generateSchemas,
  createOrUpdateCollections,
  createOrUpdateCollectionsViaAdapter,
  generateMockData,
  fetchAllCollections,
} from "appwrite-utils-helpers";

// Re-export wipe operations
export {
  wipeDatabase,
  wipeCollection,
  wipeAllTables,
  wipeTableRows,
} from "./wipeOperations.js";

// Re-export transfer operations
export {
  transferDocumentsBetweenDbsLocalToLocal,
  transferDocumentsBetweenDbsLocalToRemote,
} from "./transferOperations.js";
