import { indexSchema, type Index } from "appwrite-utils";
import { Databases, IndexType, Query, type Models } from "node-appwrite";
import { delay, tryAwaitWithRetry } from "../utils/helperFunctions.js";
import chalk from "chalk";

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
  db: Databases,
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
    const exponentialDelay = Math.min(2000 * Math.pow(2, retryCount), 30000);
    console.log(chalk.blue(`Waiting for index '${indexKey}' to become available (retry ${retryCount}, backoff: ${exponentialDelay}ms)...`));
    await delay(exponentialDelay);
  } else {
    console.log(chalk.blue(`Waiting for index '${indexKey}' to become available...`));
  }
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const indexList = await db.listIndexes(dbId, collectionId);
      const index = indexList.indexes.find(
        (idx: any) => idx.key === indexKey
      ) as IndexWithStatus | undefined;
      
      if (!index) {
        console.log(chalk.red(`Index '${indexKey}' not found`));
        return false;
      }
      
      console.log(chalk.gray(`Index '${indexKey}' status: ${index.status}`));
      
      switch (index.status) {
        case 'available':
          console.log(chalk.green(`✅ Index '${indexKey}' is now available`));
          return true;
          
        case 'failed':
          console.log(chalk.red(`❌ Index '${indexKey}' failed: ${index.error}`));
          return false;
          
        case 'stuck':
          console.log(chalk.yellow(`⚠️ Index '${indexKey}' is stuck, will retry...`));
          return false;
          
        case 'processing':
          // Continue waiting
          break;
          
        case 'deleting':
          console.log(chalk.yellow(`Index '${indexKey}' is being deleted`));
          break;
          
        default:
          console.log(chalk.yellow(`Unknown status '${index.status}' for index '${indexKey}'`));
          break;
      }
      
      await delay(checkInterval);
    } catch (error) {
      console.log(chalk.red(`Error checking index status: ${error}`));
      return false;
    }
  }
  
  // Timeout reached
  console.log(chalk.yellow(`⏰ Timeout waiting for index '${indexKey}' (${maxWaitTime}ms)`));
  
  // If we have retries left and this isn't the last retry, try recreating
  if (retryCount < maxRetries) {
    console.log(chalk.yellow(`🔄 Retrying index creation (attempt ${retryCount + 1}/${maxRetries})`));
    return false; // Signal that we need to retry
  }
  
  return false;
};

/**
 * Delete collection and recreate for index retry (reused from attributes.ts)
 */
const deleteAndRecreateCollectionForIndex = async (
  db: Databases,
  dbId: string,
  collection: Models.Collection,
  retryCount: number
): Promise<Models.Collection | null> => {
  try {
    console.log(chalk.yellow(`🗑️ Deleting collection '${collection.name}' for index retry ${retryCount}`));
    
    // Delete the collection
    await db.deleteCollection(dbId, collection.$id);
    console.log(chalk.yellow(`Deleted collection '${collection.name}'`));
    
    // Wait a bit before recreating
    await delay(2000);
    
    // Recreate the collection
    console.log(chalk.blue(`🔄 Recreating collection '${collection.name}'`));
    const newCollection = await db.createCollection(
      dbId,
      collection.$id,
      collection.name,
      collection.$permissions,
      collection.documentSecurity,
      collection.enabled
    );
    
    console.log(chalk.green(`✅ Recreated collection '${collection.name}'`));
    return newCollection;
    
  } catch (error) {
    console.log(chalk.red(`Failed to delete/recreate collection '${collection.name}': ${error}`));
    return null;
  }
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
  maxRetries: number = 5
): Promise<boolean> => {
  console.log(chalk.blue(`Creating/updating index '${index.key}' (attempt ${retryCount + 1}/${maxRetries + 1})`));
  
  try {
    // First, try to create/update the index using existing logic
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
    
    // If not successful and we have retries left, delete collection and try again
    if (retryCount < maxRetries) {
      console.log(chalk.yellow(`Index '${index.key}' failed/stuck, retrying...`));
      
      // Get fresh collection data
      const freshCollection = await db.getCollection(dbId, collectionId);
      
      // Delete and recreate collection
      const newCollection = await deleteAndRecreateCollectionForIndex(db, dbId, freshCollection, retryCount + 1);
      
      if (newCollection) {
        // Retry with the new collection
        return await createOrUpdateIndexWithStatusCheck(
          dbId, 
          db, 
          newCollection.$id, 
          newCollection, 
          index, 
          retryCount + 1, 
          maxRetries
        );
      }
    }
    
    console.log(chalk.red(`❌ Failed to create index '${index.key}' after ${maxRetries + 1} attempts`));
    return false;
    
  } catch (error) {
    console.log(chalk.red(`Error creating index '${index.key}': ${error}`));
    
    if (retryCount < maxRetries) {
      console.log(chalk.yellow(`Retrying index '${index.key}' due to error...`));
      
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
  console.log(chalk.blue(`Creating/updating ${indexes.length} indexes with status monitoring...`));
  
  const failedIndexes: string[] = [];
  
  for (const index of indexes) {
    console.log(chalk.blue(`\n--- Processing index: ${index.key} ---`));
    
    const success = await createOrUpdateIndexWithStatusCheck(
      dbId, 
      db, 
      collectionId, 
      collection, 
      index
    );
    
    if (success) {
      console.log(chalk.green(`✅ Successfully created index: ${index.key}`));
      
      // Add delay between successful indexes
      await delay(1000);
    } else {
      console.log(chalk.red(`❌ Failed to create index: ${index.key}`));
      failedIndexes.push(index.key);
    }
  }
  
  if (failedIndexes.length > 0) {
    console.log(chalk.red(`\n❌ Failed to create ${failedIndexes.length} indexes: ${failedIndexes.join(', ')}`));
    return false;
  }
  
  console.log(chalk.green(`\n✅ Successfully created all ${indexes.length} indexes`));
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
  if (
    existingIndex.total > 0 &&
    !existingIndex.indexes.some(
      (existingIndex) =>
        (existingIndex.key === index.key &&
          existingIndex.type === index.type &&
          existingIndex.attributes === index.attributes) ||
        JSON.stringify(existingIndex) === JSON.stringify(index)
    )
  ) {
    await db.deleteIndex(dbId, collectionId, existingIndex.indexes[0].key);
    createIndex = true;
  }
  if (createIndex) {
    newIndex = await db.createIndex(
      dbId,
      collectionId,
      index.key,
      index.type as IndexType,
      index.attributes,
      index.orders
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
