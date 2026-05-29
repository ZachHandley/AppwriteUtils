import { Query, type Databases, type Models } from "node-appwrite";
import type { Attribute } from "appwrite-utils";
import { createOrUpdateAttributeWithStatusCheck } from "../collections/columns.js";
import { fetchAndCacheCollectionByName } from "../collections/methods.js";
import { tryAwaitWithRetry } from "../index.js";
import type { DatabaseAdapter } from "../index.js";
import { logger, MessageFormatter } from "../index.js";

export interface QueuedOperation {
  type: "attribute";
  collectionId?: string;
  attribute?: Attribute;
  collection?: Models.Collection;
  dependencies?: string[];
}

// Global state management
export const queuedOperations: QueuedOperation[] = [];
export const nameToIdMapping: Map<string, string> = new Map();
// Keys are scoped per database to avoid cross-database collisions
// Collections key format: `${databaseId}::${collectionId}`
// Attributes key format: `${databaseId}::${collectionId}::${attributeKey}`
export const processedCollections: Set<string> = new Set();
export const processedAttributes: Set<string> = new Set();

// Helpers to build scoped keys
const collectionKey = (databaseId: string, collectionId: string) => `${databaseId}::${collectionId}`;
const attributeKeyScoped = (databaseId: string, collectionId: string, key: string) => `${databaseId}::${collectionId}::${key}`;

export const enqueueOperation = (operation: QueuedOperation) => {
  // Avoid duplicate queue entries for same attribute
  const attributeKey = operation.attribute?.key;
  const collectionId = operation.collectionId;

  logger.info('Enqueueing operation', {
    type: operation.type,
    attributeKey,
    collectionId,
    dependencies: operation.dependencies,
    queueSizeBefore: queuedOperations.length,
    operation: 'enqueueOperation'
  });

  if (attributeKey && collectionId) {
    const duplicateIndex = queuedOperations.findIndex(
      (op) => op.collectionId === collectionId && op.attribute?.key === attributeKey
    );

    if (duplicateIndex !== -1) {
      MessageFormatter.info(`Replacing existing queue entry for attribute: ${attributeKey}`);
      logger.info('Replacing duplicate queue entry', {
        attributeKey,
        collectionId,
        duplicateIndex,
        operation: 'enqueueOperation'
      });
      queuedOperations[duplicateIndex] = operation;
      return;
    }
  }

  queuedOperations.push(operation);
  logger.debug('Operation enqueued successfully', {
    attributeKey,
    collectionId,
    queueSizeAfter: queuedOperations.length,
    operation: 'enqueueOperation'
  });
};

/**
 * Clear all caches and processing state - use between operations
 */
export const clearProcessingState = () => {
  const sizeBefore = {
    collections: processedCollections.size,
    attributes: processedAttributes.size,
    nameMapping: nameToIdMapping.size
  };

  processedCollections.clear();
  processedAttributes.clear();
  nameToIdMapping.clear();

  logger.debug("Cleared processing state caches", { operation: "clearProcessingState", sizeBefore });
  logger.info('Processing state cleared', {
    sizeBefore,
    operation: 'clearProcessingState'
  });
};

/**
 * Check if a collection has already been fully processed
 */
export const isCollectionProcessed = (collectionId: string, databaseId: string): boolean => {
  return processedCollections.has(collectionKey(databaseId, collectionId));
};

/**
 * Mark a collection as fully processed
 */
export const markCollectionProcessed = (collectionId: string, collectionName: string | undefined, databaseId: string) => {
  processedCollections.add(collectionKey(databaseId, collectionId));

  const logData = {
    databaseId,
    collectionId,
    collectionName,
    totalProcessedCollections: processedCollections.size,
    operation: 'markCollectionProcessed'
  };

  if (collectionName) {
    MessageFormatter.success(`Marked collection '${collectionName}' (${collectionId}) as processed`, { prefix: 'Tables' });
  }

  logger.info('Collection marked as processed', logData);
};

/**
 * Check if a specific attribute has been processed
 */
