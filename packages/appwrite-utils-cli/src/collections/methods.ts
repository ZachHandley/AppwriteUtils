import {
  Client,
  Databases,
  ID,
  Permission,
  Query,
  type Models,
} from "node-appwrite";
import type { AppwriteConfig, CollectionCreate, Indexes } from "appwrite-utils";
import { nameToIdMapping, processQueue } from "../migrations/queue.js";
import { createUpdateCollectionAttributes } from "./attributes.js";
import { createOrUpdateIndexes } from "./indexes.js";
import { SchemaGenerator } from "../migrations/schemaStrings.js";
import {
  isNull,
  isUndefined,
  isNil,
  isPlainObject,
  isString,
  isJSONValue,
  chunk,
} from "es-toolkit";
import { delay, tryAwaitWithRetry } from "../utils/helperFunctions.js";

export const documentExists = async (
  db: Databases,
  dbId: string,
  targetCollectionId: string,
  toCreateObject: any
): Promise<Models.Document | null> => {
  const collection = await db.getCollection(dbId, targetCollectionId);
  const attributes = collection.attributes as any[];
  let arrayTypeAttributes = attributes
    .filter((attribute: any) => attribute.array === true)
    .map((attribute: any) => attribute.key);

  const isJsonString = (str: string) => {
    try {
      const json = JSON.parse(str);
      return typeof json === "object" && json !== null;
    } catch (e) {
      return false;
    }
  };

  // Convert object to entries and filter
  const validEntries = Object.entries(toCreateObject).filter(
    ([key, value]) =>
      !arrayTypeAttributes.includes(key) &&
      !key.startsWith("$") &&
      !isNull(value) &&
      !isUndefined(value) &&
      !isNil(value) &&
      !isPlainObject(value) &&
      !Array.isArray(value) &&
      !(isString(value) && isJsonString(value)) &&
      (isString(value) ? value.length < 4096 && value.length > 0 : true)
  );

  // Map and filter valid entries
  const validMappedEntries = validEntries
    .map(([key, value]) => [
      key,
      isString(value) || typeof value === "number" || typeof value === "boolean"
        ? value
        : null,
    ])
    .filter(([key, value]) => !isNull(value) && isString(key))
    .slice(0, 25);

  // Convert to Query parameters
  const validQueryParams = validMappedEntries.map(([key, value]) =>
    Query.equal(key as string, value as any)
  );

  // Execute the query with the validated and prepared parameters
  const result = await db.listDocuments(
    dbId,
    targetCollectionId,
    validQueryParams
  );
  return result.documents[0] || null;
};

export const checkForCollection = async (
  db: Databases,
  dbId: string,
  collection: Partial<CollectionCreate>
): Promise<Models.Collection | null> => {
  try {
    console.log(`Checking for collection with name: ${collection.name}`);
    const response = await tryAwaitWithRetry(
      async () =>
        await db.listCollections(dbId, [Query.equal("name", collection.name!)])
    );
    if (response.collections.length > 0) {
      console.log(`Collection found: ${response.collections[0].$id}`);
      return { ...collection, ...response.collections[0] };
    } else {
      console.log(`No collection found with name: ${collection.name}`);
      return null;
    }
  } catch (error) {
    console.error(`Error checking for collection: ${error}`);
    return null;
  }
};

// Helper function to fetch and cache collection by name
export const fetchAndCacheCollectionByName = async (
  db: Databases,
  dbId: string,
  collectionName: string
): Promise<Models.Collection | undefined> => {
  if (nameToIdMapping.has(collectionName)) {
    const collectionId = nameToIdMapping.get(collectionName);
    console.log(`\tCollection found in cache: ${collectionId}`);
    return await tryAwaitWithRetry(
      async () => await db.getCollection(dbId, collectionId!)
    );
  } else {
    console.log(`\tFetching collection by name: ${collectionName}`);
    const collectionsPulled = await tryAwaitWithRetry(
      async () =>
        await db.listCollections(dbId, [Query.equal("name", collectionName)])
    );
    if (collectionsPulled.total > 0) {
      const collection = collectionsPulled.collections[0];
      console.log(`\tCollection found: ${collection.$id}`);
      nameToIdMapping.set(collectionName, collection.$id);
      return collection;
    } else {
      console.log(`\tCollection not found by name: ${collectionName}`);
      return undefined;
    }
  }
};

