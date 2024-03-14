import { ID, type Databases } from "node-appwrite";
import type { Attribute, CollectionCreate } from "./schema";

export interface QueuedOperation {
  type: "collection" | "attribute";
  collectionId?: string;
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
      if (operation.type === "collection" && operation.collection) {
        const collectionId = operation.collectionId || ID.unique();
        console.log(
          `Processing collection: ${operation.collection.name} with ID: ${collectionId}`
        );
        const collection = await db.createCollection(
          dbId,
          collectionId,
          operation.collection.name,
          operation.collection.$permissions,
          operation.collection.documentSecurity,
          operation.collection.enabled
        );
        // Correctly mapping the collection name to its ID after creation or using the predefined ID
        nameToIdMapping.set(operation.collection.name, collection.$id);
        operation.collectionId = collectionId; // Preserving the logic of using predefined IDs
        queuedOperations.splice(i, 1);
        i--;
        progress = true;
      } else if (
        operation.type === "attribute" &&
        operation.collectionId &&
        operation.attribute
      ) {
        const canProcess =
          !operation.dependencies ||
          operation.dependencies.every((depName) =>
            nameToIdMapping.has(depName)
          );
        if (canProcess) {
          console.log(
            `Processing attribute: ${operation.attribute.key} for collection ID: ${operation.collectionId}`
          );
          // Here, you'll process the attribute creation or update logic, ensuring to use the correct collection ID and handling relationships as needed.
          queuedOperations.splice(i, 1);
          i--;
          progress = true;
        }
      }
    }
  }

  if (queuedOperations.length > 0) {
    console.error("Unresolved operations remain due to unmet dependencies.");
  }

  console.log("---------------------------------");
  console.log("Queue processing complete for " + dbId);
  console.log("---------------------------------");
};
