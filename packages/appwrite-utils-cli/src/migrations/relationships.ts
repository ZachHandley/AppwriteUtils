import { Databases, Query, type Models } from "node-appwrite";
import { fetchAllCollections } from "../collections/methods.js";
import type {
  AppwriteConfig,
  Attribute,
  RelationshipAttribute,
} from "appwrite-utils";
import { logger } from "../shared/logging.js";
import { MessageFormatter } from "../shared/messageFormatter.js";

/**
 * Finds collections that have defined relationship attributes.
 */
export const findCollectionsWithRelationships = (config: AppwriteConfig) => {
  const toReturn = new Map<string, RelationshipAttribute[]>();
  if (!config.collections) {
    return toReturn;
  }
  for (const collection of config.collections) {
    if (collection.attributes) {
      for (const attribute of collection.attributes) {
        if (
          attribute.type === "relationship" &&
          attribute.twoWay &&
          attribute.side === "parent"
        ) {
          toReturn.set(collection.name, toReturn.get(collection.name) || []);
          toReturn
            .get(collection.name)
            ?.push(attribute as RelationshipAttribute);
        }
      }
    }
  }
  return toReturn;
};

export async function resolveAndUpdateRelationships(
  dbId: string,
  database: Databases,
  config: AppwriteConfig
) {
  const collections = await fetchAllCollections(dbId, database);
  const collectionsWithRelationships = findCollectionsWithRelationships(config);

  // Process each collection sequentially
  for (const collection of collections) {
    MessageFormatter.processing(
      `Processing collection: ${collection.name} (${collection.$id})`,
      { prefix: "Migration" }
    );
    const relAttributeMap = collectionsWithRelationships.get(
      collection.name
    ) as RelationshipAttribute[]; // Get the relationship attributes for the collections

    if (!relAttributeMap) {
      MessageFormatter.info(
        `No mapping found for collection: ${collection.name}, skipping...`,
        { prefix: "Migration" }
      );
      continue;
    }

    await processCollection(dbId, database, collection, relAttributeMap);
  }
  MessageFormatter.success(
    `Completed relationship resolution and update for database ID: ${dbId}`,
    { prefix: "Migration" }
  );
}

async function processCollection(
  dbId: string,
  database: Databases,
  collection: Models.Collection,
  relAttributeMap: RelationshipAttribute[]
) {
  let after; // For pagination
  let hasMore = true;

  while (hasMore) {
    const response: Models.DocumentList<Models.Document> =
      await database.listDocuments(dbId, collection.$id, [
        Query.limit(100), // Fetch documents in batches of 100
        ...(after ? [Query.cursorAfter(after)] : []),
      ]);

    const documents = response.documents;
    MessageFormatter.info(
      `Fetched ${documents.length} documents from collection: ${collection.name}`,
      { prefix: "Migration" }
    );

    if (documents.length > 0) {
      const updates = await prepareDocumentUpdates(
        database,
        dbId,
        collection.name,
        documents,
        relAttributeMap
      );

      // Execute updates for the current batch
      await executeUpdatesInBatches(dbId, database, updates);
    }

    if (documents.length === 100) {
      after = documents[documents.length - 1].$id; // Prepare for the next page
    } else {
      hasMore = false; // No more documents to fetch
    }
  }
}

async function findDocumentsByOriginalId(
  database: Databases,
  dbId: string,
  targetCollection: Models.Collection,
  targetKey: string,
  originalId: string | string[]
): Promise<Models.Document[] | undefined> {
  const relatedCollectionId = targetCollection.$id;
  const collection = await database.listCollections(dbId, [
    Query.equal("$id", relatedCollectionId),
  ]);
  if (collection.total === 0) {
    MessageFormatter.warning(
      `Collection ${relatedCollectionId} doesn't exist, skipping...`,
      { prefix: "Migration" }
    );
    return undefined;
  }
  const targetAttr = collection.collections[0].attributes.find(
    // @ts-ignore
    (attr) => attr.key === targetKey
  ) as any;
  if (!targetAttr) {
    MessageFormatter.warning(
      `Attribute ${targetKey} not found in collection ${relatedCollectionId}, skipping...`,
      { prefix: "Migration" }
    );
    return undefined;
  }
  let queries: string[] = [];
  if (targetAttr.array) {
    // @ts-ignore
    queries.push(Query.contains(targetKey, originalId));
  } else {
    queries.push(Query.equal(targetKey, originalId));
  }
  const response = await database.listDocuments(dbId, relatedCollectionId, [
    ...queries,
    Query.limit(500), // Adjust the limit based on your needs or implement pagination
  ]);

  if (response.documents.length < 0) {
    return undefined;
  } else if (response.documents.length > 0) {
    return response.documents;
  } else {
    return undefined;
  }
}

