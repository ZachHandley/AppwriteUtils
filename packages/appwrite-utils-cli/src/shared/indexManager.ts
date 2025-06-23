import { type Index, type CollectionCreate } from "appwrite-utils";
import { Databases, IndexType, Query, type Models } from "node-appwrite";
import { delay, tryAwaitWithRetry } from "../utils/helperFunctions.js";
import chalk from "chalk";
import pLimit from "p-limit";

// Concurrency limits for different operations
const indexLimit = pLimit(3);     // Low limit for index operations
const queryLimit = pLimit(25);    // Higher limit for read operations

export const indexesSame = (
  databaseIndex: Models.Index,
  configIndex: Index
): boolean => {
  return (
    databaseIndex.key === configIndex.key &&
    databaseIndex.type === configIndex.type &&
    JSON.stringify(databaseIndex.attributes) === JSON.stringify(configIndex.attributes) &&
    JSON.stringify(databaseIndex.orders) === JSON.stringify(configIndex.orders)
  );
};

export const createOrUpdateIndex = async (
  dbId: string,
  db: Databases,
  collectionId: string,
  index: Index,
  options: {
    verbose?: boolean;
    forceRecreate?: boolean;
  } = {}
): Promise<Models.Index | null> => {
  const { verbose = false, forceRecreate = false } = options;

  return await indexLimit(async () => {
    // Check for existing index
    const existingIndexes = await queryLimit(() =>
      tryAwaitWithRetry(async () => 
        await db.listIndexes(dbId, collectionId, [Query.equal("key", index.key)])
      )
    );

    let shouldCreate = false;
    let existingIndex: Models.Index | undefined;

    if (existingIndexes.total > 0) {
      existingIndex = existingIndexes.indexes[0];
      
      if (forceRecreate || !indexesSame(existingIndex, index)) {
        if (verbose) {
          console.log(chalk.yellow(`⚠ Updating index ${index.key} in collection ${collectionId}`));
        }
        
        // Delete existing index
        await tryAwaitWithRetry(async () => {
          await db.deleteIndex(dbId, collectionId, existingIndex!.key);
        });
        
        await delay(500); // Wait for deletion to complete
        shouldCreate = true;
      } else {
        if (verbose) {
          console.log(chalk.green(`✓ Index ${index.key} is up to date`));
        }
        return existingIndex;
      }
    } else {
      shouldCreate = true;
      if (verbose) {
        console.log(chalk.blue(`+ Creating index ${index.key} in collection ${collectionId}`));
      }
    }

    if (shouldCreate) {
      const newIndex = await tryAwaitWithRetry(async () => {
        return await db.createIndex(
          dbId,
          collectionId,
          index.key,
          index.type as IndexType,
          index.attributes,
          index.orders
        );
      });

      if (verbose) {
        console.log(chalk.green(`✓ Created index ${index.key}`));
      }

      return newIndex;
    }

    return null;
  });
};

export const createOrUpdateIndexes = async (
  dbId: string,
  db: Databases,
  collectionId: string,
  indexes: Index[],
  options: {
    verbose?: boolean;
    forceRecreate?: boolean;
  } = {}
): Promise<void> => {
  const { verbose = false } = options;
  
  if (!indexes || indexes.length === 0) {
    return;
  }

  if (verbose) {
    console.log(chalk.blue(`Processing ${indexes.length} indexes for collection ${collectionId}`));
  }

  // Process indexes sequentially to avoid conflicts
  for (const index of indexes) {
    try {
      await createOrUpdateIndex(dbId, db, collectionId, index, options);
      
      // Add delay between index operations to prevent rate limiting
      await delay(250);
    } catch (error) {
      console.error(chalk.red(`❌ Failed to process index ${index.key}:`), error);
      throw error;
    }
  }

  if (verbose) {
    console.log(chalk.green(`✓ Completed processing indexes for collection ${collectionId}`));
  }
};

export const createUpdateCollectionIndexes = async (
  db: Databases,
  dbId: string,
  collection: Models.Collection,
  collectionConfig: CollectionCreate,
  options: {
    verbose?: boolean;
    forceRecreate?: boolean;
  } = {}
): Promise<void> => {
  if (!collectionConfig.indexes) return;

  await createOrUpdateIndexes(
    dbId,
    db,
    collection.$id,
    collectionConfig.indexes,
    options
  );
};

export const deleteObsoleteIndexes = async (
  db: Databases,
  dbId: string,
  collection: Models.Collection,
  collectionConfig: CollectionCreate,
  options: {
    verbose?: boolean;
  } = {}
): Promise<void> => {
  const { verbose = false } = options;

  const configIndexes = collectionConfig.indexes || [];
  const configIndexKeys = new Set(configIndexes.map(index => index.key));

  // Get all existing indexes
  const existingIndexes = await queryLimit(() =>
    tryAwaitWithRetry(async () => 
      await db.listIndexes(dbId, collection.$id)
    )
  );

  // Find indexes that exist in the database but not in the config
  const obsoleteIndexes = existingIndexes.indexes.filter(
    (index) => !configIndexKeys.has(index.key)
  );

  if (obsoleteIndexes.length === 0) {
    return;
  }

  if (verbose) {
    console.log(chalk.yellow(`🗑️ Removing ${obsoleteIndexes.length} obsolete indexes from collection ${collection.name}`));
  }

  // Process deletions with rate limiting
  for (const index of obsoleteIndexes) {
    await indexLimit(async () => {
      await tryAwaitWithRetry(async () => {
        await db.deleteIndex(dbId, collection.$id, index.key);
      });
    });

    if (verbose) {
      console.log(chalk.gray(`🗑️ Deleted obsolete index ${index.key}`));
    }

    await delay(250);
  }
};

export const validateIndexConfiguration = (
  indexes: Index[],
  options: {
    verbose?: boolean;
  } = {}
): { valid: boolean; errors: string[] } => {
  const { verbose = false } = options;
  const errors: string[] = [];

  for (const index of indexes) {
    // Validate required fields
    if (!index.key) {
      errors.push(`Index missing required 'key' field`);
    }

    if (!index.type) {
      errors.push(`Index '${index.key}' missing required 'type' field`);
    }

    if (!index.attributes || index.attributes.length === 0) {
      errors.push(`Index '${index.key}' missing required 'attributes' field`);
    }

    // Validate index type
    const validTypes = Object.values(IndexType);
    if (index.type && !validTypes.includes(index.type as IndexType)) {
      errors.push(`Index '${index.key}' has invalid type '${index.type}'. Valid types: ${validTypes.join(', ')}`);
    }

    // Validate orders array matches attributes length (if provided)
    if (index.orders && index.attributes && index.orders.length !== index.attributes.length) {
      errors.push(`Index '${index.key}' orders array length (${index.orders.length}) does not match attributes array length (${index.attributes.length})`);
    }

    // Check for duplicate keys within the same collection
    const duplicateKeys = indexes.filter(i => i.key === index.key);
    if (duplicateKeys.length > 1) {
      errors.push(`Duplicate index key '${index.key}' found`);
    }
  }

  if (verbose && errors.length > 0) {
    console.log(chalk.red(`❌ Index validation errors:`));
    errors.forEach(error => console.log(chalk.red(`  - ${error}`)));
  }

  return { valid: errors.length === 0, errors };
};