async function wipeDocumentsFromCollection(
  database: Databases,
  databaseId: string,
  collectionId: string
) {
  try {
    const initialDocuments = await database.listDocuments(
      databaseId,
      collectionId,
      [Query.limit(1000)]
    );
    let documents = initialDocuments.documents;
    let totalDocuments = documents.length;
    let cursor =
      initialDocuments.documents.length >= 1000
        ? initialDocuments.documents[initialDocuments.documents.length - 1].$id
        : undefined;

    while (cursor) {
      const docsResponse = await database.listDocuments(
        databaseId,
        collectionId,
        [Query.limit(1000), ...(cursor ? [Query.cursorAfter(cursor)] : [])]
      );
      documents.push(...docsResponse.documents);
      totalDocuments = documents.length;
      cursor =
        docsResponse.documents.length >= 1000
          ? docsResponse.documents[docsResponse.documents.length - 1].$id
          : undefined;
      if (totalDocuments % 10000 === 0) {
        console.log(`Found ${totalDocuments} documents...`);
      }
    }

    console.log(`Found ${totalDocuments} documents to delete`);

    const maxStackSize = 50; // Reduced batch size
    const docBatches = chunk(documents, maxStackSize);
    const quarterBatchSize = Math.ceil(docBatches.length / 4);

    for (let i = 0; i < docBatches.length; i++) {
      const batch = docBatches[i];
      const deletePromises = batch.map(async (doc) => {
        try {
          await tryAwaitWithRetry(async () =>
            database.deleteDocument(databaseId, collectionId, doc.$id)
          );
        } catch (error: any) {
          // Skip if document doesn't exist or other non-critical errors
          if (
            !error.message?.includes(
              "Document with the requested ID could not be found"
            )
          ) {
            console.error(
              `Failed to delete document ${doc.$id}:`,
              error.message
            );
          }
        }
      });

      await Promise.all(deletePromises);
      await delay(50); // Increased delay between batches

      // Log at 25%, 50%, 75% and 100% completion
      if ((i + 1) % quarterBatchSize === 0 || i === docBatches.length - 1) {
        const percentComplete = Math.round(((i + 1) / docBatches.length) * 100);
        const documentsProcessed = Math.min(
          (i + 1) * maxStackSize,
          totalDocuments
        );
        console.log(
          `Deleted ${documentsProcessed} documents (${percentComplete}% complete)`
        );
      }
    }

    console.log(
      `Completed deletion of ${totalDocuments} documents from collection ${collectionId}`
    );
  } catch (error) {
    console.error(
      `Error wiping documents from collection ${collectionId}:`,
      error
    );
    throw error;
  }
}

export const wipeDatabase = async (
  database: Databases,
  databaseId: string
): Promise<{ collectionId: string; collectionName: string }[]> => {
  console.log(`Wiping database: ${databaseId}`);
  const existingCollections = await fetchAllCollections(databaseId, database);
  let collectionsDeleted: { collectionId: string; collectionName: string }[] =
    [];
  for (const { $id: collectionId, name: name } of existingCollections) {
    console.log(`Deleting collection: ${collectionId}`);
    collectionsDeleted.push({
      collectionId: collectionId,
      collectionName: name,
    });
    tryAwaitWithRetry(
      async () => await database.deleteCollection(databaseId, collectionId)
    ); // Try to delete the collection and ignore errors if it doesn't exist or if it's already being deleted
    await delay(100);
  }
  return collectionsDeleted;
};

export const wipeCollection = async (
  database: Databases,
  databaseId: string,
  collectionId: string
): Promise<void> => {
  const collections = await database.listCollections(databaseId, [
    Query.equal("$id", collectionId),
  ]);
  if (collections.total === 0) {
    console.log(`Collection ${collectionId} not found`);
    return;
  }
  const collection = collections.collections[0];
  await wipeDocumentsFromCollection(database, databaseId, collection.$id);
};