async function prepareDocumentUpdates(
  database: Databases,
  dbId: string,
  collectionName: string,
  documents: Models.Document[],
  relationships: RelationshipAttribute[]
): Promise<{ collectionId: string; documentId: string; updatePayload: any }[]> {
  MessageFormatter.processing(`Preparing updates for collection: ${collectionName}`, { prefix: "Migration" });
  const updates: {
    collectionId: string;
    documentId: string;
    updatePayload: any;
  }[] = [];

  const thisCollection = (
    await database.listCollections(dbId, [Query.equal("name", collectionName)])
  ).collections[0];
  const thisCollectionId = thisCollection?.$id;

  if (!thisCollectionId) {
    MessageFormatter.warning(`No collection found with name: ${collectionName}`, { prefix: "Migration" });
    return [];
  }

  for (const doc of documents) {
    let updatePayload: { [key: string]: any } = {};

    for (const rel of relationships) {
      // Skip if not dealing with the parent side of a two-way relationship
      if (rel.twoWay && rel.side !== "parent") {
        MessageFormatter.info("Skipping non-parent side of two-way relationship...", { prefix: "Migration" });
        continue;
      }

      const isSingleReference =
        rel.relationType === "oneToOne" || rel.relationType === "manyToOne";
      const originalIdField = rel.importMapping?.originalIdField;
      const targetField = rel.importMapping?.targetField || originalIdField; // Use originalIdField if targetField is not specified
      if (!originalIdField) {
        MessageFormatter.warning("Missing originalIdField in importMapping, skipping...", { prefix: "Migration" });
        continue;
      }
      const originalId = doc[originalIdField as keyof typeof doc];
      if (!originalId) {
        continue;
      }

      const relatedCollection = (
        await database.listCollections(dbId, [
          Query.equal("name", rel.relatedCollection),
        ])
      ).collections[0];

      if (!relatedCollection) {
        MessageFormatter.warning(
          `Related collection ${rel.relatedCollection} not found, skipping...`,
          { prefix: "Migration" }
        );
        continue;
      }

      const foundDocuments = await findDocumentsByOriginalId(
        database,
        dbId,
        relatedCollection,
        targetField!,
        String(originalId)
      );

      if (foundDocuments && foundDocuments.length > 0) {
        const relationshipKey = rel.key;
        const existingRefs = doc[relationshipKey as keyof typeof doc] || [];
        let existingRefIds: string[] = [];
        if (Array.isArray(existingRefs)) {
          // @ts-ignore
          existingRefIds = existingRefs.map((ref) => ref.$id);
        } else if (existingRefs) {
          // @ts-ignore
          existingRefIds = [existingRefs.$id];
        }

        const newRefs = foundDocuments.map((fd) => fd.$id);
        const allRefs = [...new Set([...existingRefIds, ...newRefs])]; // Combine and remove duplicates

        // Update logic based on the relationship cardinality
        updatePayload[relationshipKey] = isSingleReference
          ? newRefs[0] || existingRefIds[0]
          : allRefs;
        MessageFormatter.info(`Updating ${relationshipKey} with ${allRefs.length} refs`, { prefix: "Migration" });
      }
    }

    if (Object.keys(updatePayload).length > 0) {
      updates.push({
        collectionId: thisCollectionId,
        documentId: doc.$id,
        updatePayload: updatePayload,
      });
    }
  }

  return updates;
}

async function processInBatches<T>(
  items: T[],
  batchSize: number,
  processFunction: (batch: T[]) => Promise<void>
) {
  const maxParallelBatches = 25; // Adjust this value to control the number of parallel batches
  let currentIndex = 0;
  let activeBatchPromises: Promise<void>[] = [];

  while (currentIndex < items.length) {
    // While there's still data to process and we haven't reached our parallel limit
    while (
      currentIndex < items.length &&
      activeBatchPromises.length < maxParallelBatches
    ) {
      const batch = items.slice(currentIndex, currentIndex + batchSize);
      currentIndex += batchSize;
      // Add new batch processing promise to the array
      activeBatchPromises.push(processFunction(batch));
    }

    // Wait for one of the batch processes to complete
    await Promise.race(activeBatchPromises).then(() => {
      // Remove the resolved promise from the activeBatchPromises array
      activeBatchPromises = activeBatchPromises.filter(
        (p) => p !== Promise.race(activeBatchPromises)
      );
    });
  }

  // After processing all batches, ensure all active promises are resolved
  await Promise.all(activeBatchPromises);
}

async function executeUpdatesInBatches(
  dbId: string,
  database: Databases,
  updates: { collectionId: string; documentId: string; updatePayload: any }[]
) {
  const batchSize = 25; // Adjust based on your rate limit and performance testing
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    await Promise.all(
      batch.map((update) =>
        database
          .updateDocument(
            dbId,
            update.collectionId,
            update.documentId,
            update.updatePayload
          )
          .catch((error) => {
            logger.error(
              `Error updating doc ${
                update.documentId
              } in ${dbId}, update payload: ${JSON.stringify(
                update.updatePayload,
                undefined,
                4
              )}, error: ${error}`
            );
          })
      )
    );
  }
}
