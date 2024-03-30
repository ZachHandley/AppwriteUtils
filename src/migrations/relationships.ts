import { Databases, Query, type Models } from "node-appwrite";

// You need to define or fetch this mappings somewhere in your code
// const idMappings: Map<string, Map<string, string>> = new Map(); // Map<CollectionName, Map<OriginalID, NewID>>
// So basically thinking that if Contacts has a relationship with ContactsCouncils, it's using idOrig and $id,
// Then we need to find the associated ContactCouncils, and assign a list of their new ID's based on their contactsOriginalId or whatever
// Then we can use this map to update the Contacts with the new ID's and do that for all of them
const yourCollectionMapping = {
  self: "idOrig", // The documents original ID in your imported data
  collections: ["RelatedCollection"], // Assuming ContactsCouncils is a collection that has a relationship with Contacts
  keys: ["relCollKey"], // Assuming relCollKey is a relationship field in Your Collection (Some collection)
  tarKeys: ["yourCollectionIdOrig"], // original ID in your imported data for the related collection to link it here
  relKeys: ["yourCollection"], // The twoWayKey in RelatedCollection that points back to YourCollection
};

export async function resolveAndUpdateRelationships(
  dbId: string,
  database: Databases
) {
  console.log(
    `Starting relationship resolution and update for database ID: ${dbId}`
  );
  const collections = await fetchAllCollections(dbId, database);
  console.log(
    `Fetched ${collections.length} collections to process for relationships.`
  );

  for (const collection of collections) {
    console.log(
      `Processing collection: ${collection.name} (${collection.$id})`
    );
    let moreDocuments = true;
    let lastDocumentId: string | undefined;
    let processedDocumentsCount = 0;
    const mapping =
      collection.name.toLowerCase().replace(" ", "") === "yourCollection"
        ? yourCollectionMapping
        : undefined;

    // Prepare relationship updates for documents
    if (!mapping) {
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
        mapping
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

async function fetchAllCollections(
  dbId: string,
  database: Databases
): Promise<Models.Collection[]> {
  console.log(`Fetching all collections for database ID: ${dbId}`);
  let collections: Models.Collection[] = [];
  let moreCollections = true;
  let lastCollectionId: string | undefined;

  while (moreCollections) {
    const queries = [Query.limit(500)];
    if (lastCollectionId) {
      queries.push(Query.cursorAfter(lastCollectionId));
    }
    const response = await database.listCollections(dbId, queries);
    collections = collections.concat(response.collections);
    moreCollections = response.collections.length === 500;
    if (moreCollections) {
      lastCollectionId =
        response.collections[response.collections.length - 1].$id;
    }
  }

  console.log(`Fetched a total of ${collections.length} collections.`);
  return collections;
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
  mappings: typeof yourCollectionMapping
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

  // New function to process a batch of documents
  const processDocumentBatch = async (docBatch: Models.Document[]) => {
    for (const doc of docBatch) {
      let updatePayload: { [key: string]: any } = {};

      for (const key of mappings.tarKeys) {
        const originalId = doc[mappings.self as keyof typeof doc];
        if (!originalId) continue;

        const targetKeyIndex = mappings.tarKeys.indexOf(key);
        const targetKey = mappings.tarKeys[targetKeyIndex];
        const relatedCollectionName = mappings.collections[targetKeyIndex];
        const relKey = mappings.keys[targetKeyIndex];

        const relatedCollectionId = (
          await database.listCollections(dbId, [
            Query.equal("name", relatedCollectionName),
          ])
        ).collections[0]?.$id;

        if (!relatedCollectionId) {
          console.log(
            `No collection found with name: ${relatedCollectionName}`
          );
          continue;
        }

        const foundDocuments = await findDocumentsByOriginalId(
          database,
          dbId,
          relatedCollectionId,
          targetKey,
          originalId
        );

        if (foundDocuments) {
          const existingRefs = doc[relKey as keyof typeof doc] || [];
          const newRefs = foundDocuments.filter(
            // @ts-ignore
            (fd) => !existingRefs.some((er) => er.$id === fd.$id)
          );
          if (newRefs.length > 0) {
            updatePayload[relKey] = [
              ...existingRefs,
              ...newRefs.map((fd) => fd.$id),
            ]; // Assuming you're storing IDs
          }
        }
      }

      if (Object.keys(updatePayload).length > 0) {
        updates.push({
          collectionId: thisCollectionId,
          documentId: doc.$id,
          updatePayload,
        });
      }
    }
  };

  // Use the processInBatches function to process documents in batches
  await processInBatches(documents, 25, processDocumentBatch); // Adjust batch size as needed

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
        database.updateDocument(
          dbId,
          update.collectionId,
          update.documentId,
          update.updatePayload
        )
      )
    );
  }
}
