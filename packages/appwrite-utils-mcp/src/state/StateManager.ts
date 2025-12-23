/**
 * State manager for MCP server state
 * @packageDocumentation
 */

/**
 * Operation record for tracking MCP tool invocations
 */
export interface OperationRecord {
  tool: string;
  params: unknown;
  success: boolean;
  timestamp: number;
  error?: string;
}

/**
 * Database metadata for caching
 */
export interface DatabaseMetadata {
  $id: string;
  name: string;
}

/**
 * Table metadata for caching
 */
export interface TableMetadata {
  $id: string;
  name: string;
  databaseId: string;
}

/**
 * Bucket metadata for caching
 */
export interface BucketMetadata {
  $id: string;
  name: string;
  fileSecurity: boolean;
  enabled: boolean;
}

/**
 * State manager for tracking MCP server operations and caching metadata.
 *
 * This manager provides:
 * - Operation history tracking for debugging and monitoring
 * - Database/table list caching for quick lookups
 * - In-memory state management with simple API
 *
 * @example
 * ```typescript
 * const stateManager = new StateManager();
 *
 * // Record an operation
 * stateManager.recordOperation('list_databases', { projectId: 'my-project' }, true);
 *
 * // Cache databases
 * stateManager.cacheDatabases([
 *   { $id: 'db1', name: 'Main Database' },
 *   { $id: 'db2', name: 'Test Database' }
 * ]);
 *
 * // Retrieve cached databases
 * const databases = stateManager.getDatabases();
 * ```
 */
export class StateManager {
  private operations: OperationRecord[];
  private databases: DatabaseMetadata[] | undefined;
  private tables: Map<string, TableMetadata[]>; // databaseId -> tables
  private buckets: BucketMetadata[] | undefined;
  private readonly MAX_OPERATIONS = 100; // Keep last 100 operations

  constructor() {
    this.operations = [];
    this.databases = undefined;
    this.tables = new Map();
    this.buckets = undefined;
  }

  /**
   * Record an operation invocation.
   *
   * @param tool - Name of the MCP tool that was invoked
   * @param params - Parameters passed to the tool
   * @param success - Whether the operation succeeded
   * @param error - Optional error message if operation failed
   */
  recordOperation(
    tool: string,
    params: unknown,
    success: boolean,
    error?: string
  ): void {
    const record: OperationRecord = {
      tool,
      params,
      success,
      timestamp: Date.now(),
      error
    };

    this.operations.push(record);

    // Keep only the most recent operations
    if (this.operations.length > this.MAX_OPERATIONS) {
      this.operations.shift();
    }
  }

  /**
   * Get recent operations.
   *
   * @param limit - Maximum number of operations to return (default: 10)
   * @returns Array of operation records, most recent first
   */
  getRecentOperations(limit: number = 10): OperationRecord[] {
    return this.operations.slice(-limit).reverse();
  }

  /**
   * Get operations for a specific tool.
   *
   * @param tool - Tool name to filter by
   * @param limit - Maximum number of operations to return (default: 10)
   * @returns Array of operation records for the specified tool
   */
  getOperationsByTool(tool: string, limit: number = 10): OperationRecord[] {
    return this.operations
      .filter(op => op.tool === tool)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get operation statistics.
   *
   * @returns Object with success/failure counts and recent error rate
   */
  getOperationStats(): {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
  } {
    const total = this.operations.length;
    const successful = this.operations.filter(op => op.success).length;
    const failed = total - successful;

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? successful / total : 0
    };
  }

  /**
   * Clear operation history.
   */
  clearOperations(): void {
    this.operations = [];
  }

  /**
   * Cache database list.
   *
   * @param databases - Array of database metadata objects
   */
  cacheDatabases(databases: DatabaseMetadata[]): void {
    this.databases = databases;
  }

  /**
   * Get cached databases.
   *
   * @returns Array of cached database metadata, or undefined if not cached
   */
  getDatabases(): DatabaseMetadata[] | undefined {
    return this.databases;
  }

  /**
   * Cache table list for a specific database.
   *
   * @param databaseId - Database ID to cache tables for
   * @param tables - Array of table metadata objects
   */
  cacheTables(databaseId: string, tables: TableMetadata[]): void {
    this.tables.set(databaseId, tables);
  }

  /**
   * Get cached tables for a specific database.
   *
   * @param databaseId - Database ID to retrieve tables for
   * @returns Array of cached table metadata, or undefined if not cached
   */
  getTables(databaseId: string): TableMetadata[] | undefined {
    return this.tables.get(databaseId);
  }

  /**
   * Cache bucket list.
   *
   * @param buckets - Array of bucket metadata objects
   */
  cacheBuckets(buckets: BucketMetadata[]): void {
    this.buckets = buckets;
  }

  /**
   * Get cached buckets.
   *
   * @returns Array of cached bucket metadata, or undefined if not cached
   */
  getBuckets(): BucketMetadata[] | undefined {
    return this.buckets;
  }

  /**
   * Invalidate database cache.
   */
  invalidateDatabases(): void {
    this.databases = undefined;
  }

  /**
   * Invalidate table cache for a specific database.
   *
   * @param databaseId - Optional database ID. If not provided, clears all table caches.
   */
  invalidateTables(databaseId?: string): void {
    if (databaseId) {
      this.tables.delete(databaseId);
    } else {
      this.tables.clear();
    }
  }

  /**
   * Invalidate bucket cache.
   */
  invalidateBuckets(): void {
    this.buckets = undefined;
  }

  /**
   * Invalidate all caches.
   */
  invalidateAll(): void {
    this.databases = undefined;
    this.tables.clear();
    this.buckets = undefined;
  }

  /**
   * Get cache statistics.
   *
   * @returns Object with cache statistics
   */
  getCacheStats(): {
    hasDatabases: boolean;
    databaseCount: number;
    tablesCachedForDatabases: number;
    totalCachedTables: number;
    hasBuckets: boolean;
    bucketCount: number;
  } {
    const tablesCachedForDatabases = this.tables.size;
    let totalCachedTables = 0;

    for (const tables of this.tables.values()) {
      totalCachedTables += tables.length;
    }

    return {
      hasDatabases: this.databases !== undefined,
      databaseCount: this.databases?.length ?? 0,
      tablesCachedForDatabases,
      totalCachedTables,
      hasBuckets: this.buckets !== undefined,
      bucketCount: this.buckets?.length ?? 0
    };
  }

  /**
   * Get current state snapshot for debugging.
   *
   * @returns Object containing current state
   */
  getStateSnapshot(): {
    operationCount: number;
    recentOperations: OperationRecord[];
    cacheStats: {
      hasDatabases: boolean;
      databaseCount: number;
      tablesCachedForDatabases: number;
      totalCachedTables: number;
      hasBuckets: boolean;
      bucketCount: number;
    };
    operationStats: {
      total: number;
      successful: number;
      failed: number;
      successRate: number;
    };
  } {
    return {
      operationCount: this.operations.length,
      recentOperations: this.getRecentOperations(5),
      cacheStats: this.getCacheStats(),
      operationStats: this.getOperationStats()
    };
  }
}
