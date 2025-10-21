/**
 * LegacyAdapter - Translation Layer for Legacy Appwrite API
 * 
 * This adapter translates TablesDB-style calls (object notation) to legacy
 * Appwrite Databases API calls (positional parameters). It ensures all internal
 * code can use modern TablesDB patterns while maintaining compatibility with
 * older Appwrite instances.
 */

import { Query } from "node-appwrite";
import { chunk } from "es-toolkit";
import {
  BaseAdapter,
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
  AdapterError,
  UnsupportedOperationError
} from './DatabaseAdapter.js';

/**
 * LegacyAdapter - Translates TablesDB calls to legacy Databases API
 */
export class LegacyAdapter extends BaseAdapter {
  private databases: any;
  
  constructor(client: any) {
    super(client, 'legacy');
    // Assuming Databases service is available on the client
    this.databases = client;
  }
  
  // Row (Document) Operations - Translate object notation to positional parameters
  
  async listRows(params: ListRowsParams): Promise<ApiResponse> {
    try {
      // TablesDB: listRows({ databaseId, tableId, queries })
      // Legacy: listDocuments(databaseId, collectionId, queries)
      const result = await this.databases.listDocuments(
        params.databaseId,
        params.tableId, // Maps tableId to collectionId
        params.queries || []
      );
      
      return {
        data: result.documents,
        rows: result.documents, // Alias for TablesDB compatibility
        documents: result.documents, // Legacy format
        total: result.total
      };
    } catch (error) {
      throw new AdapterError(
        `Failed to list rows (legacy): ${error instanceof Error ? error.message : 'Unknown error'}`,
        'LIST_ROWS_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }
  
  async createRow(params: CreateRowParams): Promise<ApiResponse> {
    try {
      // TablesDB: createRow({ databaseId, tableId, id, data, permissions })
      // Legacy: createDocument(databaseId, collectionId, id, data, permissions)
      const result = await this.databases.createDocument(
        params.databaseId,
        params.tableId, // Maps to collectionId
        params.id,
        params.data,
        params.permissions || []
      );
      
      return {
        data: result,
        rows: [result],
        documents: [result] // Legacy compatibility
      };
    } catch (error) {
      throw new AdapterError(
        `Failed to create row (legacy): ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATE_ROW_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }
  
  async updateRow(params: UpdateRowParams): Promise<ApiResponse> {
    try {
      // TablesDB: updateRow({ databaseId, tableId, id, data, permissions })
      // Legacy: updateDocument(databaseId, collectionId, id, data, permissions)
      const result = await this.databases.updateDocument(
        params.databaseId,
        params.tableId,
        params.id,
        params.data,
        params.permissions || []
      );
      
      return {
        data: result,
        rows: [result],
        documents: [result]
      };
    } catch (error) {
      throw new AdapterError(
        `Failed to update row (legacy): ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UPDATE_ROW_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }
  
  async deleteRow(params: DeleteRowParams): Promise<ApiResponse> {
    try {
      // TablesDB: deleteRow({ databaseId, tableId, id })
      // Legacy: deleteDocument(databaseId, collectionId, id)
      const result = await this.databases.deleteDocument(
        params.databaseId,
        params.tableId,
        params.id
      );
      
      return { data: result };
    } catch (error) {
      throw new AdapterError(
        `Failed to delete row (legacy): ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DELETE_ROW_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }
  
  async getRow(params: { databaseId: string; tableId: string; id: string }): Promise<ApiResponse> {
    try {
      // TablesDB: getRow({ databaseId, tableId, id })
      // Legacy: getDocument(databaseId, collectionId, id)
      const result = await this.databases.getDocument(
        params.databaseId,
        params.tableId,
        params.id
      );
      
      return {
        data: result,
        rows: [result],
        documents: [result]
      };
    } catch (error) {
      throw new AdapterError(
        `Failed to get row (legacy): ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_ROW_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }
  
  // Table (Collection) Operations
  
  async listTables(params: ListTablesParams): Promise<ApiResponse> {
    try {
      // TablesDB: listTables({ databaseId, queries })
      // Legacy: listCollections(databaseId, queries)
      const result = await this.databases.listCollections(
        params.databaseId,
        params.queries || []
      );
      
      return {
        data: result.collections,
        tables: result.collections, // Alias for TablesDB compatibility
        collections: result.collections, // Legacy format
        total: result.total
      };
    } catch (error) {
      throw new AdapterError(
        `Failed to list tables (legacy): ${error instanceof Error ? error.message : 'Unknown error'}`,
        'LIST_TABLES_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }
  
  async createTable(params: CreateTableParams): Promise<ApiResponse> {
    try {
      // TablesDB: createTable({ databaseId, id, name, permissions, documentSecurity, enabled })
      // Legacy: createCollection(databaseId, id, name, permissions, documentSecurity, enabled)
      const result = await this.databases.createCollection(
        params.databaseId,
        params.id,
        params.name,
        params.permissions || [],
        params.documentSecurity ?? false,
        params.enabled ?? true
      );
      
      return {
        data: result,
        tables: [result],
        collections: [result]
      };
    } catch (error) {
      throw new AdapterError(
        `Failed to create table (legacy): ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATE_TABLE_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }
  
  async updateTable(params: UpdateTableParams): Promise<ApiResponse> {
    try {
      // TablesDB: updateTable({ databaseId, id, name, permissions, documentSecurity, enabled })
      // Legacy: updateCollection(databaseId, id, name, permissions, documentSecurity, enabled)
      const result = await this.databases.updateCollection(
        params.databaseId,
        params.id,
        params.name,
        params.permissions || [],
        params.documentSecurity ?? false,
        params.enabled ?? true
      );
      
      return {
        data: result,
        tables: [result],
        collections: [result]
      };
    } catch (error) {
      throw new AdapterError(
        `Failed to update table (legacy): ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UPDATE_TABLE_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }
  
  async deleteTable(params: DeleteTableParams): Promise<ApiResponse> {
    try {
      // TablesDB: deleteTable({ databaseId, tableId })
      // Legacy: deleteCollection(databaseId, collectionId)
      const result = await this.databases.deleteCollection(
        params.databaseId,
        params.tableId
      );
      
      return { data: result };
    } catch (error) {
      throw new AdapterError(
        `Failed to delete table (legacy): ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DELETE_TABLE_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }
  
  async getTable(params: GetTableParams): Promise<ApiResponse> {
    try {
      // TablesDB: getTable({ databaseId, tableId })
      // Legacy: getCollection(databaseId, collectionId)
      const result = await this.databases.getCollection(
        params.databaseId,
        params.tableId
      );
      
      return {
        data: result,
        tables: [result],
        collections: [result]
      };
    } catch (error) {
      throw new AdapterError(
        `Failed to get table (legacy): ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_TABLE_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }
  
  // Index Operations
  
  async listIndexes(params: ListIndexesParams): Promise<ApiResponse> {
    try {
      // TablesDB: listIndexes({ databaseId, tableId, queries })
      // Legacy: listIndexes(databaseId, collectionId, queries)
      const result = await this.databases.listIndexes(
        params.databaseId,
        params.tableId,
        params.queries || []
      );
      
      return {
        data: result.indexes,
        total: result.total
      };
    } catch (error) {
      throw new AdapterError(
        `Failed to list indexes (legacy): ${error instanceof Error ? error.message : 'Unknown error'}`,
        'LIST_INDEXES_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }
  
  async createIndex(params: CreateIndexParams): Promise<ApiResponse> {
    try {
      // TablesDB: createIndex({ databaseId, tableId, key, type, attributes, orders })
      // Legacy: createIndex(databaseId, collectionId, key, type, attributes, orders)
      const result = await this.databases.createIndex(
        params.databaseId,
        params.tableId,
        params.key,
        params.type,
        params.attributes,
        params.orders || []
      );
      
      return { data: result };
    } catch (error) {
      throw new AdapterError(
        `Failed to create index (legacy): ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATE_INDEX_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }
  
  async deleteIndex(params: DeleteIndexParams): Promise<ApiResponse> {
    try {
      // TablesDB: deleteIndex({ databaseId, tableId, key })
      // Legacy: deleteIndex(databaseId, collectionId, key)
      const result = await this.databases.deleteIndex(
        params.databaseId,
        params.tableId,
        params.key
      );
      
      return { data: result };
    } catch (error) {
      throw new AdapterError(
        `Failed to delete index (legacy): ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DELETE_INDEX_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }
  
  // Attribute Operations
  
  async createAttribute(params: CreateAttributeParams): Promise<ApiResponse> {
    try {
      // Legacy attribute creation varies by type, need to map different methods
      let result;
      
      switch (params.type.toLowerCase()) {
        case 'string':
          result = await this.databases.createStringAttribute(
            params.databaseId,
            params.tableId,
            params.key,
            params.size || 255,
            params.required ?? false,
            params.default,
            params.array ?? false,
            params.encrypt ?? false
          );
          break;
          
        case 'integer':
          result = await this.databases.createIntegerAttribute(
            params.databaseId,
            params.tableId,
            params.key,
            params.required ?? false,
            params.min,
            params.max,
            params.default,
            params.array ?? false
          );
          break;
          
        case 'float':
        case 'double':
          result = await this.databases.createFloatAttribute(
            params.databaseId,
            params.tableId,
            params.key,
            params.required ?? false,
            params.min,
            params.max,
            params.default,
            params.array ?? false
          );
          break;
          
        case 'boolean':
          result = await this.databases.createBooleanAttribute(
            params.databaseId,
            params.tableId,
            params.key,
            params.required ?? false,
            params.default,
            params.array ?? false
          );
          break;
          
        case 'datetime':
          result = await this.databases.createDatetimeAttribute(
            params.databaseId,
            params.tableId,
            params.key,
            params.required ?? false,
            params.default,
            params.array ?? false
          );
          break;
          
        case 'email':
          result = await this.databases.createEmailAttribute(
            params.databaseId,
            params.tableId,
            params.key,
            params.required ?? false,
            params.default,
            params.array ?? false
          );
          break;
          
        case 'enum':
          result = await this.databases.createEnumAttribute(
            params.databaseId,
            params.tableId,
            params.key,
            params.elements || [],
            params.required ?? false,
            params.default,
            params.array ?? false
          );
          break;
          
        case 'ip':
          result = await this.databases.createIpAttribute(
            params.databaseId,
            params.tableId,
            params.key,
            params.required ?? false,
            params.default,
            params.array ?? false
          );
          break;
          
        case 'url':
          result = await this.databases.createUrlAttribute(
            params.databaseId,
            params.tableId,
            params.key,
            params.required ?? false,
            params.default,
            params.array ?? false
          );
          break;
          
        case 'relationship':
          result = await this.databases.createRelationshipAttribute(
            params.databaseId,
            params.tableId,
            params.key,
            params.relatedCollection || '',
            params.type || 'oneToOne',
            params.twoWay ?? false,
            params.onDelete || 'restrict'
          );
          break;
          
        default:
          throw new AdapterError(
            `Unsupported attribute type: ${params.type}`,
            'UNSUPPORTED_ATTRIBUTE_TYPE'
          );
      }
      
      return { data: result };
    } catch (error) {
      throw new AdapterError(
        `Failed to create attribute (legacy): ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATE_ATTRIBUTE_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }
  
  async updateAttribute(params: UpdateAttributeParams): Promise<ApiResponse> {
    try {
      // TablesDB: updateAttribute({ databaseId, tableId, key, required, default })
      // Legacy: updateStringAttribute, updateIntegerAttribute, etc.
      // Note: Legacy API has type-specific update methods
      const result = await this.databases.updateStringAttribute(
        params.databaseId,
        params.tableId,
        params.key,
        params.required ?? false,
        params.default
      );
      
      return { data: result };
    } catch (error) {
      throw new AdapterError(
        `Failed to update attribute (legacy): ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UPDATE_ATTRIBUTE_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }
  
  async deleteAttribute(params: DeleteAttributeParams): Promise<ApiResponse> {
    try {
      // TablesDB: deleteAttribute({ databaseId, tableId, key })
      // Legacy: deleteAttribute(databaseId, collectionId, key)
      const result = await this.databases.deleteAttribute(
        params.databaseId,
        params.tableId,
        params.key
      );
      
      return { data: result };
    } catch (error) {
      throw new AdapterError(
        `Failed to delete attribute (legacy): ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DELETE_ATTRIBUTE_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }
  
  // Bulk Operations - Not natively supported in legacy, provide fallback
  
  async bulkCreateRows(params: BulkCreateRowsParams): Promise<ApiResponse> {
    // Legacy doesn't support bulk operations, fallback to individual creates
    const results = [];
    const errors = [];
    
    for (const row of params.rows) {
      try {
        const result = await this.createRow({
          databaseId: params.databaseId,
          tableId: params.tableId,
          id: row.$id || 'unique()', // Generate unique ID if not provided
          data: row,
          permissions: row.$permissions
        });
        results.push(result.data);
      } catch (error) {
        errors.push({ 
          row, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }
    
    if (errors.length > 0) {
      console.warn(`Bulk create had ${errors.length} failures out of ${params.rows.length} total rows`);
    }
    
    return {
      data: results,
      rows: results,
      total: results.length,
      errors: errors.length > 0 ? errors : undefined
    };
  }
  
  async bulkUpsertRows(params: BulkUpsertRowsParams): Promise<ApiResponse> {
    throw new UnsupportedOperationError('bulkUpsertRows', 'legacy');
  }
  
async bulkDeleteRows(params: BulkDeleteRowsParams): Promise<ApiResponse> {
    try {
      let queries: string[];

      // Wipe mode: use Query.limit for deleting without fetching
      if (params.rowIds.length === 0) {
        const batchSize = params.batchSize || 250;
        queries = [Query.limit(batchSize)];
      }
      // Specific IDs mode: chunk into batches of 80-90 to stay within Appwrite limits
      // (max 100 IDs per Query.equal, and queries must be < 4096 chars total)
      else {
        const ID_BATCH_SIZE = 85; // Safe batch size for Query.equal
        const idBatches = chunk(params.rowIds, ID_BATCH_SIZE);
        queries = idBatches.map(batch => Query.equal('$id', batch));
      }

      const result = await this.databases.deleteDocuments(
        params.databaseId,
        params.tableId, // Maps tableId to collectionId
        queries
      );

      return {
        data: result,
        total: params.rowIds.length || (result as any).total || 0
      };
    } catch (error) {
      // If deleteDocuments with queries fails, fall back to individual deletes
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if the error indicates that deleteDocuments with queries is not supported
      if (errorMessage.includes('not supported') || errorMessage.includes('invalid') || errorMessage.includes('queries')) {
        // Fall back to individual deletions
        const results = [];
        const errors = [];

        for (const rowId of params.rowIds) {
          try {
            await this.deleteRow({
              databaseId: params.databaseId,
              tableId: params.tableId,
              id: rowId
            });
            results.push({ id: rowId, deleted: true });
          } catch (individualError) {
            errors.push({
              rowId,
              error: individualError instanceof Error ? individualError.message : 'Unknown error'
            });
          }
        }

        return {
          data: results,
          total: results.length,
          errors: errors.length > 0 ? errors : undefined
        };
      } else {
        // Re-throw the original error if it's not a support issue
        throw new AdapterError(
          `Failed to bulk delete rows (legacy): ${errorMessage}`,
          'BULK_DELETE_ROWS_FAILED',
          error instanceof Error ? error : undefined
        );
      }
    }
  }
  
  // Metadata and Capabilities
  
  getMetadata(): AdapterMetadata {
    return {
      apiMode: 'legacy',
      terminology: {
        container: 'collection',
        item: 'document', 
        service: 'Databases'
      },
      capabilities: {
        bulkOperations: false, // Legacy doesn't support native bulk ops
        advancedQueries: true,
        realtime: true,
        transactions: false
      }
    };
  }
  
  supportsBulkOperations(): boolean {
    return false; // Legacy uses individual operation fallbacks
  }
  
  // Legacy-specific helper methods
  
  /**
   * Check if endpoint supports bulk operations via HTTP (for cloud instances)
   */
  private supportsHttpBulkOperations(endpoint: string): boolean {
    return endpoint.includes('cloud.appwrite.io');
  }
  
  /**
   * Normalize response format to be consistent with TablesDB
   */
  private normalizeResponse(response: any, type: 'row' | 'table'): ApiResponse {
    if (type === 'row') {
      return {
        data: response,
        rows: Array.isArray(response) ? response : [response],
        documents: Array.isArray(response) ? response : [response]
      };
    } else {
      return {
        data: response,
        tables: Array.isArray(response) ? response : [response],
        collections: Array.isArray(response) ? response : [response]
      };
    }
  }
}