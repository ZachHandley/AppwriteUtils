/**
 * DatabaseAdapter Interface - Unified API for Appwrite Database Operations
 * 
 * This interface provides a unified way to interact with both legacy Appwrite
 * (collections/documents) and new TablesDB (tables/rows) APIs. All internal
 * code uses TablesDB-style method signatures for consistency.
 */

import type { Client } from "node-appwrite";
import type { ApiMode } from "../utils/versionDetection.js";

// Base parameter types using TablesDB terminology
export interface CreateRowParams {
  databaseId: string;
  tableId: string;
  id: string;
  data: any;
  permissions?: string[];
}

export interface UpdateRowParams {
  databaseId: string;
  tableId: string;
  id: string;
  data?: any;
  permissions?: string[];
}

export interface ListRowsParams {
  databaseId: string;
  tableId: string;
  queries?: any[];
}

export interface DeleteRowParams {
  databaseId: string;
  tableId: string;
  id: string;
}

export interface CreateTableParams {
  databaseId: string;
  id: string;
  name: string;
  permissions?: string[];
  documentSecurity?: boolean;
  rowSecurity?: boolean;
  enabled?: boolean;
}

export interface UpdateTableParams {
  databaseId: string;
  id: string;
  name: string;
  permissions?: string[];
  documentSecurity?: boolean;
  rowSecurity?: boolean;
  enabled?: boolean;
}

export interface ListTablesParams {
  databaseId: string;
  queries?: any[];
}

export interface DeleteTableParams {
  databaseId: string;
  tableId: string;
}

export interface GetTableParams {
  databaseId: string;
  tableId: string;
}

// Bulk operation parameters
export interface BulkCreateRowsParams {
  databaseId: string;
  tableId: string;
  rows: any[];
}

export interface BulkUpsertRowsParams {
  databaseId: string;
  tableId: string;
  rows: any[];
}

export interface BulkDeleteRowsParams {
  databaseId: string;
  tableId: string;
  rowIds: string[]; // Empty array = wipe mode (use Query.limit), otherwise specific IDs to delete
  batchSize?: number; // Optional batch size for wipe mode (default 250)
}

// Index operation parameters  
export interface CreateIndexParams {
  databaseId: string;
  tableId: string;
  key: string;
  type: string;
  attributes: string[];
  orders?: string[];
}

export interface ListIndexesParams {
  databaseId: string;
  tableId: string;
  queries?: any[];
}

export interface DeleteIndexParams {
  databaseId: string;
  tableId: string;
  key: string;
}

// Attribute operation parameters
export interface CreateAttributeParams {
  databaseId: string;
  tableId: string;
  key: string;
  type: string;
  size?: number;
  required?: boolean;
  default?: any;
  array?: boolean;
  encrypt?: boolean;
  // Additional type-specific parameters
  [key: string]: any;
}

export interface UpdateAttributeParams {
  databaseId: string;
  tableId: string;
  key: string;
  type?: string;
  required?: boolean;
  default?: any;
  size?: number;
  min?: number;
  max?: number;
  array?: boolean;
  encrypt?: boolean;
  elements?: string[];
  relatedCollection?: string;
  relationType?: string;
  twoWay?: boolean;
  twoWayKey?: string;
  onDelete?: string;
}

export interface DeleteAttributeParams {
  databaseId: string;
  tableId: string;
  key: string;
}

// Response types with conditional typing
export interface ApiResponse<T = any> {
  data?: T;
  total?: number;
  documents?: T[]; // Legacy compatibility
  rows?: T[]; // TablesDB format
  collections?: T[]; // Legacy format
  tables?: T[]; // TablesDB format
  errors?: any[]; // For bulk operation errors
}

// Metadata about the adapter
export interface AdapterMetadata {
  apiMode: ApiMode;
  terminology: {
    container: 'collection' | 'table';
    item: 'document' | 'row';
    service: 'Databases' | 'TablesDB';
  };
  capabilities: {
    bulkOperations: boolean;
    advancedQueries: boolean;
    realtime: boolean;
    transactions?: boolean;
  };
}

/**
 * Main DatabaseAdapter interface - all implementations must support these methods
 */
export interface DatabaseAdapter {
  // Row (Document) operations - TablesDB-style signatures
  listRows(params: ListRowsParams): Promise<ApiResponse>;
  createRow(params: CreateRowParams): Promise<ApiResponse>;
  updateRow(params: UpdateRowParams): Promise<ApiResponse>;
  deleteRow(params: DeleteRowParams): Promise<ApiResponse>;
  getRow(params: { databaseId: string; tableId: string; id: string }): Promise<ApiResponse>;
  
