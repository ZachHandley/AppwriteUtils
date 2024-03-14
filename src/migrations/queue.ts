import { ID, Query, type Databases, type Models } from "node-appwrite";
import type { Attribute, CollectionCreate } from "./schema";

export interface QueuedOperation {
  type: "attribute";
  collectionId?: string;
  relCollectionId?: string;
  attribute?: Attribute;
  collection?: CollectionCreate;
  dependencies?: string[];
}
export const queuedOperations: QueuedOperation[] = [];
export const nameToIdMapping: Map<string, string> = new Map();

export const enqueueOperation = (operation: QueuedOperation) => {
  queuedOperations.push(operation);
};
export const processQueue = async (db: Databases, dbId: string) => {
  console.log("---------------------------------");
  console.log("Starting Queue processing of " + dbId);
  console.log("---------------------------------");
  let progress = true;

  while (progress) {
    progress = false;
    for (let i = 0; i < queuedOperations.length; i++) {
      const operation = queuedOperations[i];
      let collectionFound: Models.Collection | undefined;
      try {
        if (
          operation.attribute?.type === "relationship" &&
          operation.relCollectionId
        ) {
          collectionFound = await db.getCollection(
            dbId,
            operation.relCollectionId
          );
        } else if (
          operation.attribute?.type === "relationship" &&
          operation.attribute?.relatedCollection
        ) {
          const collectionsFound = await db.listCollections(dbId, [
            Query.equal("name", operation.attribute?.relatedCollection),
          ]);
          if (collectionsFound.total > 0) {
            collectionFound = collectionsFound.collections[0];
          }
        } else if (
          operation.collectionId &&
          operation.attribute?.type !== "relationship"
        ) {
          collectionFound = await db.getCollection(
            dbId,
            operation.collectionId
          );
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
          // Here, you'll process the attribute creation or update logic, ensuring to use the correct collection ID and handling relationships as needed.
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
  }

  if (queuedOperations.length > 0) {
    console.error("Unresolved operations remain due to unmet dependencies.");
    console.log(queuedOperations);
  }

  console.log("---------------------------------");
  console.log("Queue processing complete for " + dbId);
  console.log("---------------------------------");
};