export const generateSchemas = async (
  config: AppwriteConfig,
  appwriteFolderPath: string
): Promise<void> => {
  const schemaGenerator = new SchemaGenerator(config, appwriteFolderPath);
  schemaGenerator.generateSchemas();
};

export const createOrUpdateCollections = async (
  database: Databases,
  databaseId: string,
  config: AppwriteConfig,
  deletedCollections?: { collectionId: string; collectionName: string }[],
  selectedCollections: Models.Collection[] = []
): Promise<void> => {
  const collectionsToProcess =
    selectedCollections.length > 0 ? selectedCollections : config.collections;
  if (!collectionsToProcess) {
    return;
  }
  const usedIds = new Set();

  for (const collection of collectionsToProcess) {
    const { attributes, indexes, ...collectionData } = collection;

    // Prepare permissions for the collection
    const permissions: string[] = [];
    if (collection.$permissions && collection.$permissions.length > 0) {
      for (const permission of collection.$permissions) {
        if (typeof permission === "string") {
          permissions.push(permission);
        } else {
          switch (permission.permission) {
            case "read":
              permissions.push(Permission.read(permission.target));
              break;
            case "create":
              permissions.push(Permission.create(permission.target));
              break;
            case "update":
              permissions.push(Permission.update(permission.target));
              break;
            case "delete":
              permissions.push(Permission.delete(permission.target));
              break;
            case "write":
              permissions.push(Permission.write(permission.target));
              break;
            default:
              console.log(`Unknown permission: ${permission.permission}`);
              break;
          }
        }
      }
    }

    // Check if the collection already exists by name
    let collectionsFound = await tryAwaitWithRetry(
      async () =>
        await database.listCollections(databaseId, [
          Query.equal("name", collectionData.name),
        ])
    );

    let collectionToUse =
      collectionsFound.total > 0 ? collectionsFound.collections[0] : null;

    // Determine the correct ID for the collection
    let collectionId: string;
    if (!collectionToUse) {
      console.log(`Creating collection: ${collectionData.name}`);
      let foundColl = deletedCollections?.find(
        (coll) =>
          coll.collectionName.toLowerCase().trim().replace(" ", "") ===
          collectionData.name.toLowerCase().trim().replace(" ", "")
      );

      if (collectionData.$id) {
        collectionId = collectionData.$id;
      } else if (foundColl && !usedIds.has(foundColl.collectionId)) {
        collectionId = foundColl.collectionId;
      } else {
        collectionId = ID.unique();
      }

      usedIds.add(collectionId);

      // Create the collection with the determined ID
      try {
        collectionToUse = await tryAwaitWithRetry(
          async () =>
            await database.createCollection(
              databaseId,
              collectionId,
              collectionData.name,
              permissions,
              collectionData.documentSecurity ?? false,
              collectionData.enabled ?? true
            )
        );
        collectionData.$id = collectionToUse!.$id;
        nameToIdMapping.set(collectionData.name, collectionToUse!.$id);
      } catch (error) {
        console.error(
          `Failed to create collection ${collectionData.name} with ID ${collectionId}: ${error}`
        );
        continue;
      }
    } else {
      console.log(`Collection ${collectionData.name} exists, updating it`);
      await tryAwaitWithRetry(
        async () =>
          await database.updateCollection(
            databaseId,
            collectionToUse!.$id,
            collectionData.name,
            permissions,
            collectionData.documentSecurity ?? false,
            collectionData.enabled ?? true
          )
      );
    }

    // Add delay after creating/updating collection
    await delay(250);

    // Update attributes and indexes for the collection
    console.log("Creating Attributes");
    await createUpdateCollectionAttributes(
      database,
      databaseId,
      collectionToUse!,
      // @ts-expect-error
      attributes
    );

    // Add delay after creating attributes
    await delay(250);

    const indexesToUse =
      indexes.length > 0
        ? indexes
        : config.collections?.find((c) => c.$id === collectionToUse!.$id)
            ?.indexes ?? [];

    console.log("Creating Indexes");
    await createOrUpdateIndexes(
      databaseId,
      database,
      collectionToUse!.$id,
      indexesToUse as Indexes
    );

    // Add delay after creating indexes
    await delay(250);
  }
  // Process any remaining tasks in the queue
  await processQueue(database, databaseId);
};

