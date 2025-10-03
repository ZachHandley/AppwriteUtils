import type { Databases } from "node-appwrite";
import type { DatabaseAdapter } from "../adapters/DatabaseAdapter.js";
import { logger } from "../shared/logging.js";

/**
 * Type guard and validation utilities
 */

/**
 * Type guard to check if object is a DatabaseAdapter
 * @param db - Object to check
 * @returns True if object is DatabaseAdapter
 */
export function isDatabaseAdapter(db: Databases | DatabaseAdapter): db is DatabaseAdapter {
  const isAdapter = 'getMetadata' in db && typeof db.getMetadata === 'function';
  logger.debug('Adapter type detection', {
    isAdapter,
    hasGetMetadata: 'getMetadata' in db,
    getMetadataType: typeof (db as any).getMetadata,
    operation: 'isDatabaseAdapter'
  });
  return isAdapter;
}

/**
 * Type guard to check if object is legacy Databases instance
 * @param db - Object to check
 * @returns True if object is Databases (not DatabaseAdapter)
 */
export function isLegacyDatabases(db: Databases | DatabaseAdapter): db is Databases {
  return !isDatabaseAdapter(db);
}

/**
 * Checks if object has metadata property
 * @param obj - Object to check
 * @returns True if object has metadata
 */
export function hasMetadata(obj: any): boolean {
  return obj && typeof obj === 'object' && 'metadata' in obj;
}

/**
 * Type guard for collection create objects
 * @param obj - Object to check
 * @returns True if object looks like CollectionCreate
 */
export function isCollectionCreate(obj: any): boolean {
  return obj &&
         typeof obj === 'object' &&
         'name' in obj &&
         ('$id' in obj || 'collectionId' in obj);
}

/**
 * Type guard for table create objects
 * @param obj - Object to check
 * @returns True if object looks like TableCreate
 */
export function isTableCreate(obj: any): boolean {
  return obj &&
         typeof obj === 'object' &&
         'name' in obj &&
         ('tableId' in obj || '$id' in obj);
}
