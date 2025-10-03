// Auto-generated Appwrite constants
// Generated on 2025-10-02T22:42:27.094Z

export const DATABASE_IDS = {
  DEVELOPMENT: "dev",
  MAIN: "main",
  STAGING: "staging"
} as const;

export const COLLECTION_IDS = {
  BULKDELETETESTCOLLECTION: "bulk_delete_test_collection",
  EXAMPLECOLLECTION: "example_collection_1758927661474",
  LARGETESTCOLLECTION: "large_test_collection_performance",
  EXAMPLETABLE: "example_table_1759444926849"
} as const;

export const BUCKET_IDS = {

} as const;

export const FUNCTION_IDS = {

} as const;

// Type helpers
export type DatabaseId = typeof DATABASE_IDS[keyof typeof DATABASE_IDS];
export type CollectionId = typeof COLLECTION_IDS[keyof typeof COLLECTION_IDS];
export type BucketId = typeof BUCKET_IDS[keyof typeof BUCKET_IDS];
export type FunctionId = typeof FUNCTION_IDS[keyof typeof FUNCTION_IDS];

// Helper objects for runtime use
export const ALL_DATABASE_IDS = Object.values(DATABASE_IDS);
export const ALL_COLLECTION_IDS = Object.values(COLLECTION_IDS);
export const ALL_BUCKET_IDS = Object.values(BUCKET_IDS);
export const ALL_FUNCTION_IDS = Object.values(FUNCTION_IDS);