  // Table (Collection) operations - TablesDB-style signatures
  listTables(params: ListTablesParams): Promise<ApiResponse>;
  createTable(params: CreateTableParams): Promise<ApiResponse>;
  updateTable(params: UpdateTableParams): Promise<ApiResponse>;
  deleteTable(params: DeleteTableParams): Promise<ApiResponse>;
  getTable(params: GetTableParams): Promise<ApiResponse>;
  
  // Index operations
  listIndexes(params: ListIndexesParams): Promise<ApiResponse>;
  createIndex(params: CreateIndexParams): Promise<ApiResponse>;
  deleteIndex(params: DeleteIndexParams): Promise<ApiResponse>;
  
  // Attribute operations
  createAttribute(params: CreateAttributeParams): Promise<ApiResponse>;
  updateAttribute(params: UpdateAttributeParams): Promise<ApiResponse>;
  deleteAttribute(params: DeleteAttributeParams): Promise<ApiResponse>;
  
  // Bulk operations (when supported)
  bulkCreateRows?(params: BulkCreateRowsParams): Promise<ApiResponse>;
  bulkUpsertRows?(params: BulkUpsertRowsParams): Promise<ApiResponse>;
  bulkDeleteRows?(params: BulkDeleteRowsParams): Promise<ApiResponse>;
  
  // Adapter metadata
  getMetadata(): AdapterMetadata;
  
  // Utility methods
  supportsBulkOperations(): boolean;
  getApiMode(): ApiMode;
  getTerminology(): AdapterMetadata['terminology'];
  
  // Raw client access for advanced operations
  getRawClient(): any;
}

/**
 * Base adapter class with common functionality
 */
export abstract class BaseAdapter implements DatabaseAdapter {
  protected client: Client;
  protected apiMode: ApiMode;
  
  constructor(client: Client, apiMode: ApiMode) {
    this.client = client;
    this.apiMode = apiMode;
  }
  
  // Abstract methods that must be implemented by concrete adapters
  abstract listRows(params: ListRowsParams): Promise<ApiResponse>;
  abstract createRow(params: CreateRowParams): Promise<ApiResponse>;
  abstract updateRow(params: UpdateRowParams): Promise<ApiResponse>;
  abstract deleteRow(params: DeleteRowParams): Promise<ApiResponse>;
  abstract getRow(params: { databaseId: string; tableId: string; id: string }): Promise<ApiResponse>;
  
  abstract listTables(params: ListTablesParams): Promise<ApiResponse>;
  abstract createTable(params: CreateTableParams): Promise<ApiResponse>;
  abstract updateTable(params: UpdateTableParams): Promise<ApiResponse>;
  abstract deleteTable(params: DeleteTableParams): Promise<ApiResponse>;
  abstract getTable(params: GetTableParams): Promise<ApiResponse>;
  
  abstract listIndexes(params: ListIndexesParams): Promise<ApiResponse>;
  abstract createIndex(params: CreateIndexParams): Promise<ApiResponse>;
  abstract deleteIndex(params: DeleteIndexParams): Promise<ApiResponse>;
  
  abstract createAttribute(params: CreateAttributeParams): Promise<ApiResponse>;
  abstract updateAttribute(params: UpdateAttributeParams): Promise<ApiResponse>;
  abstract deleteAttribute(params: DeleteAttributeParams): Promise<ApiResponse>;
  
  abstract getMetadata(): AdapterMetadata;
  
  // Common implementations
  getApiMode(): ApiMode {
    return this.apiMode;
  }
  
  getRawClient(): any {
    return this.client;
  }
  
  supportsBulkOperations(): boolean {
    return this.getMetadata().capabilities.bulkOperations;
  }
  
  getTerminology(): AdapterMetadata['terminology'] {
    return this.getMetadata().terminology;
  }
}

/**
 * Error types for adapter operations
 */
export class AdapterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}

export class UnsupportedOperationError extends AdapterError {
  constructor(operation: string, apiMode: ApiMode) {
    super(
      `Operation '${operation}' is not supported in ${apiMode} mode`,
      'UNSUPPORTED_OPERATION'
    );
    this.name = 'UnsupportedOperationError';
  }
}
