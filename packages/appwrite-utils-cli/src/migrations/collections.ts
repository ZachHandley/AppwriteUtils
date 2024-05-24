import {
  Client,
  Databases,
  ID,
  Permission,
  Query,
  type Models,
} from "node-appwrite";
import type { AppwriteConfig, CollectionCreate } from "appwrite-utils";
import { nameToIdMapping, processQueue } from "./queue.js";
import { createUpdateCollectionAttributes } from "./attributes.js";
import { createOrUpdateIndexes } from "./indexes.js";
import _ from "lodash";
import { SchemaGenerator } from "./schemaStrings.js";
import { tryAwaitWithRetry } from "../utils/helperFunctions.js";

export const documentExists = async (
  db: Databases,
  dbId: string,
  targetCollectionId: string,
  toCreateObject: any
): Promise<Models.Document | null> => {
  // Had to do this because kept running into issues with type checking arrays so, sorry 40ms
  const collection = await db.getCollection(dbId, targetCollectionId);
  const attributes = collection.attributes as any[];
  let arrayTypeAttributes = attributes
    .filter((attribute: any) => attribute.array === true)
    .map((attribute: any) => attribute.key);
  // Function to check if a string is JSON
  const isJsonString = (str: string) => {
    try {
      const json = JSON.parse(str);
      return typeof json === "object" && json !== null; // Check if parsed JSON is an object or array
    } catch (e) {
      return false;
    }
  };

  // Validate and prepare query parameters
  const validQueryParams = _.chain(toCreateObject)
    .pickBy(
      (value, key) =>
        !arrayTypeAttributes.includes(key) &&
        !key.startsWith("$") &&
        !_.isNull(value) &&
        !_.isUndefined(value) &&
        !_.isEmpty(value) &&
        !_.isObject(value) && // Keeps excluding objects
        !_.isArray(value) && // Explicitly exclude arrays
        !(_.isString(value) && isJsonString(value)) && // Exclude JSON strings
        (_.isString(value) ? value.length < 4096 && value.length > 0 : true) // String length check
    )
    .mapValues((value, key) =>
      _.isString(value) || _.isNumber(value) || _.isBoolean(value)
        ? value
        : null
    )
    .omitBy(_.isNull) // Remove any null values that might have been added in mapValues
    .toPairs()
    .slice(0, 25) // Limit to 25 to adhere to query limit
    .map(([key, value]) => Query.equal(key, value as any))
    .value();

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
  }
  return collectionsDeleted;
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
  deletedCollections?: { collectionId: string; collectionName: string }[]
): Promise<void> => {
  const configCollections = config.collections;
  if (!configCollections) {
    return;
  }
  const usedIds = new Set(); // To track IDs used in this operation

  for (const { attributes, indexes, ...collection } of configCollections) {
    // Prepare permissions for the collection
    const permissions: string[] = [];
    if (collection.$permissions && collection.$permissions.length > 0) {
      for (const permission of collection.$permissions) {
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

    // Check if the collection already exists by name
    let collectionsFound = await tryAwaitWithRetry(
      async () =>
        await database.listCollections(databaseId, [
          Query.equal("name", collection.name),
        ])
    );

    let collectionToUse =
      collectionsFound.total > 0 ? collectionsFound.collections[0] : null;

    // Determine the correct ID for the collection
    let collectionId: string;
    if (!collectionToUse) {
      console.log(`Creating collection: ${collection.name}`);
      let foundColl = deletedCollections?.find(
        (coll) =>
          coll.collectionName.toLowerCase().trim().replace(" ", "") ===
          collection.name.toLowerCase().trim().replace(" ", "")
      );

      if (collection.$id) {
        collectionId = collection.$id; // Always use the provided $id if present
      } else if (foundColl && !usedIds.has(foundColl.collectionId)) {
        collectionId = foundColl.collectionId; // Use ID from deleted collection if not already used
      } else {
        collectionId = ID.unique(); // Generate a new unique ID
      }

      usedIds.add(collectionId); // Mark this ID as used

      // Create the collection with the determined ID
      try {
        collectionToUse = await tryAwaitWithRetry(
          async () =>
            await database.createCollection(
              databaseId,
              collectionId,
              collection.name,
              permissions,
              collection.documentSecurity ?? false,
              collection.enabled ?? true
            )
        );
        collection.$id = collectionToUse!.$id;
        nameToIdMapping.set(collection.name, collectionToUse!.$id);
      } catch (error) {
        console.error(
          `Failed to create collection ${collection.name} with ID ${collectionId}: ${error}`
        );
        continue; // Skip to the next collection on failure
      }
    } else {
      console.log(`Collection ${collection.name} exists, updating it`);
      await tryAwaitWithRetry(
        async () =>
          await database.updateCollection(
            databaseId,
            collectionToUse!.$id,
            collection.name,
            permissions,
            collection.documentSecurity ?? false,
            collection.enabled ?? true
          )
      );
    }

    // Update attributes and indexes for the collection
    console.log("Creating Attributes");
    await createUpdateCollectionAttributes(
      database,
      databaseId,
      collectionToUse!,
      attributes
    );
    console.log("Creating Indexes");
    await createOrUpdateIndexes(
      databaseId,
      database,
      collectionToUse!.$id,
      indexes ?? []
    );
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
