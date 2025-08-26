/**
 * Adapters Module - Unified Database API for Appwrite
 * 
 * This module exports all adapter classes and utilities for working with
 * both legacy Appwrite (collections/documents) and TablesDB (tables/rows) APIs.
 */

export { AdapterFactory, type AdapterFactoryConfig, type AdapterFactoryResult } from './AdapterFactory.js';
export { 
  type DatabaseAdapter, 
  type CreateRowParams,
  type UpdateRowParams,
  type ListRowsParams,
  type DeleteRowParams,
  type CreateTableParams,
  type UpdateTableParams,
  type ListTablesParams,
  type DeleteTableParams,
  type GetTableParams,
  type BulkCreateRowsParams,
  type BulkUpsertRowsParams,
  type BulkDeleteRowsParams,
  type CreateIndexParams,
  type ListIndexesParams,
  type DeleteIndexParams,
  type CreateAttributeParams,
  type UpdateAttributeParams,
  type DeleteAttributeParams,
  type ApiResponse,
  type AdapterMetadata,
  BaseAdapter 
} from './DatabaseAdapter.js';
export { TablesDBAdapter } from './TablesDBAdapter.js';
export { LegacyAdapter } from './LegacyAdapter.js';

// Convenience exports
export { createDatabaseAdapter, getApiCapabilities } from './AdapterFactory.js';