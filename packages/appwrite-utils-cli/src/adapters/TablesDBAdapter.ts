/**
 * TablesDBAdapter - Native TablesDB API Implementation
 * 
 * This adapter provides direct access to the new Appwrite TablesDB API
 * without any translation layer. It uses object notation parameters
 * and returns Models.Row instead of Models.Document.
 */

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
  type ApiResponse,
  type AdapterMetadata,
  AdapterError
} from './DatabaseAdapter.js';

/**
 * TablesDBAdapter implementation for native TablesDB API
 */
export class TablesDBAdapter extends BaseAdapter {
  private tablesDB: any;
  
  constructor(client: any) {
    super(client, 'tablesdb');
    // Assuming TablesDB service is available on the client
    this.tablesDB = client.tablesDB || client;
  }
  
  // Row (Document) Operations
  async listRows(params: ListRowsParams): Promise<ApiResponse> {
    try {
      const result = await this.tablesDB.listRows(params);
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
      const result = await this.tablesDB.createRow(params);
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
      const result = await this.tablesDB.updateRow(params);
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
      const result = await this.tablesDB.deleteRow(params);
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
      const result = await this.tablesDB.getRow(params);
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
      const result = await this.tablesDB.createTable(params);
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
      const result = await this.tablesDB.updateTable(params);
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
      const result = await this.tablesDB.deleteTable(params);
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
      const result = await this.tablesDB.getTable(params);
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
      return {
        data: result.indexes,
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
      const result = await this.tablesDB.createIndex(params);
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
      const result = await this.tablesDB.deleteIndex(params);
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
      // Prefer createColumn if available, fallback to createAttribute
      const fn = this.tablesDB.createColumn || this.tablesDB.createAttribute;
      const result = await fn.call(this.tablesDB, params);
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
      const fn = this.tablesDB.updateColumn || this.tablesDB.updateAttribute;
      const result = await fn.call(this.tablesDB, params);
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
      const fn = this.tablesDB.deleteColumn || this.tablesDB.deleteAttribute;
      const result = await fn.call(this.tablesDB, params);
      return { data: result };
    } catch (error) {
      throw new AdapterError(
        `Failed to delete attribute: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DELETE_ATTRIBUTE_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }
  
  // Bulk Operations (Native TablesDB Support)
  async bulkCreateRows(params: BulkCreateRowsParams): Promise<ApiResponse> {
    try {
      const result = await this.tablesDB.bulkCreateRows(params);
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
      const result = await this.tablesDB.bulkUpsertRows(params);
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
      const result = await this.tablesDB.bulkDeleteRows(params);
      return {
        data: result,
        total: params.rowIds.length
      };
    } catch (error) {
      throw new AdapterError(
        `Failed to bulk delete rows: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
    if (!this.tablesDB.transaction) {
      throw new AdapterError(
        'Transactions are not supported in this TablesDB version',
        'TRANSACTIONS_NOT_SUPPORTED'
      );
    }
    
    try {
      const result = await this.tablesDB.transaction(operations);
      return { data: result };
    } catch (error) {
      throw new AdapterError(
        `Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TRANSACTION_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }
  
  /**
   * Subscribe to real-time updates (if supported)
   */
  subscribeToTable(params: { databaseId: string; tableId: string }, callback: (data: any) => void): () => void {
    if (!this.tablesDB.subscribe) {
      throw new AdapterError(
        'Real-time subscriptions are not supported',
        'REALTIME_NOT_SUPPORTED'
      );
    }
    
    try {
      return this.tablesDB.subscribe(`databases.${params.databaseId}.tables.${params.tableId}.rows`, callback);
    } catch (error) {
      throw new AdapterError(
        `Failed to subscribe to table: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SUBSCRIPTION_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }
  
  /**
   * Get table statistics (if available in TablesDB)
   */
  async getTableStats(params: GetTableParams): Promise<ApiResponse> {
    try {
      if (!this.tablesDB.getTableStats) {
        // Fallback to basic table info
        return this.getTable(params);
      }
      
      const result = await this.tablesDB.getTableStats(params);
      return { data: result };
    } catch (error) {
      throw new AdapterError(
        `Failed to get table stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_TABLE_STATS_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }
}
