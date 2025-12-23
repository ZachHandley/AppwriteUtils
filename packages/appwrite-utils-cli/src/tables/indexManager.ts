import type { Index } from "appwrite-utils";
import type { DatabaseAdapter } from "appwrite-utils-helpers";
import type { Models } from "node-appwrite";
import { isIndexEqualToIndex } from "../collections/tableOperations.js";
import { MessageFormatter } from "appwrite-utils-helpers";
import { delay, tryAwaitWithRetry } from "appwrite-utils-helpers";

// Enhanced index operation interfaces
export interface IndexOperation {
  type: 'create' | 'update' | 'skip' | 'delete';
  index: Index;
  existingIndex?: Models.Index;
  reason?: string;
}

export interface IndexOperationPlan {
  toCreate: IndexOperation[];
  toUpdate: IndexOperation[];
  toSkip: IndexOperation[];
  toDelete: IndexOperation[];
}

export interface IndexExecutionResult {
  created: string[];
  updated: string[];
  skipped: string[];
  deleted: string[];
  errors: Array<{ key: string; error: string }>;
  summary: {
    total: number;
    created: number;
    updated: number;
    skipped: number;
    deleted: number;
    errors: number;
  };
}

/**
 * Plan index operations by comparing desired indexes with existing ones
 * Uses the existing isIndexEqualToIndex function for consistent comparison
 */
export function planIndexOperations(
  desiredIndexes: Index[],
  existingIndexes: Models.Index[]
): IndexOperationPlan {
  const plan: IndexOperationPlan = {
    toCreate: [],
    toUpdate: [],
    toSkip: [],
    toDelete: []
  };

  for (const desiredIndex of desiredIndexes) {
    const existingIndex = existingIndexes.find(idx => idx.key === desiredIndex.key);

    if (!existingIndex) {
      // Index doesn't exist - create it
      plan.toCreate.push({
        type: 'create',
        index: desiredIndex,
        reason: 'New index'
      });
    } else if (isIndexEqualToIndex(existingIndex, desiredIndex)) {
      // Index exists and is identical - skip it
      plan.toSkip.push({
        type: 'skip',
        index: desiredIndex,
        existingIndex,
        reason: 'Index unchanged'
      });
    } else {
      // Index exists but is different - update it
      plan.toUpdate.push({
        type: 'update',
        index: desiredIndex,
        existingIndex,
        reason: 'Index configuration changed'
      });
    }
  }

  return plan;
}

/**
 * Plan index deletions for indexes that exist but aren't in the desired configuration
 */
export function planIndexDeletions(
  desiredIndexKeys: Set<string>,
  existingIndexes: Models.Index[]
): IndexOperation[] {
  const deletions: IndexOperation[] = [];

  for (const existingIndex of existingIndexes) {
    if (!desiredIndexKeys.has(existingIndex.key)) {
      deletions.push({
        type: 'delete',
        index: existingIndex as Index, // Convert Models.Index to Index for compatibility
        reason: 'Obsolete index'
      });
    }
  }

  return deletions;
}

/**
 * Execute index operations with proper error handling and status monitoring
 */
