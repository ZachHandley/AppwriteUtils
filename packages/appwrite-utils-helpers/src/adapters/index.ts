// Database adapters for unified access to legacy and TablesDB APIs
export { LegacyAdapter } from "./LegacyAdapter.js";
export { TablesDBAdapter } from "./TablesDBAdapter.js";
export { AdapterFactory } from "./AdapterFactory.js";

// Re-export types from AdapterFactory (factory configuration types)
export type {
  AdapterFactoryConfig,
  AdapterFactoryResult,
} from "./AdapterFactory.js";

// Re-export types from DatabaseAdapter (interface and parameter types)
export type {
  DatabaseAdapter,
  CreateAttributeParams,
  UpdateAttributeParams,
  DeleteAttributeParams,
  CreateIndexParams,
  ListIndexesParams,
  DeleteIndexParams,
  CreateRowParams,
  UpdateRowParams,
  ListRowsParams,
  DeleteRowParams,
  BulkCreateRowsParams,
  BulkUpsertRowsParams,
  BulkDeleteRowsParams,
  CreateTableParams,
  UpdateTableParams,
  DeleteTableParams,
  ListTablesParams,
  GetTableParams,
  ListColumnsParams,
  GetColumnParams,
  AdapterMetadata,
  ApiResponse,
} from "./DatabaseAdapter.js";