export const isAttributeProcessed = (databaseId: string, collectionId: string, attributeKey: string): boolean => {
  return processedAttributes.has(attributeKeyScoped(databaseId, collectionId, attributeKey));
};

/**
 * Mark a specific attribute as processed
 */
export const markAttributeProcessed = (databaseId: string, collectionId: string, attributeKey: string) => {
  const identifier = attributeKeyScoped(databaseId, collectionId, attributeKey);
  processedAttributes.add(identifier);

  logger.debug('Attribute marked as processed', {
    databaseId,
    collectionId,
    attributeKey,
    identifier,
    totalProcessedAttributes: processedAttributes.size,
    operation: 'markAttributeProcessed'
  });
};

/**
 * Process only specific attributes in the queue, not entire collections
 * This prevents triggering full collection re-processing cycles
 */
export const processQueue = async (db: Databases | DatabaseAdapter, dbId: string) => {
  const startTime = Date.now();

  if (queuedOperations.length === 0) {
    MessageFormatter.info("No queued operations to process");
    logger.info('Queue processing skipped - no operations', {
      dbId,
      operation: 'processQueue'
    });
    return;
  }

  MessageFormatter.section(`Starting surgical queue processing of ${queuedOperations.length} operations for ${dbId}`);

  logger.info('Starting queue processing', {
    dbId,
    queueSize: queuedOperations.length,
    operations: queuedOperations.map(op => ({
      type: op.type,
      attributeKey: op.attribute?.key,
      collectionId: op.collectionId,
      dependencies: op.dependencies
    })),
    operation: 'processQueue'
  });

  let progress = true;
  let attempts = 0;
  const maxAttempts = 3; // Prevent infinite loops

  while (progress && attempts < maxAttempts) {
    progress = false;
    attempts++;

    MessageFormatter.info(`Queue processing attempt ${attempts}/${maxAttempts}`);

    logger.info('Queue processing attempt started', {
      attempt: attempts,
      maxAttempts,
      remainingOperations: queuedOperations.length,
      dbId,
      operation: 'processQueue'
    });

    for (let i = queuedOperations.length - 1; i >= 0; i--) {
      const operation = queuedOperations[i];

      if (!operation.attribute || !operation.collectionId) {
        MessageFormatter.warning("Invalid operation, removing from queue");
        queuedOperations.splice(i, 1);
        continue;
      }

      const attributeKey = operation.attribute.key;
      const collectionId = operation.collectionId;

      // Skip if this specific attribute was already processed (per database)
      if (isAttributeProcessed(dbId, collectionId, attributeKey)) {
        MessageFormatter.debug(`Attribute '${attributeKey}' already processed, removing from queue`);
        logger.debug('Removing already processed attribute from queue', {
          attributeKey,
          collectionId,
          queueIndex: i,
          operation: 'processQueue'
        });
        queuedOperations.splice(i, 1);
        continue;
      }

      let targetCollection: Models.Collection | undefined;

      // Resolve the target collection (where the attribute will be created)
      try {
        targetCollection = await tryAwaitWithRetry(
          async () => {
            if ('getMetadata' in db && typeof db.getMetadata === 'function') {
              // DatabaseAdapter
              return (await (db as DatabaseAdapter).getTable({ databaseId: dbId, tableId: collectionId })).data;
            } else {
              // Legacy Databases
              return await (db as Databases).getCollection(dbId, collectionId);
            }
          }
        );
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        MessageFormatter.error(`Target collection ${collectionId} not found, removing from queue`);
        logger.error('Target collection not found during queue processing', {
          collectionId,
          attributeKey,
          error: errorMessage,
          operation: 'processQueue'
        });
        queuedOperations.splice(i, 1);
        continue;
      }

      // For relationship attributes, ensure the related collection exists
      let canProcess = true;
      if (operation.attribute.type === "relationship") {
        const relatedCollection = operation.attribute.relatedCollection;
        if (relatedCollection) {
          // Try to resolve related collection by ID first, then by name
          let relatedFound = false;

          try {
            await tryAwaitWithRetry(
              async () => {
                if ('getMetadata' in db && typeof db.getMetadata === 'function') {
                  // DatabaseAdapter
                  return (await (db as DatabaseAdapter).getTable({ databaseId: dbId, tableId: relatedCollection })).data;
                } else {
                  // Legacy Databases
                  return await (db as Databases).getCollection(dbId, relatedCollection);
                }
              }
            );
            relatedFound = true;
            nameToIdMapping.set(relatedCollection, relatedCollection); // Cache the ID mapping
          } catch (_) {
            // Try by name lookup
            const cachedId = nameToIdMapping.get(relatedCollection);
            if (cachedId) {
              try {
                await tryAwaitWithRetry(
                  async () => {
                    if ('getMetadata' in db && typeof db.getMetadata === 'function') {
                      // DatabaseAdapter
                      return (await (db as DatabaseAdapter).getTable({ databaseId: dbId, tableId: cachedId })).data;
                    } else {
                      // Legacy Databases
                      return await (db as Databases).getCollection(dbId, cachedId);
                    }
                  }
                );
                relatedFound = true;
              } catch (_) {
                nameToIdMapping.delete(relatedCollection); // Remove stale cache
              }
            }

            if (!relatedFound) {
              // Final attempt: search by name
              try {
                const collections = 'getMetadata' in db && typeof db.getMetadata === 'function'
                  ? await (db as DatabaseAdapter).listTables({ databaseId: dbId, queries: [Query.equal("name", relatedCollection)] })
                  : await (db as Databases).listCollections(dbId, [Query.equal("name", relatedCollection)]);

                if (collections.total && collections.total > 0) {
                  const firstCollection = 'getMetadata' in db && typeof db.getMetadata === 'function'
                    ? (collections as any).tables?.[0]
                    : (collections as any).collections?.[0];
                  nameToIdMapping.set(relatedCollection, firstCollection.$id);
                  relatedFound = true;
                }
              } catch (_) {
                // Related collection truly doesn't exist yet
              }
            }
          }

          if (!relatedFound) {
            MessageFormatter.warning(
              `Related collection '${relatedCollection}' not ready for attribute '${attributeKey}', keeping in queue`
            );
            canProcess = false;
          }
        }
      }

      if (canProcess && targetCollection) {
        MessageFormatter.progress(
          `Processing queued ${operation.attribute.type} attribute: '${attributeKey}' for collection: '${targetCollection.name}'`
        );

        const success = await createOrUpdateAttributeWithStatusCheck(
          db,
          dbId,
          targetCollection,
          operation.attribute
        );

        if (success) {
          MessageFormatter.success(`Successfully processed queued attribute: '${attributeKey}'`);
          logger.info('Queued attribute processed successfully', {
            attributeKey,
            collectionId,
            targetCollectionName: targetCollection.name,
            operation: 'processQueue'
          });
          markAttributeProcessed(dbId, collectionId, attributeKey);
          queuedOperations.splice(i, 1);
          progress = true;
        } else {
          MessageFormatter.error(`Failed to process queued attribute: '${attributeKey}', removing from queue`);
          logger.error('Failed to process queued attribute', {
            attributeKey,
            collectionId,
            targetCollectionName: targetCollection.name,
            operation: 'processQueue'
          });
          queuedOperations.splice(i, 1);
        }
      }
    }

    if (queuedOperations.length === 0) {
      break;
    }

    MessageFormatter.info(`Remaining operations after attempt ${attempts}: ${queuedOperations.length}`);
  }

  if (queuedOperations.length > 0) {
    MessageFormatter.warning(
      `${queuedOperations.length} operations remain unresolved after ${maxAttempts} attempts:`
    );
    queuedOperations.forEach((op, index) => {
      MessageFormatter.warning(
        `  ${index + 1}. ${op.attribute?.type} attribute '${op.attribute?.key}' for collection ${op.collectionId}`
      );
    });
    MessageFormatter.warning("These may have unmet dependencies or require manual intervention");
  } else {
    MessageFormatter.success("All queued operations processed successfully");
  }

  MessageFormatter.section(`Surgical queue processing complete for ${dbId}`);
};