export async function executeIndexOperations(
  adapter: DatabaseAdapter,
  databaseId: string,
  tableId: string,
  plan: IndexOperationPlan
): Promise<IndexExecutionResult> {
  const result: IndexExecutionResult = {
    created: [],
    updated: [],
    skipped: [],
    deleted: [],
    errors: [],
    summary: {
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      deleted: 0,
      errors: 0
    }
  };

  // Execute creates
  for (const operation of plan.toCreate) {
    try {
      await adapter.createIndex({
        databaseId,
        tableId,
        key: operation.index.key,
        type: operation.index.type,
        attributes: operation.index.attributes,
        orders: operation.index.orders || []
      });

      result.created.push(operation.index.key);
      MessageFormatter.success(`Created index ${operation.index.key}`, { prefix: 'Indexes' });

      // Wait for index to become available
      await waitForIndexAvailable(adapter, databaseId, tableId, operation.index.key);

      await delay(150); // Brief delay between operations
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push({ key: operation.index.key, error: errorMessage });
      MessageFormatter.error(`Failed to create index ${operation.index.key}`, error instanceof Error ? error : new Error(String(error)), { prefix: 'Indexes' });
    }
  }

  // Execute updates (delete + recreate)
  for (const operation of plan.toUpdate) {
    try {
      // Delete existing index first
      await adapter.deleteIndex({
        databaseId,
        tableId,
        key: operation.index.key
      });

      await delay(100); // Brief delay for deletion to settle

      // Create new index
      await adapter.createIndex({
        databaseId,
        tableId,
        key: operation.index.key,
        type: operation.index.type,
        attributes: operation.index.attributes,
        orders: operation.index.orders || operation.existingIndex?.orders || []
      });

      result.updated.push(operation.index.key);
      MessageFormatter.success(`Updated index ${operation.index.key}`, { prefix: 'Indexes' });

      // Wait for index to become available
      await waitForIndexAvailable(adapter, databaseId, tableId, operation.index.key);

      await delay(150); // Brief delay between operations
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push({ key: operation.index.key, error: errorMessage });
      MessageFormatter.error(`Failed to update index ${operation.index.key}`, error instanceof Error ? error : new Error(String(error)), { prefix: 'Indexes' });
    }
  }

  // Execute skips
  for (const operation of plan.toSkip) {
    result.skipped.push(operation.index.key);
    MessageFormatter.info(`Index ${operation.index.key} unchanged`, { prefix: 'Indexes' });
  }

  // Calculate summary
  result.summary.total = result.created.length + result.updated.length + result.skipped.length + result.deleted.length;
  result.summary.created = result.created.length;
  result.summary.updated = result.updated.length;
  result.summary.skipped = result.skipped.length;
  result.summary.deleted = result.deleted.length;
  result.summary.errors = result.errors.length;

  return result;
}

/**
 * Execute index deletions with proper error handling
 */
export async function executeIndexDeletions(
  adapter: DatabaseAdapter,
  databaseId: string,
  tableId: string,
  deletions: IndexOperation[]
): Promise<{ deleted: string[]; errors: Array<{ key: string; error: string }> }> {
  const result = {
    deleted: [] as string[],
    errors: [] as Array<{ key: string; error: string }>
  };

  for (const operation of deletions) {
    try {
      await adapter.deleteIndex({
        databaseId,
        tableId,
        key: operation.index.key
      });

      result.deleted.push(operation.index.key);
      MessageFormatter.info(`Deleted obsolete index ${operation.index.key}`, { prefix: 'Indexes' });

      // Wait briefly for deletion to settle
      await delay(500);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push({ key: operation.index.key, error: errorMessage });
      MessageFormatter.error(`Failed to delete index ${operation.index.key}`, error instanceof Error ? error : new Error(String(error)), { prefix: 'Indexes' });
    }
  }

  return result;
}

/**
 * Wait for an index to become available with timeout and retry logic
 * This is an adapter-aware version of the logic from collections/indexes.ts
 */
async function waitForIndexAvailable(
  adapter: DatabaseAdapter,
  databaseId: string,
  tableId: string,
  indexKey: string,
  maxWaitTime: number = 60000, // 1 minute
  checkInterval: number = 2000 // 2 seconds
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const indexList = await adapter.listIndexes({ databaseId, tableId });
      const indexes: any[] = (indexList as any).data || (indexList as any).indexes || [];
      const index = indexes.find((idx: any) => idx.key === indexKey);

      if (!index) {
        MessageFormatter.error(`Index '${indexKey}' not found after creation`, undefined, { prefix: 'Indexes' });
        return false;
      }

      switch (index.status) {
        case 'available':
          return true;

        case 'failed':
          MessageFormatter.error(`Index '${indexKey}' failed: ${index.error || 'unknown error'}`, undefined, { prefix: 'Indexes' });
          return false;

        case 'stuck':
          MessageFormatter.warning(`Index '${indexKey}' is stuck`, { prefix: 'Indexes' });
          return false;

        case 'processing':
        case 'deleting':
          // Continue waiting
          break;

        default:
          MessageFormatter.warning(`Unknown status '${index.status}' for index '${indexKey}'`, { prefix: 'Indexes' });
          break;
      }
    } catch (error) {
      MessageFormatter.error(`Error checking index '${indexKey}' status: ${error}`, undefined, { prefix: 'Indexes' });
    }

    await delay(checkInterval);
  }

  MessageFormatter.warning(`Timeout waiting for index '${indexKey}' to become available (${maxWaitTime}ms)`, { prefix: 'Indexes' });
  return false;
}

