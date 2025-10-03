import { indexSchema, type Index } from "appwrite-utils";
import { Databases, IndexType, Query, type Models } from "node-appwrite";
import type { DatabaseAdapter } from "../adapters/DatabaseAdapter.js";
import { delay, tryAwaitWithRetry, calculateExponentialBackoff } from "../utils/helperFunctions.js";
import { isLegacyDatabases } from "../utils/typeGuards.js";
import { MessageFormatter } from "../shared/messageFormatter.js";

// Interface for index with status
interface IndexWithStatus {
  key: string;
  type: string;
  status: 'available' | 'processing' | 'deleting' | 'stuck' | 'failed';
  error: string;
  attributes: string[];
  orders?: string[];
  $createdAt: string;
  $updatedAt: string;
}

/**
 * Wait for index to become available, with retry logic for stuck indexes and exponential backoff
 */
const waitForIndexAvailable = async (
  db: Databases | DatabaseAdapter,
  dbId: string,
  collectionId: string,
  indexKey: string,
  maxWaitTime: number = 60000, // 1 minute
  retryCount: number = 0,
  maxRetries: number = 5
): Promise<boolean> => {
  const startTime = Date.now();
  let checkInterval = 2000; // Start with 2 seconds
  
  // Calculate exponential backoff: 2s, 4s, 8s, 16s, 30s (capped at 30s)
  if (retryCount > 0) {
    const exponentialDelay = calculateExponentialBackoff(retryCount);
    await delay(exponentialDelay);
  }

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const indexList = await (isLegacyDatabases(db)
        ? db.listIndexes(dbId, collectionId)
        : (db as DatabaseAdapter).listIndexes({ databaseId: dbId, tableId: collectionId }));
      const indexes: any[] = isLegacyDatabases(db)
        ? (indexList as any).indexes
        : ((indexList as any).data || (indexList as any).indexes || []);
      const index = indexes.find((idx: any) => idx.key === indexKey) as IndexWithStatus | undefined;

      if (!index) {
        MessageFormatter.error(`Index '${indexKey}' not found in database '${dbId}' collection '${collectionId}'`);
        return false;
      }

      switch (index.status) {
        case 'available':
          return true;

        case 'failed':
          MessageFormatter.error(`Index '${indexKey}' failed: ${index.error} (type: ${index.type}, attributes: [${index.attributes.join(', ')}])`);
          return false;

        case 'stuck':
          MessageFormatter.warning(`Index '${indexKey}' is stuck, will retry... (type: ${index.type}, attributes: [${index.attributes.join(', ')}])`);
          return false;

        case 'processing':
          // Continue waiting
          break;

        case 'deleting':
          MessageFormatter.warning(`Index '${indexKey}' is being deleted`);
          break;

        default:
          MessageFormatter.warning(`Unknown status '${index.status}' for index '${indexKey}'`);
          break;
      }
      
      await delay(checkInterval);
    } catch (error) {
      MessageFormatter.error(`Error checking index '${indexKey}' status in database '${dbId}' collection '${collectionId}': ${error}`);
      return false;
    }
  }

  // Timeout reached
  MessageFormatter.warning(`Timeout waiting for index '${indexKey}' (${maxWaitTime}ms)`);

  // If we have retries left and this isn't the last retry, try recreating
  if (retryCount < maxRetries) {
    MessageFormatter.info(`Retrying index '${indexKey}' creation (attempt ${retryCount + 1}/${maxRetries})`);
    return false; // Signal that we need to retry
  }

  return false;
};


/**
 * Enhanced index creation with proper status monitoring and retry logic
 */
export const createOrUpdateIndexWithStatusCheck = async (
  dbId: string,
  db: Databases,
  collectionId: string,
  collection: Models.Collection,
  index: Index,
  retryCount: number = 0,
  maxRetries: number = 3,
): Promise<boolean> => {
  MessageFormatter.info(`Creating/updating index '${index.key}' (attempt ${retryCount + 1}/${maxRetries + 1}) - type: ${index.type}, attributes: [${index.attributes.join(', ')}]`);
  
  try {
    // First, validate that all required attributes exist
    const freshCollection = await db.getCollection(dbId, collectionId);
    const existingAttributeKeys = freshCollection.attributes.map((attr: any) => attr.key);
    
    const missingAttributes = index.attributes.filter(attr => !existingAttributeKeys.includes(attr));

    if (missingAttributes.length > 0) {
      MessageFormatter.error(`Index '${index.key}' cannot be created: missing attributes [${missingAttributes.join(', ')}] (type: ${index.type})`);
      MessageFormatter.error(`Available attributes: [${existingAttributeKeys.join(', ')}]`);
      return false; // Don't retry if attributes are missing
    }
    
    // Try to create/update the index using existing logic
    await createOrUpdateIndex(dbId, db, collectionId, index);
    
    // Now wait for the index to become available
    const success = await waitForIndexAvailable(
      db, 
      dbId, 
      collectionId, 
      index.key, 
      60000, // 1 minute timeout
      retryCount, 
      maxRetries
    );
    
    if (success) {
      return true;
    }
    
    // If not successful and we have retries left, just retry the index creation
    if (retryCount < maxRetries) {
      MessageFormatter.warning(`Index '${index.key}' failed/stuck, retrying (${retryCount + 1}/${maxRetries}) - type: ${index.type}, attributes: [${index.attributes.join(', ')}]`);

      // Wait a bit before retry
      await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));

      // Retry the index creation
      return await createOrUpdateIndexWithStatusCheck(
        dbId,
        db,
        collectionId,
        collection,
        index,
        retryCount + 1,
        maxRetries
      );
    }

    MessageFormatter.error(`Failed to create index '${index.key}' after ${maxRetries + 1} attempts (type: ${index.type}, attributes: [${index.attributes.join(', ')}])`);
    return false;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    MessageFormatter.error(`Error creating index '${index.key}': ${errorMessage} (type: ${index.type}, attributes: [${index.attributes.join(', ')}])`);

    // Check if this is a permanent error that shouldn't be retried
    if (errorMessage.toLowerCase().includes('not found') ||
        errorMessage.toLowerCase().includes('missing') ||
        errorMessage.toLowerCase().includes('does not exist') ||
        errorMessage.toLowerCase().includes('attribute') && errorMessage.toLowerCase().includes('not found')) {
      MessageFormatter.error(`Index '${index.key}' has permanent error - not retrying (type: ${index.type})`);
      return false;
    }

    if (retryCount < maxRetries) {
      MessageFormatter.warning(`Retrying index '${index.key}' due to error... (type: ${index.type}, attributes: [${index.attributes.join(', ')}])`);

      // Wait a bit before retry
      await delay(2000);

      return await createOrUpdateIndexWithStatusCheck(
        dbId,
        db,
        collectionId,
        collection,
        index,
        retryCount + 1,
        maxRetries
      );
    }

    return false;
  }
};

