import { ID, Query, type Databases, type Models } from "node-appwrite";
import type { Attribute, CollectionCreate } from "./schema";
import { createOrUpdateAttribute } from "./attributes";

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
  console.log(`Queued operations: ${JSON.stringify(queuedOperations)}`);
  let progress = true;

  while (progress) {
    progress = false;
    console.log("Processing queued operations:");
    for (let i = 0; i < queuedOperations.length; i++) {
      const operation = queuedOperations[i];
      console.log(`\tOperation: ${JSON.stringify(operation)}`);
      let collectionFound: Models.Collection | undefined;
      try {
        if (
          operation.attribute?.type === "relationship" &&
          operation.dependencies
        ) {
          for (const dep of operation.dependencies) {
            if (!nameToIdMapping.has(dep)) {
              console.log(`\tChecking for collection: ${dep}`);
              const collectionsFound = await db.listCollections(dbId, [
                Query.equal("name", dep),
              ]);
              if (collectionsFound.total > 0) {
                const collectionId = collectionsFound.collections[0].$id;
                console.log(`\tCollection found: ${collectionId}`);
                nameToIdMapping.set(dep, collectionId);
              }
            } else {
              const collectionId = nameToIdMapping.get(dep);
              if (collectionId) {
                console.log(`\tCollection found: ${collectionId}`);
                collectionFound = await db.getCollection(dbId, collectionId);
              }
            }
          }
        } else if (
          operation.attribute?.type === "relationship" &&
          operation.attribute?.relatedCollection
        ) {
          console.log(
            `\tChecking for collection: ${operation.attribute.relatedCollection}`
          );
          const collectionsFound = await db.listCollections(dbId, [
            Query.equal("name", operation.attribute?.relatedCollection),
          ]);
          if (collectionsFound.total > 0) {
            collectionFound = collectionsFound.collections[0];
            console.log(`\tCollection found: ${collectionFound.$id}`);
          }
        } else if (
          operation.collectionId &&
          operation.attribute?.type !== "relationship"
        ) {
          console.log(`\tChecking for collection: ${operation.collectionId}`);
          collectionFound = await db.getCollection(
            dbId,
            operation.collectionId
          );
          console.log(`\tCollection found: ${collectionFound.$id}`);
        }
      } catch (e) {
        console.error(
          `Collection not found for operation: ${operation.collectionId}`,
          e
        );
        collectionFound = undefined;
      }
      if (collectionFound && operation.attribute) {
        const canProcess =
          !operation.dependencies ||
          operation.dependencies.every((depName) =>
            nameToIdMapping.has(depName)
          );
        if (canProcess) {
          console.log(
            `Processing attribute: ${operation.attribute.key} for collection ID: ${collectionFound.$id}`
          );

          await createOrUpdateAttribute(
            db,
            dbId,
            operation.collection!,
            operation.attribute
          );
          queuedOperations.splice(i, 1);
          i--;
          progress = true;
        }
      } else {
        console.error(
          `Collection not found for operation: ${operation.collectionId}`
        );
        queuedOperations.splice(i, 1);
        i--;
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
