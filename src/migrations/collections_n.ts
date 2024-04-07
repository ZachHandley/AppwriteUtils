import { Databases, ID, Query, type Models } from "node-appwrite";
import type { AppwriteConfig, CollectionCreate } from "./schema";
import { nameToIdMapping, processQueue } from "./queue";
import { createUpdateCollectionAttributes } from "./attributes";
import { createOrUpdateIndexes } from "./indexes";
import {
  ensureDirectoryExistence,
  toCamelCase,
  toPascalCase,
  writeFileSync,
} from "@/utils";
import { join } from "lodash";
import { createSchemaString } from "./schemaStrings";

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
      return response.collections[0];
    } else {
      console.log(`No collection found with name: ${collection.name}`);
      return null;
    }
  } catch (error) {
    console.error(`Error checking for collection: ${error}`);
    return null;
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
  configCollections: AppwriteConfig["collections"]
): Promise<void> => {
  for (const { attributes, ...collection } of configCollections) {
    console.log(`Processing schema for collection: ${collection.name}`);
    const camelCaseName = toCamelCase(collection.name);
    const schemaName = toPascalCase(collection.name);
    const schemaString = createSchemaString(schemaName, attributes);
    const schemaPath = join(__dirname, "../../schemas");
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
    let collectionToUse =
      collectionsFound.total > 0 ? collectionsFound.collections[0] : null;

    if (!collectionToUse) {
      console.log(`Creating collection: ${collection.name}`);
      if (deletedCollections && deletedCollections.length > 0) {
        const foundColl = deletedCollections.find(
          (coll) =>
            coll.collectionName.toLowerCase() === collection.name.toLowerCase()
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
            collection.$permissions,
            collection.documentSecurity,
            collection.enabled
          );
          nameToIdMapping.set(collection.name, collectionToUse.$id);
        } else {
          collectionToUse = await database.createCollection(
            databaseId,
            ID.unique(),
            collection.name,
            collection.$permissions,
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
          collection.$permissions,
          collection.documentSecurity,
          collection.enabled
        );
        nameToIdMapping.set(collection.name, collectionToUse.$id);
      }
    } else {
      console.log(`Collection ${collection.name} already exists.`);
    }
    await createOrUpdateIndexes(
      databaseId,
      database,
      collectionToUse.$id,
      indexes
    );
    await createUpdateCollectionAttributes(
      database,
      databaseId,
      collectionToUse,
      attributes
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
