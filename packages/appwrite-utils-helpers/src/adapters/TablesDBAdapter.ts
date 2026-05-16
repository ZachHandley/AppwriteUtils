/**
 * TablesDBAdapter - Native TablesDB API Implementation
 *
 * This adapter provides direct access to the new Appwrite TablesDB API
 * without any translation layer. It uses object notation parameters
 * and returns Models.Row instead of Models.Document.
 */

import { TablesDBIndexType, OrderBy, Query, RelationMutate, RelationshipType, type Models } from "node-appwrite";
import { chunk } from "es-toolkit";
import {
  BaseAdapter,
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
  type ListColumnsParams,
  type GetColumnParams,
  type ApiResponse,
  type AdapterMetadata,
  AdapterError
} from './DatabaseAdapter.js';
import { type Column } from 'appwrite-utils';
import { TablesDB, Client } from "node-appwrite";

/**
 * TablesDBAdapter implementation for native TablesDB API
 */
export class TablesDBAdapter extends BaseAdapter {
  private tablesDB: TablesDB;

  constructor(client: Client) {
    super(client, 'tablesdb');
    // Assuming TablesDB service is available on the client
    this.tablesDB = new TablesDB(client);
  }

  // Row (Document) Operations
  async listRows(params: ListRowsParams): Promise<ApiResponse> {
    try {
      const result = await this.tablesDB.listRows({
        tableId: params.tableId,
        databaseId: params.databaseId,
        queries: params.queries || [],
      });
      return {
        data: result.rows,
        rows: result.rows,
        total: result.total
      };
    } catch (error) {
      throw new AdapterError(
        `Failed to list rows: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'LIST_ROWS_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  async createRow(params: CreateRowParams): Promise<ApiResponse> {
    try {
      // Remap 'id' to 'rowId' for TablesDB SDK compatibility
      const result = await this.tablesDB.createRow({
        databaseId: params.databaseId,
        tableId: params.tableId,
        rowId: params.id,
        data: params.data,
        permissions: params.permissions
      });
      return {
        data: result,
        rows: [result]
      };
    } catch (error) {
      throw new AdapterError(
        `Failed to create row: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATE_ROW_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  async updateRow(params: UpdateRowParams): Promise<ApiResponse> {
    try {
      const result = await this.tablesDB.updateRow(
        params.databaseId,
        params.tableId,
        params.id,
        params.data,
        params.permissions || []
      );
      return {
        data: result,
        rows: [result]
      };
    } catch (error) {
      throw new AdapterError(
        `Failed to update row: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UPDATE_ROW_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  async deleteRow(params: DeleteRowParams): Promise<ApiResponse> {
    try {
      const result = await this.tablesDB.deleteRow(
        params.databaseId,
        params.tableId,
        params.id
      );
      return { data: result };
    } catch (error) {
      throw new AdapterError(
        `Failed to delete row: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DELETE_ROW_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  async getRow(params: { databaseId: string; tableId: string; id: string }): Promise<ApiResponse> {
    try {
      const result = await this.tablesDB.getRow(
        params.databaseId,
        params.tableId,
        params.id
      );
      return {
        data: result,
        rows: [result]
      };
    } catch (error) {
      throw new AdapterError(
        `Failed to get row: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_ROW_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  // Table (Collection) Operations
  async listTables(params: ListTablesParams): Promise<ApiResponse> {
    try {
      const result = await this.tablesDB.listTables(params);
      return {
        data: result.tables,
        tables: result.tables,
        total: result.total
      };
    } catch (error) {
      throw new AdapterError(
        `Failed to list tables: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'LIST_TABLES_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  async createTable(params: CreateTableParams): Promise<ApiResponse> {
    try {
      const rowSecurity = params.rowSecurity ?? params.documentSecurity ?? false;
      const result = await this.tablesDB.createTable(
        params.databaseId,
        params.id, // tableId
        params.name,
        params.permissions || [],
        rowSecurity,
        params.enabled ?? true
      );
      return {
        data: result,
        tables: [result]
      };
    } catch (error) {
      throw new AdapterError(
        `Failed to create table: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATE_TABLE_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  async updateTable(params: UpdateTableParams): Promise<ApiResponse> {
    try {
      const rowSecurity = params.rowSecurity ?? params.documentSecurity;
      const result = await this.tablesDB.updateTable(
        params.databaseId,
        params.id, // tableId
        params.name,
        params.permissions,
        rowSecurity,
        params.enabled
      );
      return {
        data: result,
        tables: [result]
      };
    } catch (error) {
      throw new AdapterError(
        `Failed to update table: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UPDATE_TABLE_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  async deleteTable(params: DeleteTableParams): Promise<ApiResponse> {
    try {
      const result = await this.tablesDB.deleteTable(
        params.databaseId,
        params.tableId
      );
      return { data: result };
    } catch (error) {
      throw new AdapterError(
        `Failed to delete table: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DELETE_TABLE_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  async getTable(params: GetTableParams): Promise<ApiResponse> {
    try {
      const result = await this.tablesDB.getTable(
        params.databaseId,
        params.tableId
      );
      return {
        data: result,
        tables: [result]
      };
    } catch (error) {
      throw new AdapterError(
        `Failed to get table: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_TABLE_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  // Index Operations
  async listIndexes(params: ListIndexesParams): Promise<ApiResponse> {
    try {
      const result = await this.tablesDB.listIndexes(params);
      // Normalize TablesDB response to expose a consistent 'attributes' array
      const normalized = (result.indexes || []).map((idx: any) => ({
        ...idx,
        attributes: Array.isArray(idx?.attributes) ? idx.attributes : (Array.isArray(idx?.columns) ? idx.columns : []),
        orders: Array.isArray(idx?.orders) ? idx.orders : (Array.isArray(idx?.directions) ? idx.directions : []),
      }));
      return {
        data: normalized,
        total: result.total
      };
    } catch (error) {
      throw new AdapterError(
        `Failed to list indexes: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'LIST_INDEXES_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  async createIndex(params: CreateIndexParams): Promise<ApiResponse> {
    try {
      const result = await this.tablesDB.createIndex({
        databaseId: params.databaseId,
        tableId: params.tableId,
        key: params.key,
        type: params.type as TablesDBIndexType,
        columns: params.attributes,
        orders: (params.orders || []).map(o => o === 'desc' ? OrderBy.Desc : OrderBy.Asc),
        lengths: params.lengths || [],
      });
      return { data: result };
    } catch (error) {
      throw new AdapterError(
        `Failed to create index: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATE_INDEX_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  async deleteIndex(params: DeleteIndexParams): Promise<ApiResponse> {
    try {
      const result = await this.tablesDB.deleteIndex(
        params.databaseId,
        params.tableId,
        params.key
      );
      return { data: result };
    } catch (error) {
      throw new AdapterError(
        `Failed to delete index: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DELETE_INDEX_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  // Attribute Operations
  async createAttribute(params: CreateAttributeParams): Promise<ApiResponse> {
    try {
      // TablesDB exposes type-specific column methods
      // TablesDB uses type-specific column methods
      let result;
      const type = (params.type || "").toLowerCase();
      const required = params.required ?? false;
      const array = params.array ?? false;
      const encrypt = params.encrypt ?? false;
      const normalizedDefault =
        params.default === null || params.default === undefined
          ? undefined
          : params.default;
      const numberDefault =
        typeof normalizedDefault === "number" ? normalizedDefault : undefined;
      const stringDefault =
        typeof normalizedDefault === "string" ? normalizedDefault : undefined;
      const booleanDefault =
        typeof normalizedDefault === "boolean" ? normalizedDefault : undefined;

      switch (type) {
        case 'string':
          result = await this.tablesDB.createStringColumn({
            databaseId: params.databaseId,
            tableId: params.tableId,
            key: params.key,
            size: params.size || 255,
            required: params.required ?? false,
            xdefault: params.default,
            array: params.array ?? false,
            encrypt: params.encrypt ?? false
          });
          break;

        case 'integer':
          result = await this.tablesDB.createIntegerColumn({
            databaseId: params.databaseId,
            tableId: params.tableId,
            key: params.key,
            required: params.required ?? false,
            min: params.min,
            max: params.max,
            xdefault: params.default,
            array: params.array ?? false
          });
          break;

        case 'float':
        case 'double':
          result = await this.tablesDB.createFloatColumn({
            databaseId: params.databaseId,
            tableId: params.tableId,
            key: params.key,
            required: params.required ?? false,
            min: params.min,
            max: params.max,
            xdefault: params.default,
            array: params.array ?? false
          });
          break;

        case 'boolean':
          result = await this.tablesDB.createBooleanColumn({
            databaseId: params.databaseId,
            tableId: params.tableId,
            key: params.key,
            required: params.required ?? false,
            xdefault: params.default,
            array: params.array ?? false
          });
          break;

        case 'datetime':
          result = await this.tablesDB.createDatetimeColumn({
            databaseId: params.databaseId,
            tableId: params.tableId,
            key: params.key,
            required: params.required ?? false,
            xdefault: params.default,
            array: params.array ?? false
          });
          break;

        case 'email':
          result = await this.tablesDB.createEmailColumn({
            databaseId: params.databaseId,
            tableId: params.tableId,
            key: params.key,
            required: params.required ?? false,
            xdefault: params.default,
            array: params.array ?? false
          });
          break;

        case 'enum':
          // Defensive: require non-empty elements
          if (!Array.isArray((params as any).elements) || (params as any).elements.length === 0) {
            throw new AdapterError(
              `Enum '${params.key}' requires a non-empty 'elements' array`,
              'CREATE_ENUM_ELEMENTS_REQUIRED'
            );
          }
          result = await this.tablesDB.createEnumColumn({
            databaseId: params.databaseId,
            tableId: params.tableId,
            key: params.key,
            elements: params.elements!,
            required: params.required ?? false,
            xdefault: params.default,
            array: params.array ?? false
          });
          break;

        case 'ip':
          result = await this.tablesDB.createIpColumn({
            databaseId: params.databaseId,
            tableId: params.tableId,
            key: params.key,
            required: params.required ?? false,
            xdefault: params.default,
            array: params.array ?? false
          });
          break;

        case 'url':
          result = await this.tablesDB.createUrlColumn({
            databaseId: params.databaseId,
            tableId: params.tableId,
            key: params.key,
            required: params.required ?? false,
            xdefault: params.default,
            array: params.array ?? false
          });
          break;

        case 'relationship':
          result = await this.tablesDB.createRelationshipColumn({
            databaseId: params.databaseId,
            tableId: params.tableId,
            key: params.key,
            relatedTableId: params.relatedCollection || '',
            type: (params.relationType || 'oneToOne') as RelationshipType,
            twoWay: params.twoWay ?? false,
            twoWayKey: params.twoWayKey,
            onDelete: (params.onDelete || 'restrict') as RelationMutate
          });
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
        `Failed to create attribute: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATE_ATTRIBUTE_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  async updateAttribute(params: UpdateAttributeParams): Promise<ApiResponse> {
    try {
      // TablesDB uses type-specific update methods with object notation
      // We need to detect the existing column type to use the correct update method
      // For now, we'll need to get the column info first, then use the appropriate update method

      // Get the current table schema to determine the column type
      const tableInfo = await this.tablesDB.getTable(params.databaseId, params.tableId);

      // Find the column to determine its type
      const column = tableInfo.columns?.find(col => col.key === params.key);
      if (!column) {
        throw new AdapterError(
          `Column '${params.key}' not found in table`,
          'COLUMN_NOT_FOUND'
        );
      }

      let result;

      // Use the appropriate updateXColumn method based on the column type
      // Cast column to proper Models type to access its specific properties
      const columnType = (column.type === 'string' && !('format' in column)) || column.type !== 'string' ? column.type : 'enum';

      switch (columnType) {
        case 'string':
          const stringColumn = column as Models.ColumnString;
          result = await this.tablesDB.updateStringColumn({
            databaseId: params.databaseId,
            tableId: params.tableId,
            key: params.key,
            required: params.required !== undefined ? params.required : stringColumn.required,
            xdefault: params.default !== undefined ? params.default : stringColumn.default,
            size: params.size !== undefined ? params.size : stringColumn.size,
          });
          break;

        case 'integer':
          const integerColumn = column as Models.ColumnInteger;
          result = await this.tablesDB.updateIntegerColumn({
            databaseId: params.databaseId,
            tableId: params.tableId,
            key: params.key,
            required: params.required !== undefined ? params.required : integerColumn.required,
            xdefault: params.default !== undefined ? params.default : integerColumn.default,
            // Only send min/max when explicitly provided to avoid resubmitting extreme values
            ...(params.min !== undefined ? { min: params.min } : {}),
            ...(params.max !== undefined ? { max: params.max } : {}),
          });
          break;

        case 'float':
        case 'double':
          const floatColumn = column as Models.ColumnFloat;
          result = await this.tablesDB.updateFloatColumn({
            databaseId: params.databaseId,
            tableId: params.tableId,
            key: params.key,
            required: params.required !== undefined ? params.required : floatColumn.required,
            xdefault: params.default !== undefined ? params.default : floatColumn.default,
            ...(params.min !== undefined ? { min: params.min } : {}),
            ...(params.max !== undefined ? { max: params.max } : {}),
          });
          break;

        case 'boolean':
          const booleanColumn = column as Models.ColumnBoolean;
          result = await this.tablesDB.updateBooleanColumn({
            databaseId: params.databaseId,
            tableId: params.tableId,
            key: params.key,
            required: params.required !== undefined ? params.required : booleanColumn.required,
            xdefault: params.default !== undefined ? params.default : booleanColumn.default
          });
          break;

        case 'datetime':
          const datetimeColumn = column as Models.ColumnDatetime;
          result = await this.tablesDB.updateDatetimeColumn({
            databaseId: params.databaseId,
            tableId: params.tableId,
            key: params.key,
            required: params.required !== undefined ? params.required : datetimeColumn.required,
            xdefault: params.default !== undefined ? params.default : datetimeColumn.default
          });
          break;

        case 'email':
          const emailColumn = column as Models.ColumnEmail;
          result = await this.tablesDB.updateEmailColumn({
            databaseId: params.databaseId,
            tableId: params.tableId,
            key: params.key,
            required: params.required !== undefined ? params.required : emailColumn.required,
            xdefault: params.default !== undefined ? params.default : emailColumn.default
          });
          break;

        case 'enum':
          const enumColumn = column as Models.ColumnEnum;
          // Choose elements to send only when provided, otherwise preserve existing
          const provided = (params as any).elements;
          const existing = (enumColumn as any)?.elements;
          const nextElements = (Array.isArray(provided) && provided.length > 0) ? provided : existing;
          result = await this.tablesDB.updateEnumColumn({
            databaseId: params.databaseId,
            tableId: params.tableId,
            key: params.key,
            required: params.required !== undefined ? params.required : enumColumn.required,
            xdefault: params.default !== undefined ? params.default : enumColumn.default,
            elements: nextElements
          });
          break;

        case 'ip':
          const ipColumn = column as Models.ColumnIp;
          result = await this.tablesDB.updateIpColumn({
            databaseId: params.databaseId,
            tableId: params.tableId,
            key: params.key,
            required: params.required !== undefined ? params.required : ipColumn.required,
            xdefault: params.default !== undefined ? params.default : ipColumn.default
          });
          break;

        case 'url':
          const urlColumn = column as Models.ColumnUrl;
          result = await this.tablesDB.updateUrlColumn({
            databaseId: params.databaseId,
            tableId: params.tableId,
            key: params.key,
            required: params.required !== undefined ? params.required : urlColumn.required,
            xdefault: params.default !== undefined ? params.default : urlColumn.default
          });
          break;

        case 'relationship':
          const relationshipColumn = column as Models.ColumnRelationship;
          result = await this.tablesDB.updateRelationshipColumn({
            databaseId: params.databaseId,
            tableId: params.tableId,
            key: params.key,
            onDelete: (params.onDelete !== undefined ? params.onDelete : relationshipColumn.onDelete) as RelationMutate,
          });
          break;

        default:
          throw new AdapterError(
            `Unsupported column type for update: ${columnType}`,
            'UNSUPPORTED_COLUMN_TYPE'
          );
      }

      return { data: result };
    } catch (error) {
      throw new AdapterError(
        `Failed to update attribute: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UPDATE_ATTRIBUTE_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  async deleteAttribute(params: DeleteAttributeParams): Promise<ApiResponse> {
    try {
      const result = await this.tablesDB.deleteColumn({
        databaseId: params.databaseId,
        tableId: params.tableId,
        key: params.key
      });
      return { data: result };
    } catch (error) {
      throw new AdapterError(
        `Failed to delete attribute: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DELETE_ATTRIBUTE_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  // Column Read Operations (TablesDB v18+ terminology)
  async listColumns(params: ListColumnsParams): Promise<ApiResponse> {
    try {
      const result = await this.tablesDB.listColumns({
        databaseId: params.databaseId,
        tableId: params.tableId,
        queries: params.queries || []
      });
      const columns = (result as any).columns || [];
      return {
        data: columns,
        total: (result as any).total ?? columns.length
      };
    } catch (error) {
      throw new AdapterError(
        `Failed to list columns: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'LIST_COLUMNS_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  async getColumn(params: GetColumnParams): Promise<ApiResponse> {
    try {
      const result = await this.tablesDB.getColumn({
        databaseId: params.databaseId,
        tableId: params.tableId,
        key: params.key
      });
      return { data: result };
    } catch (error) {
      throw new AdapterError(
        `Failed to get column: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_COLUMN_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  // Bulk Operations (Native TablesDB Support)
  async bulkCreateRows(params: BulkCreateRowsParams): Promise<ApiResponse> {
    try {
      const result = await this.tablesDB.createRows(params);
      return {
        data: result.rows,
        rows: result.rows,
        total: result.rows?.length || 0
      };
    } catch (error) {
      throw new AdapterError(
        `Failed to bulk create rows: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'BULK_CREATE_ROWS_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  async bulkUpsertRows(params: BulkUpsertRowsParams): Promise<ApiResponse> {
    try {
      const result = await this.tablesDB.upsertRows(params);
      return {
        data: result.rows,
        rows: result.rows,
        total: result.rows?.length || 0
      };
    } catch (error) {
      throw new AdapterError(
        `Failed to bulk upsert rows: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'BULK_UPSERT_ROWS_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

async bulkDeleteRows(params: BulkDeleteRowsParams): Promise<ApiResponse> {
    try {
      let queries: string[];

      // Wipe mode: use Query.limit for deleting without fetching
      if (params.rowIds.length === 0) {
        const batchSize = params.batchSize || 1000;

        // Validation: Ensure table exists before wiping
        try {
          await this.getTable({
            databaseId: params.databaseId,
            tableId: params.tableId
          });
        } catch (error: any) {
          const errorMessage = error?.message || String(error);
          if (errorMessage.toLowerCase().includes('not found') || error?.code === 404) {
            throw new AdapterError(
              `Table '${params.tableId}' not found in database '${params.databaseId}'`,
              'TABLE_NOT_FOUND',
              error
            );
          }
          throw error; // Re-throw other errors
        }

        queries = [Query.limit(batchSize)];
      }
      // Specific IDs mode: chunk into batches of 80-90 to stay within Appwrite limits
      // (max 100 IDs per Query.equal, and queries must be < 4096 chars total)
      else {
        const ID_BATCH_SIZE = 85; // Safe batch size for Query.equal
        const idBatches = chunk(params.rowIds, ID_BATCH_SIZE);
        queries = idBatches.map(batch => Query.equal('$id', batch));
      }

      const result = await this.tablesDB.deleteRows({
        databaseId: params.databaseId,
        tableId: params.tableId,
        queries: queries
      });

      return {
        data: result,
        total: params.rowIds.length || (result as any).total || 0
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Enhanced error categorization
      if (errorMessage.toLowerCase().includes('not found') || (error as any)?.code === 404) {
        throw new AdapterError(
          `Table or rows not found: ${errorMessage}`,
          'NOT_FOUND',
          error instanceof Error ? error : undefined
        );
      } else if (errorMessage.toLowerCase().includes('permission') || errorMessage.toLowerCase().includes('unauthorized') || (error as any)?.code === 403) {
        throw new AdapterError(
          `Permission denied for bulk delete: ${errorMessage}`,
          'PERMISSION_DENIED',
          error instanceof Error ? error : undefined
        );
      } else if (errorMessage.toLowerCase().includes('rate limit') || (error as any)?.code === 429) {
        throw new AdapterError(
          `Rate limit exceeded during bulk delete: ${errorMessage}`,
          'RATE_LIMIT',
          error instanceof Error ? error : undefined
        );
      }

      throw new AdapterError(
        `Failed to bulk delete rows: ${errorMessage}`,
        'BULK_DELETE_ROWS_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  // Metadata and Capabilities
  getMetadata(): AdapterMetadata {
    return {
      apiMode: 'tablesdb',
      terminology: {
        container: 'table',
        item: 'row',
        service: 'TablesDB'
      },
      capabilities: {
        bulkOperations: true,
        advancedQueries: true,
        realtime: true,
        transactions: true // TablesDB may support transactions
      }
    };
  }

  supportsBulkOperations(): boolean {
    return true; // TablesDB natively supports bulk operations
  }

  // Advanced TablesDB Features

  /**
   * Execute a transaction (if supported by TablesDB)
   */
  async executeTransaction(operations: Array<() => Promise<any>>): Promise<ApiResponse> {
    try {
      // Create a new transaction first
      const transaction = await this.tablesDB.createTransaction();

      // Add operations to the transaction
      const result = await this.tablesDB.createOperations({
        transactionId: transaction.$id,
        operations: operations.map(op => ({ operation: 'execute', fn: op }))
      });

      return { data: result };
    } catch (error) {
      throw new AdapterError(
        `Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TRANSACTION_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }
}