/**
 * Main function to create/update indexes via adapter
 * This replaces the messy inline code in methods.ts
 */
export async function createOrUpdateIndexesViaAdapter(
  adapter: DatabaseAdapter,
  databaseId: string,
  tableId: string,
  desiredIndexes: Index[],
  configIndexes?: Index[]
): Promise<void> {
  if (!desiredIndexes || desiredIndexes.length === 0) {
    MessageFormatter.info('No indexes to process', { prefix: 'Indexes' });
    return;
  }

  MessageFormatter.info(`Processing ${desiredIndexes.length} indexes for table ${tableId}`, { prefix: 'Indexes' });

  try {
    // Get existing indexes
    const existingIdxRes = await adapter.listIndexes({ databaseId, tableId });
    const existingIndexes: Models.Index[] = (existingIdxRes as any).data || (existingIdxRes as any).indexes || [];

    // Plan operations
    const plan = planIndexOperations(desiredIndexes, existingIndexes);

    // Show plan with icons (consistent with attribute handling)
    const planParts: string[] = [];
    if (plan.toCreate.length) planParts.push(`➕  ${plan.toCreate.length} (${plan.toCreate.map(op => op.index.key).join(', ')})`);
    if (plan.toUpdate.length) planParts.push(`🔧  ${plan.toUpdate.length} (${plan.toUpdate.map(op => op.index.key).join(', ')})`);
    if (plan.toSkip.length) planParts.push(`⏭️  ${plan.toSkip.length}`);

    MessageFormatter.info(`Plan → ${planParts.join('  |  ') || 'no changes'}`, { prefix: 'Indexes' });

    // Execute operations
    const result = await executeIndexOperations(adapter, databaseId, tableId, plan);

    // Show summary
    MessageFormatter.info(
      `Summary → ➕  ${result.summary.created}  |  🔧  ${result.summary.updated}  |  ⏭️  ${result.summary.skipped}`,
      { prefix: 'Indexes' }
    );

    // Handle errors if any
    if (result.errors.length > 0) {
      MessageFormatter.error(`${result.errors.length} index operations failed:`, undefined, { prefix: 'Indexes' });
      for (const error of result.errors) {
        MessageFormatter.error(`  ${error.key}: ${error.error}`, undefined, { prefix: 'Indexes' });
      }
    }

  } catch (error) {
    MessageFormatter.error('Failed to process indexes', error instanceof Error ? error : new Error(String(error)), { prefix: 'Indexes' });
    throw error;
  }
}

/**
 * Handle index deletions for obsolete indexes
 */
export async function deleteObsoleteIndexesViaAdapter(
  adapter: DatabaseAdapter,
  databaseId: string,
  tableId: string,
  desiredIndexKeys: Set<string>
): Promise<void> {
  try {
    // Get existing indexes
    const existingIdxRes = await adapter.listIndexes({ databaseId, tableId });
    const existingIndexes: Models.Index[] = (existingIdxRes as any).data || (existingIdxRes as any).indexes || [];

    // Plan deletions
    const deletions = planIndexDeletions(desiredIndexKeys, existingIndexes);

    if (deletions.length === 0) {
      MessageFormatter.info('Plan → 🗑️  0 indexes', { prefix: 'Indexes' });
      return;
    }

    // Show deletion plan
    MessageFormatter.info(
      `Plan → 🗑️  ${deletions.length} (${deletions.map(op => op.index.key).join(', ')})`,
      { prefix: 'Indexes' }
    );

    // Execute deletions
    const result = await executeIndexDeletions(adapter, databaseId, tableId, deletions);

    // Show results
    if (result.deleted.length > 0) {
      MessageFormatter.success(`Deleted ${result.deleted.length} indexes: ${result.deleted.join(', ')}`, { prefix: 'Indexes' });
    }

    if (result.errors.length > 0) {
      MessageFormatter.error(`${result.errors.length} index deletions failed:`, undefined, { prefix: 'Indexes' });
      for (const error of result.errors) {
        MessageFormatter.error(`  ${error.key}: ${error.error}`, undefined, { prefix: 'Indexes' });
      }
    }

  } catch (error) {
    MessageFormatter.warning(`Could not evaluate index deletions: ${(error as Error)?.message || error}`, { prefix: 'Indexes' });
  }
}