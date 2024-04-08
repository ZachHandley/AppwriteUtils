import { Databases, Query, type Models } from "node-appwrite";
import { fetchAllCollections } from "./collections";
import type {
  AppwriteConfig,
  Attribute,
  RelationshipAttribute,
} from "./schema";

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

export async function resolveAndUpdateRelationships(
  dbId: string,
  database: Databases,
  config: AppwriteConfig
) {
  console.log(
    `Starting relationship resolution and update for database ID: ${dbId}`
  );
  const collections = await fetchAllCollections(dbId, database);
  console.log(
    `Fetched ${collections.length} collections to process for relationships.`
  );
  const collectionsWithRelationships = findCollectionsWithRelationships(config);
  console.log(
    `Found ${collectionsWithRelationships.size} collections with relationships.`
  );

  for (const collection of collections) {
    console.log(
      `Processing collection: ${collection.name} (${collection.$id})`
    );
    let moreDocuments = true;
    let lastDocumentId: string | undefined;
    let processedDocumentsCount = 0;
    const relAttributeMap = collectionsWithRelationships.get(
      collection.name
    ) as RelationshipAttribute[]; // Get the relationship attributes for the collections

    // Prepare relationship updates for documents
    if (!relAttributeMap) {
      console.log(
        `No mapping found for collection: ${collection.name}, skipping...`
      );
      continue;
    }

    while (moreDocuments) {
      const { documents, nextCursor } = await fetchDocuments(
        dbId,
        database,
        collection.$id,
        lastDocumentId
      );
      console.log(
        `Fetched ${documents.length} documents from collection: ${collection.name}`
      );

      const updates = await prepareDocumentUpdates(
        database,
        dbId,
        collection.name,
        documents,
        relAttributeMap
      );
      console.log(
        `Prepared ${updates.length} updates for collection: ${collection.name}`
      );

      // Execute updates in batches
      await executeUpdatesInBatches(dbId, database, updates);
      console.log(
        `Executed updates for ${updates.length} documents in collection: ${collection.name}`
      );

      lastDocumentId = nextCursor;
      moreDocuments = documents.length > 0 && nextCursor !== undefined;
      processedDocumentsCount += documents.length;
    }
    console.log(
      `Finished processing ${processedDocumentsCount} documents in collection: ${collection.name}`
    );
  }
  console.log(
    `Completed relationship resolution and update for database ID: ${dbId}`
  );
}

async function fetchDocuments(
  dbId: string,
  database: Databases,
  collectionId: string,
  lastDocumentId?: string
): Promise<{ documents: Models.Document[]; nextCursor: string | undefined }> {
  console.log(
    `Fetching documents for collection ID: ${collectionId} starting after document ID: ${lastDocumentId}`
  );
  const queries = [Query.limit(250)];
  if (lastDocumentId) {
    queries.push(Query.cursorAfter(lastDocumentId));
  }
  const response = await database.listDocuments(dbId, collectionId, queries);
  console.log(
    `Fetched ${response.documents.length} documents from collection ID: ${collectionId}`
  );
  return {
    documents: response.documents,
    nextCursor:
      response.documents.length > 0
        ? response.documents[response.documents.length - 1].$id
        : undefined,
  };
}

async function findDocumentsByOriginalId(
  database: Databases,
  dbId: string,
  relatedCollectionId: string,
  targetKey: string,
  originalId: string | string[]
): Promise<Models.Document[] | undefined> {
  const query = Query.equal(targetKey, originalId);
  const response = await database.listDocuments(dbId, relatedCollectionId, [
    query,
    Query.limit(500), // Adjust the limit based on your needs or implement pagination
  ]);
  if (response.total > 0) {
    console.log(
      `Found ${response.total} documents by original ID: ${originalId}`
    );
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

  const thisCollectionId = (
    await database.listCollections(dbId, [Query.equal("name", collectionName)])
  ).collections[0]?.$id;

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
        if (!rel.importMapping) continue;
        const originalIdField = rel.importMapping.originalIdField;
        const targetField = rel.importMapping.targetField || originalIdField; // Use originalIdField if targetField is not specified
        const originalId = doc[originalIdField as keyof typeof doc];
        if (!originalId) continue; // Skip if the document doesn't have the original ID field
        const collection = await database.listCollections(dbId, [
          Query.equal("name", rel.relatedCollection),
        ]);
        console.log(
          `Found ${collection.total} collections with name: ${rel.relatedCollection}`
        );
        if (collection.total === 0) continue; // Skip if the related collection doesn't exist
        const relatedCollectionId = collection.collections[0].$id;
        console.log(`Related collection ID: ${relatedCollectionId}`);

        // Find documents in the related collection that match the original ID
        const foundDocuments = await findDocumentsByOriginalId(
          database,
          dbId,
          relatedCollectionId,
          targetField,
          originalId
        );

        if (foundDocuments && foundDocuments.length > 0) {
          // Use the relationship attribute's key as the field to update in the current document
          const relationshipKey = rel.key; // The key of the relationship attribute to update
          const existingRefs = doc[relationshipKey as keyof typeof doc] || [];
          // Filter out existing references to avoid duplicates
          const newRefs = foundDocuments.filter(
            // @ts-ignore
            (fd) => !existingRefs.find((er) => er.$id === fd.$id)
          );
          if (newRefs.length > 0) {
            // Update with the full documents
            updatePayload[relationshipKey] = [...existingRefs, ...newRefs];
            console.log(
              `Update payload[${relationshipKey}]: ${JSON.stringify(
                updatePayload[relationshipKey],
                undefined,
                4
              )}`
            );
          }
        } else {
          // No matching documents found
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
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await processFunction(batch);
  }
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
              "Document update payload: ",
              JSON.stringify(update.updatePayload, undefined, 4)
            );
          })
      )
    );
  }
}