export const generateMockData = async (
  database: Databases,
  databaseId: string,
  configCollections: any[]
): Promise<void> => {
  for (const { collection, mockFunction } of configCollections) {
    if (mockFunction) {
      console.log(`Generating mock data for collection: ${collection.name}`);
      const mockData = mockFunction();
      for (const data of mockData) {
        await database.createDocument(
          databaseId,
          collection.$id,
          ID.unique(),
          data
        );
      }
    }
  }
};

export const fetchAllCollections = async (
  dbId: string,
  database: Databases
): Promise<Models.Collection[]> => {
  console.log(`Fetching all collections for database ID: ${dbId}`);
  let collections: Models.Collection[] = [];
  let moreCollections = true;
  let lastCollectionId: string | undefined;

  while (moreCollections) {
    const queries = [Query.limit(500)];
    if (lastCollectionId) {
      queries.push(Query.cursorAfter(lastCollectionId));
    }
    const response = await tryAwaitWithRetry(
      async () => await database.listCollections(dbId, queries)
    );
    collections = collections.concat(response.collections);
    moreCollections = response.collections.length === 500;
    if (moreCollections) {
      lastCollectionId =
        response.collections[response.collections.length - 1].$id;
    }
  }

  console.log(`Fetched a total of ${collections.length} collections.`);
  return collections;
};

/**
 * Transfers all documents from one collection to another in a different database
 * within the same Appwrite Project
 */
export const transferDocumentsBetweenDbsLocalToLocal = async (
  db: Databases,
  fromDbId: string,
  toDbId: string,
  fromCollId: string,
  toCollId: string
) => {
  let fromCollDocs = await tryAwaitWithRetry(async () =>
    db.listDocuments(fromDbId, fromCollId, [Query.limit(50)])
  );
  let totalDocumentsTransferred = 0;

  if (fromCollDocs.documents.length === 0) {
    console.log(`No documents found in collection ${fromCollId}`);
    return;
  } else if (fromCollDocs.documents.length < 50) {
    const batchedPromises = fromCollDocs.documents.map((doc) => {
      const toCreateObject: Partial<typeof doc> = {
        ...doc,
      };
      delete toCreateObject.$databaseId;
      delete toCreateObject.$collectionId;
      delete toCreateObject.$createdAt;
      delete toCreateObject.$updatedAt;
      delete toCreateObject.$id;
      delete toCreateObject.$permissions;
      return tryAwaitWithRetry(
        async () =>
          await db.createDocument(
            toDbId,
            toCollId,
            doc.$id,
            toCreateObject,
            doc.$permissions
          )
      );
    });
    await Promise.all(batchedPromises);
    totalDocumentsTransferred += fromCollDocs.documents.length;
  } else {
    const batchedPromises = fromCollDocs.documents.map((doc) => {
      const toCreateObject: Partial<typeof doc> = {
        ...doc,
      };
      delete toCreateObject.$databaseId;
      delete toCreateObject.$collectionId;
      delete toCreateObject.$createdAt;
      delete toCreateObject.$updatedAt;
      delete toCreateObject.$id;
      delete toCreateObject.$permissions;
      return tryAwaitWithRetry(async () =>
        db.createDocument(
          toDbId,
          toCollId,
          doc.$id,
          toCreateObject,
          doc.$permissions
        )
      );
    });
    await Promise.all(batchedPromises);
    totalDocumentsTransferred += fromCollDocs.documents.length;
    while (fromCollDocs.documents.length === 50) {
      fromCollDocs = await tryAwaitWithRetry(
        async () =>
          await db.listDocuments(fromDbId, fromCollId, [
            Query.limit(50),
            Query.cursorAfter(
              fromCollDocs.documents[fromCollDocs.documents.length - 1].$id
            ),
          ])
      );
      const batchedPromises = fromCollDocs.documents.map((doc) => {
        const toCreateObject: Partial<typeof doc> = {
          ...doc,
        };
        delete toCreateObject.$databaseId;
        delete toCreateObject.$collectionId;
        delete toCreateObject.$createdAt;
        delete toCreateObject.$updatedAt;
        delete toCreateObject.$id;
        delete toCreateObject.$permissions;
        return tryAwaitWithRetry(
          async () =>
            await db.createDocument(
              toDbId,
              toCollId,
              doc.$id,
              toCreateObject,
              doc.$permissions
            )
        );
      });
      await Promise.all(batchedPromises);
      totalDocumentsTransferred += fromCollDocs.documents.length;
    }
  }

  console.log(
    `Transferred ${totalDocumentsTransferred} documents from database ${fromDbId} to database ${toDbId} -- collection ${fromCollId} to collection ${toCollId}`
  );
};

