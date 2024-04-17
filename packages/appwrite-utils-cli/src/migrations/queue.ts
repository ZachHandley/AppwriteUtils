import { Query, type Databases, type Models } from "node-appwrite";
import type { Attribute } from "./schema.js";
import { createOrUpdateAttribute } from "./attributes.js";
import _ from "lodash";
import { fetchAndCacheCollectionByName } from "./collections.js";

export interface QueuedOperation {
  type: "attribute";
  collectionId?: string;
  attribute?: Attribute;
  collection?: Models.Collection;
  dependencies?: string[];
}
export const queuedOperations: QueuedOperation[] = [];
export const nameToIdMapping: Map<string, string> = new Map();

export const enqueueOperation = (operation: QueuedOperation) => {
  queuedOperations.push(operation);
};

export const processQueue = async (db: Databases, dbId: string) => {
  console.log("---------------------------------");
  console.log(`Starting Queue processing of ${dbId}`);
  console.log("---------------------------------");
  let progress = true;

  while (progress) {
    progress = false;
    console.log("Processing queued operations:");
    for (let i = 0; i < queuedOperations.length; i++) {
      const operation = queuedOperations[i];
      let collectionFound: Models.Collection | undefined;

      // Handle relationship attribute operations
      if (operation.attribute?.type === "relationship") {
        // Attempt to resolve the collection directly if collectionId is specified
        if (operation.collectionId) {
          console.log(`\tFetching collection by ID: ${operation.collectionId}`);
          try {
            collectionFound = await db.getCollection(
              dbId,
              operation.collectionId
            );
          } catch (e) {
            console.log(
              `\tCollection not found by ID: ${operation.collectionId}`
            );
          }
        }
        // Attempt to resolve related collection if specified and not already found
        if (!collectionFound && operation.attribute?.relatedCollection) {
          collectionFound = await fetchAndCacheCollectionByName(
            db,
            dbId,
            operation.attribute.relatedCollection
          );
        }
        // Handle dependencies if collection still not found
        if (!collectionFound) {
          for (const dep of operation.dependencies || []) {
            collectionFound = await fetchAndCacheCollectionByName(
              db,
              dbId,
              dep
            );
            if (collectionFound) break; // Break early if collection is found
          }
        }
      } else if (operation.collectionId) {
        // Handle non-relationship operations with a specified collectionId
        console.log(`\tFetching collection by ID: ${operation.collectionId}`);
        try {
          collectionFound = await db.getCollection(
            dbId,
            operation.collectionId
          );
        } catch (e) {
          console.log(
            `\tCollection not found by ID: ${operation.collectionId}`
          );
        }
      }

      // Process the operation if the collection is found
      if (collectionFound && operation.attribute) {
        console.log(
          `\tProcessing attribute: ${operation.attribute.key} for collection ID: ${collectionFound.$id}`
        );
        await createOrUpdateAttribute(
          db,
          dbId,
          collectionFound,
          operation.attribute
        );
        queuedOperations.splice(i, 1);
        i--; // Adjust index since we're modifying the array
        progress = true;
      } else {
        console.error(
          `\tCollection not found for operation, removing from queue: ${JSON.stringify(
            operation
          )}`
        );
        queuedOperations.splice(i, 1);
        i--; // Adjust index since we're modifying the array
      }
    }
    console.log(`\tFinished processing queued operations`);
  }

  if (queuedOperations.length > 0) {
    console.error("Unresolved operations remain due to unmet dependencies.");
    console.log(queuedOperations);
  }

  console.log("---------------------------------");
  console.log(`Queue processing complete for ${dbId}`);
  console.log("---------------------------------");
};