/**
 * Enhanced index creation with status monitoring for all indexes
 */
export const createOrUpdateIndexesWithStatusCheck = async (
  dbId: string,
  db: Databases,
  collectionId: string,
  collection: Models.Collection,
  indexes: Index[]
): Promise<boolean> => {
  MessageFormatter.info(`Creating/updating ${indexes.length} indexes with status monitoring for collection '${collectionId}'`);

  let indexesToProcess = [...indexes];
  let overallRetryCount = 0;
  const maxOverallRetries = 3;

  while (indexesToProcess.length > 0 && overallRetryCount < maxOverallRetries) {
    const remainingIndexes = [...indexesToProcess];
    indexesToProcess = []; // Reset for next iteration

    for (const index of remainingIndexes) {
      const success = await createOrUpdateIndexWithStatusCheck(
        dbId,
        db,
        collectionId,
        collection,
        index
      );

      if (success) {
        MessageFormatter.info(`✅ ${index.key} (${index.type})`);

        // Add delay between successful indexes
        await delay(1000);
      } else {
        MessageFormatter.info(`❌ ${index.key} (${index.type})`);
        indexesToProcess.push(index); // Add back to retry list
      }
    }

    if (indexesToProcess.length === 0) {
      return true;
    }

    overallRetryCount++;

    if (overallRetryCount < maxOverallRetries) {
      MessageFormatter.warning(`⏳ Retrying ${indexesToProcess.length} failed indexes...`);
      await delay(5000);
    }
  }

  // If we get here, some indexes still failed after all retries
  if (indexesToProcess.length > 0) {
    const failedIndexKeys = indexesToProcess.map(i => `${i.key} (${i.type})`).join(', ');
    MessageFormatter.error(`\nFailed to create ${indexesToProcess.length} indexes after ${maxOverallRetries} attempts: ${failedIndexKeys}`);
    MessageFormatter.error(`This may indicate a fundamental issue with the index definitions or Appwrite instance`);
    return false;
  }

  MessageFormatter.success(`\nSuccessfully created all ${indexes.length} indexes for collection '${collectionId}'`);
  return true;
};

export const createOrUpdateIndex = async (
  dbId: string,
  db: Databases,
  collectionId: string,
  index: Index
) => {
  const existingIndex = await db.listIndexes(dbId, collectionId, [
    Query.equal("key", index.key),
  ]);
  
  let createIndex = false;
  let newIndex: Models.Index | null = null;
  
  if (existingIndex.total === 0) {
    // No existing index, create it
    createIndex = true;
  } else if (
    !existingIndex.indexes.some(
      (existingIndex) =>
        (existingIndex.key === index.key &&
          existingIndex.type === index.type &&
          existingIndex.attributes === index.attributes)
    )
  ) {
    // Existing index doesn't match, delete and recreate
    await db.deleteIndex(dbId, collectionId, existingIndex.indexes[0].key);
    createIndex = true;
  }
  
  if (createIndex) {
    // Ensure orders array exists and matches attributes length
    // Default to "asc" for each attribute if not specified
    const orders = index.orders && index.orders.length === index.attributes.length
      ? index.orders
      : index.attributes.map(() => "asc");

    newIndex = await db.createIndex(
      dbId,
      collectionId,
      index.key,
      index.type as IndexType,
      index.attributes,
      orders
    );
  }
  
  return newIndex;
};

export const createOrUpdateIndexes = async (
  dbId: string,
  db: Databases,
  collectionId: string,
  indexes: Index[]
) => {
  for (const index of indexes) {
    await tryAwaitWithRetry(
      async () => await createOrUpdateIndex(dbId, db, collectionId, index)
    );
    // Add delay after each index creation/update
    await delay(500);
  }
};
