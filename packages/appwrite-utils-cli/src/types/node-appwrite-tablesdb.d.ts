/**
 * Type declarations for optional node-appwrite-tablesdb module
 * This allows compilation when the module is not installed
 */

declare module 'node-appwrite-tablesdb' {
  export class Client {
    setEndpoint(endpoint: string): this;
    setProject(project: string): this;
    setKey(key: string): this;
  }
  
  export class TablesDB {
    constructor(client: Client);
    
    // Core methods based on TablesDB API
    listTables(databaseId: string, queries?: any[]): Promise<any>;
    createTable(databaseId: string, id: string, name: string, permissions?: string[], documentSecurity?: boolean, enabled?: boolean): Promise<any>;
    updateTable(databaseId: string, id: string, name: string, permissions?: string[], documentSecurity?: boolean, enabled?: boolean): Promise<any>;
    deleteTable(databaseId: string, tableId: string): Promise<void>;
    getTable(databaseId: string, tableId: string): Promise<any>;
    
    listRows(databaseId: string, tableId: string, queries?: any[]): Promise<any>;
    createRow(databaseId: string, tableId: string, id: string, data: any, permissions?: string[]): Promise<any>;
    updateRow(databaseId: string, tableId: string, id: string, data?: any, permissions?: string[]): Promise<any>;
    deleteRow(databaseId: string, tableId: string, id: string): Promise<void>;
    getRow(databaseId: string, tableId: string, id: string): Promise<any>;
    
    // Bulk operations (if supported)
    bulkCreateRows?(databaseId: string, tableId: string, rows: any[]): Promise<any>;
    bulkUpsertRows?(databaseId: string, tableId: string, rows: any[]): Promise<any>;
    bulkDeleteRows?(databaseId: string, tableId: string, rowIds: string[]): Promise<any>;
    
    // Index operations
    listIndexes(databaseId: string, tableId: string, queries?: any[]): Promise<any>;
    createIndex(databaseId: string, tableId: string, key: string, type: string, attributes: string[], orders?: string[]): Promise<any>;
    deleteIndex(databaseId: string, tableId: string, key: string): Promise<void>;
    
    // Attribute operations
    createAttribute(databaseId: string, tableId: string, key: string, type: string, ...args: any[]): Promise<any>;
    updateAttribute(databaseId: string, tableId: string, key: string, required?: boolean, defaultValue?: any): Promise<any>;
    deleteAttribute(databaseId: string, tableId: string, key: string): Promise<void>;
  }
}