export const transferDocumentsBetweenDbsLocalToRemote = async (
  localDb: Databases,
  endpoint: string,
  projectId: string,
  apiKey: string,
  fromDbId: string,
  toDbId: string,
  fromCollId: string,
  toCollId: string
) => {
  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);
  let totalDocumentsTransferred = 0;
  const remoteDb = new Databases(client);
  let fromCollDocs = await tryAwaitWithRetry(async () =>
    localDb.listDocuments(fromDbId, fromCollId, [Query.limit(50)])
  );

  if (fromCollDocs.documents.length === 0) {
    console.log(`No documents found in collection ${fromCollId}`);
    return;
  } else if (fromCollDocs.documents.length < 50) {
    const batchedPromises = fromCollDocs.documents.map((doc) => {
      const toCreateObject: Partial<typeof doc> = {
        ...doc,
      };
      delete toCreateObject.$databaseId;
      delete toCreateObject.$collectionId;
      delete toCreateObject.$createdAt;
      delete toCreateObject.$updatedAt;
      delete toCreateObject.$id;
      delete toCreateObject.$permissions;
      return tryAwaitWithRetry(async () =>
        remoteDb.createDocument(
          toDbId,
          toCollId,
          doc.$id,
          toCreateObject,
          doc.$permissions
        )
      );
    });
    await Promise.all(batchedPromises);
    totalDocumentsTransferred += fromCollDocs.documents.length;
  } else {
    const batchedPromises = fromCollDocs.documents.map((doc) => {
      const toCreateObject: Partial<typeof doc> = {
        ...doc,
      };
      delete toCreateObject.$databaseId;
      delete toCreateObject.$collectionId;
      delete toCreateObject.$createdAt;
      delete toCreateObject.$updatedAt;
      delete toCreateObject.$id;
      delete toCreateObject.$permissions;
      return tryAwaitWithRetry(async () =>
        remoteDb.createDocument(
          toDbId,
          toCollId,
          doc.$id,
          toCreateObject,
          doc.$permissions
        )
      );
    });
    await Promise.all(batchedPromises);
    totalDocumentsTransferred += fromCollDocs.documents.length;
    while (fromCollDocs.documents.length === 50) {
      fromCollDocs = await tryAwaitWithRetry(async () =>
        localDb.listDocuments(fromDbId, fromCollId, [
          Query.limit(50),
          Query.cursorAfter(
            fromCollDocs.documents[fromCollDocs.documents.length - 1].$id
          ),
        ])
      );
      const batchedPromises = fromCollDocs.documents.map((doc) => {
        const toCreateObject: Partial<typeof doc> = {
          ...doc,
        };
        delete toCreateObject.$databaseId;
        delete toCreateObject.$collectionId;
        delete toCreateObject.$createdAt;
        delete toCreateObject.$updatedAt;
        delete toCreateObject.$id;
        delete toCreateObject.$permissions;
        return tryAwaitWithRetry(async () =>
          remoteDb.createDocument(
            toDbId,
            toCollId,
            doc.$id,
            toCreateObject,
            doc.$permissions
          )
        );
      });
      await Promise.all(batchedPromises);
      totalDocumentsTransferred += fromCollDocs.documents.length;
    }
  }
  console.log(
    `Total documents transferred from database ${fromDbId} to database ${toDbId} -- collection ${fromCollId} to collection ${toCollId}: ${totalDocumentsTransferred}`
  );
};
