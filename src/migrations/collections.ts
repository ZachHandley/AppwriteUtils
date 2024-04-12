import { Databases, ID, Permission, Query, type Models } from "node-appwrite";
import type { AppwriteConfig, CollectionCreate } from "./schema.js";
import { nameToIdMapping, processQueue } from "./queue.js";
import { createUpdateCollectionAttributes } from "./attributes.js";
import { createOrUpdateIndexes } from "./indexes.js";
import {
  ensureDirectoryExistence,
  toCamelCase,
  toPascalCase,
  writeFileSync,
} from "../utils/index.js";
import _ from "lodash";
import { createSchemaString } from "./schemaStrings.js";
import path from "path";

const { join } = _;

export const documentExists = async (
  db: Databases,
  dbId: string,
  targetCollectionId: string,
  toCreateObject: any
): Promise<boolean> => {
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
  return result.documents.length > 0 && result.total > 0;
};

export const checkForCollection = async (
  db: Databases,
  dbId: string,
  collection: Partial<CollectionCreate>
): Promise<Models.Collection | null> => {
  try {
    console.log(`Checking for collection with name: ${collection.name}`);
    const response = await db.listCollections(dbId, [
      Query.equal("name", collection.name!),
    ]);
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
    return await db.getCollection(dbId, collectionId!);
  } else {
    console.log(`\tFetching collection by name: ${collectionName}`);
    const collectionsPulled = await db.listCollections(dbId, [
      Query.equal("name", collectionName),
    ]);
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
  const { collections: existingCollections } = await database.listCollections(
    databaseId
  );
  let collectionsDeleted: { collectionId: string; collectionName: string }[] =
    [];
  for (const { $id: collectionId, name: name } of existingCollections) {
    console.log(`Deleting collection: ${collectionId}`);
    collectionsDeleted.push({
      collectionId: collectionId,
      collectionName: name,
    });
    await database.deleteCollection(databaseId, collectionId);
  }
  return collectionsDeleted;
};

export const generateSchemas = async (
  config: AppwriteConfig,
  appwriteFolderPath: string
): Promise<void> => {
  const configCollections = config.collections;
  for (const { attributes, ...collection } of configCollections) {
    console.log(`Processing schema for collection: ${collection.name}`);
    const camelCaseName = toCamelCase(collection.name);
    const schemaName = toPascalCase(collection.name);
    const schemaString = createSchemaString(schemaName, attributes);
    const schemaPath = path.join(appwriteFolderPath, "schemas");
    console.log(`Writing schema to: ${schemaPath}`);
    const schemaFile = `${schemaPath}/${camelCaseName}.ts`;

    ensureDirectoryExistence(schemaFile);
    writeFileSync(schemaFile, schemaString, { flag: "w" });
  }
};

export const createOrUpdateCollections = async (
  database: Databases,
  databaseId: string,
  config: AppwriteConfig,
  deletedCollections?: { collectionId: string; collectionName: string }[]
): Promise<void> => {
  const configCollections = config.collections;
  for (const { attributes, indexes, ...collection } of configCollections) {
    let collectionsFound = await database.listCollections(databaseId, [
      Query.equal("name", collection.name),
    ]);

    const permissions = [];
    if (collection.$permissions.length > 0) {
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
    let collectionToUse =
      collectionsFound.total > 0 ? collectionsFound.collections[0] : null;
    if (!collectionToUse) {
      console.log(`Creating collection: ${collection.name}`);
      if (deletedCollections && deletedCollections.length > 0) {
        const foundColl = deletedCollections.find(
          (coll) =>
            coll.collectionName.toLowerCase().trim().replace(" ", "") ===
            collection.name.toLowerCase().trim().replace(" ", "")
        );
        if (foundColl) {
          const collectionId = foundColl.collectionId || ID.unique();
          console.log(
            `Processing collection: ${collection.name} with ID: ${collectionId}`
          );
          collectionToUse = await database.createCollection(
            databaseId,
            collectionId,
            collection.name,
            permissions,
            collection.documentSecurity,
            collection.enabled
          );
          nameToIdMapping.set(collection.name, collectionToUse.$id);
        } else {
          collectionToUse = await database.createCollection(
            databaseId,
            ID.unique(),
            collection.name,
            permissions,
            collection.documentSecurity,
            collection.enabled
          );
          nameToIdMapping.set(collection.name, collectionToUse.$id);
        }
      } else {
        collectionToUse = await database.createCollection(
          databaseId,
          ID.unique(),
          collection.name,
          permissions,
          collection.documentSecurity,
          collection.enabled
        );
        nameToIdMapping.set(collection.name, collectionToUse.$id);
      }
    } else {
      console.log(`Collection ${collection.name} already exists.`);
    }
    console.log("Creating Attributes");
    await createUpdateCollectionAttributes(
      database,
      databaseId,
      collectionToUse,
      attributes
    );
    console.log("Creating Indexes");
    await createOrUpdateIndexes(
      databaseId,
      database,
      collectionToUse.$id,
      indexes
    );
  }
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
};
