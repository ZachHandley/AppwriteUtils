import { Databases, Query, type Models } from "node-appwrite";
import { fetchAllCollections } from "./collections.js";
import type {
  AppwriteConfig,
  Attribute,
  RelationshipAttribute,
} from "./schema.js";

export const findCollectionsWithRelationships = (config: AppwriteConfig) => {
  const toReturn = new Map<string, Attribute[]>();
  // Map of collection name to array of attributes so we can update the relationships
  for (const collection of config.collections) {
    if (collection.attributes) {
      for (const attribute of collection.attributes) {
        if (attribute.type === "relationship") {
          if (!toReturn.has(collection.name)) {
            toReturn.set(collection.name, []);
          }
          toReturn.get(collection.name)?.push(attribute);
          if (!toReturn.has(attribute.relatedCollection)) {
            toReturn.set(attribute.relatedCollection, []);
          }
          toReturn.get(attribute.relatedCollection)?.push(attribute);
        }
      }
    }
  }
  return toReturn;
};

async function fetchAllDocuments(
  dbId: string,
  database: Databases,
  collectionId: string
): Promise<Models.Document[]> {
  let allDocuments: Models.Document[] = [];
  let after; // This will be used for pagination

  while (true) {
    const response: Models.DocumentList<Models.Document> =
      await database.listDocuments(dbId, collectionId, [
        Query.limit(100), // Adjust based on the maximum limit your database allows
        ...(after ? [Query.cursorAfter(after)] : []),
      ]);

    allDocuments = allDocuments.concat(response.documents);

    if (response.documents.length === 0 || response.total === 0) {
      break; // Exit the loop if there are no more documents to fetch
    }

    after = response.documents[response.documents.length - 1].$id; // Prepare for the next page
  }

  return allDocuments;
}

export async function resolveAndUpdateRelationships(
  dbId: string,
  database: Databases,
  config: AppwriteConfig
) {
  const collections = await fetchAllCollections(dbId, database);
  const collectionsWithRelationships = findCollectionsWithRelationships(config);

  // Process each collection sequentially
  for (const collection of collections) {
    console.log(
      `Processing collection: ${collection.name} (${collection.$id})`
    );
    const relAttributeMap = collectionsWithRelationships.get(
      collection.name
    ) as RelationshipAttribute[]; // Get the relationship attributes for the collections

    if (!relAttributeMap) {
      console.log(
        `No mapping found for collection: ${collection.name}, skipping...`
      );
      continue;
    }

    await processCollection(dbId, database, collection, relAttributeMap);
  }
  console.log(
    `Completed relationship resolution and update for database ID: ${dbId}`
  );
}

async function processCollection(
  dbId: string,
  database: Databases,
  collection: Models.Collection,
  relAttributeMap: RelationshipAttribute[]
) {
  const allDocuments = await fetchAllDocuments(dbId, database, collection.$id);
  console.log(
    `Fetched ${allDocuments.length} documents from collection: ${collection.name}`
  );

  const batchSize = 10; // Process documents in batches of 10

  for (let i = 0; i < allDocuments.length; i += batchSize) {
    const batch = allDocuments.slice(i, i + batchSize);

    const updates = await prepareDocumentUpdates(
      database,
      dbId,
      collection.name,
      batch,
      relAttributeMap
    );

    // Execute updates for the current batch
    await executeUpdatesInBatches(dbId, database, updates);
  }
}

async function findDocumentsByOriginalId(
  database: Databases,
  dbId: string,
  relatedCollectionId: string,
  targetKey: string,
  originalId: string | string[]
): Promise<Models.Document[] | undefined> {
  const collection = await database.listCollections(dbId, [
    Query.equal("$id", relatedCollectionId),
  ]);
  if (collection.total === 0) {
    console.log(`Collection ${relatedCollectionId} doesn't exist, skipping...`);
    return undefined;
  }
  const targetAttr = collection.collections[0].attributes.find(
    // @ts-ignore
    (attr) => attr.key === targetKey
  ) as any;
  if (!targetAttr) {
    console.log(
      `Attribute ${targetKey} not found in collection ${relatedCollectionId}, skipping...`
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
  if (response.total > 0) {
    return undefined;
  }

  if (response.documents.length > 0) {
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
  console.log(`Preparing updates for collection: ${collectionName}`);
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
    console.log(`No collection found with name: ${collectionName}`);
    return [];
  }

  // Function to process a batch of documents
  const processDocumentBatch = async (docBatch: Models.Document[]) => {
    for (const doc of docBatch) {
      let updatePayload: { [key: string]: any } = {};

      for (const rel of relationships) {
        // Check if the relationship has importMapping defined
        if (!rel.importMapping) {
          continue;
        }
        // Skip if not dealing with the parent side of a two-way relationship
        if (rel.twoWay && rel.side !== "parent") {
          console.log(
            "Not processing child side of two-way relationship, skipping..."
          );
          continue;
        }
        const isSingleReference =
          rel.relationType === "oneToOne" || rel.relationType === "manyToOne";
        const originalIdField = rel.importMapping.originalIdField;
        const targetField = rel.importMapping.targetField || originalIdField; // Use originalIdField if targetField is not specified
        const originalId = doc[originalIdField as keyof typeof doc];
        if (!originalId) {
          continue; // Skip if the document doesn't have the original ID field
        }
        const collection = await database.listCollections(dbId, [
          Query.equal("name", rel.relatedCollection),
        ]);
        if (collection.total === 0) {
          console.log(
            `Collection ${rel.relatedCollection} doesn't exist, skipping...`
          );
          continue; // Skip if the related collection doesn't exist
        }
        const relatedCollectionId = collection.collections[0].$id;

        // Find documents in the related collection that match the original ID
        const foundDocuments = await findDocumentsByOriginalId(
          database,
          dbId,
          relatedCollectionId,
          targetField,
          originalId
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
  };

  // Process documents in batches
  await processInBatches(documents, 25, processDocumentBatch);

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
            console.error("Error updating document: ", error);
            console.error(
              "Document ID: ",
              update.documentId,
              "Collection ID: ",
              update.collectionId,
              "Document update payload: ",
              JSON.stringify(update.updatePayload, undefined, 4)
            );
          })
      )
    );
  }
}
