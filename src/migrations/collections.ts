import {
  Databases,
  type Models,
  Storage,
  ID,
  Permission,
  Query,
} from "node-appwrite";
import { COLLECTIONS_CONFIG } from "./config";
import {
  type CollectionCreate,
  type Collection,
  type Attribute,
  createSchemaString,
  attributeSchema,
  type OperationCreate,
  OperationCreateSchema,
  OperationSchema,
  BatchSchema,
  type RelationshipAttribute,
} from "./schema";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { nameToIdMapping, enqueueOperation, processQueue } from "./queue";
import {
  writeFileSync,
  ensureDirectoryExistence,
  toCamelCase,
  toPascalCase,
} from "@/utils";
import { backupDatabase, logOperation } from "./storage";
import { createUpdateCollectionAttributes } from "./attributes";
import { sortCollections } from "./dbHelpers";
import {
  findOrCreateOperation,
  splitIntoBatches,
  updateOperation,
} from "./migrationHelper";

// Derive __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function isDependencyResolved(collectionName: string): boolean {
  // Check if the dependency (collection ID) is in our set of created collections
  return nameToIdMapping.has(collectionName);
}

const checkForCollection = async (
  db: Databases,
  dbId: string,
  collection: CollectionCreate
): Promise<Models.Collection | null> => {
  try {
    console.log(`Checking for collection with name: ${collection.name}`);
    const response = await db.listCollections(dbId, [
      Query.equal("name", collection.name),
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

const wipeDatabase = async (
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

const generateSchemas = async (
  configCollections: any[],
  databaseId: string
): Promise<void> => {
  for (const { collection, attributes } of configCollections) {
    console.log(`Processing schema for collection: ${collection.name}`);
    const camelCaseName = toCamelCase(collection.name);
    const schemaName = toPascalCase(collection.name);
    const schemaString = createSchemaString(schemaName, attributes);
    const schemaPath = join(__dirname, "../schemas");
    const schemaFile = `${schemaPath}/${camelCaseName}.ts`;

    ensureDirectoryExistence(schemaFile);
    writeFileSync(schemaFile, schemaString, { flag: "w" });
  }
};

const createOrUpdateCollections = async (
  database: Databases,
  databaseId: string,
  configCollections: any[],
  deletedCollections?: { collectionId: string; collectionName: string }[]
): Promise<void> => {
  for (const { collection, attributes } of configCollections) {
    let collectionToUse = await database
      .listCollections(databaseId, [Query.equal("name", collection.name)])
      .then((res) => res.collections[0] || null);

    if (!collectionToUse) {
      console.log(`Creating collection: ${collection.name}`);
      if (deletedCollections && deletedCollections.length > 0) {
        const foundColl = deletedCollections.find(
          (coll) => coll.collectionName === collection.name
        );
        if (foundColl) {
          enqueueOperation({
            type: "collection",
            collection,
            collectionId: foundColl.collectionId,
          });
        } else {
          enqueueOperation({
            type: "collection",
            collection,
          });
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
      }
    } else {
      console.log(`Collection ${collection.name} already exists.`);
    }
    await createUpdateCollectionAttributes(
      database,
      databaseId,
      collectionToUse,
      attributes
    );
  }
  await processQueue(database, databaseId);
};

const generateMockData = async (
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

const BATCH_SIZE = 20;

const importData = async (
  database: Databases,
  databaseId: string,
  configCollections: any[]
): Promise<void> => {
  for (const { collection, convertFunction } of configCollections) {
    if (!convertFunction) continue;

    const existingCollection = await checkForCollection(
      database,
      databaseId,
      collection
    );
    if (!existingCollection) {
      console.log(`Collection ${collection.name} does not exist.`);
      continue;
    }

    let operation = await findOrCreateOperation(
      database,
      existingCollection.$id,
      "importData"
    );
    let total = operation.total || 0;
    let processed = operation.progress || 0;

    if (!operation.batches || operation.batches.length === 0) {
      if (!operation.batches) {
        operation.batches = [];
      }
      const dataToImport = await convertFunction();
      total = dataToImport.length;
      processed = 0;
      const batches = splitIntoBatches(dataToImport, BATCH_SIZE);
      console.log(`Creating ${batches.length} batches...`);
      for (const batchData of batches) {
        console.log(`Creating batch with ${batchData.length} documents...`);
        const batchDocument = await database.createDocument(
          "migrations",
          "batches",
          ID.unique(),
          {
            data: JSON.stringify(batchData),
            processed: false,
          }
        );
        operation.batches.push(batchDocument.$id);
      }

      await updateOperation(database, operation.$id, {
        batches: operation.batches,
        total: total,
        progress: processed,
      });
    }

    for (const batchId of operation.batches) {
      let batchDocumentPulled: Models.Document | null = null;
      try {
        batchDocumentPulled = await database.getDocument(
          "migrations",
          "batches",
          batchId
        );
      } catch (e) {
        console.log(
          `Error: ${e} ---- Unable to find Batch with batch ID: ${batchId}. Skipping...`
        );
        continue;
      }
      const batchDocument = BatchSchema.parse(batchDocumentPulled);
      const batchData = JSON.parse(batchDocument.data);

      for (const data of batchData) {
        // Check for the data's existence to avoid duplicates
        const validEntries = Object.entries(data)
          .filter(([key, value]) => key !== undefined && value !== undefined)
          .slice(0, 5);

        // Construct the queries using the valid entries
        const queries = validEntries.map(([key, value]) =>
          Query.equal(key as string, value as string)
        );

        // Assuming listDocuments can take an array of queries to filter documents
        const existingDocuments = await database.listDocuments(
          databaseId,
          existingCollection.$id,
          [...queries, Query.limit(1)] // Add the limit to the queries array directly
        );

        if (existingDocuments.documents.length === 0) {
          // Document does not exist, proceed with creation
          await database.createDocument(
            databaseId,
            existingCollection.$id,
            ID.unique(),
            data
          );
          processed++;
          await updateOperation(database, operation.$id, {
            progress: processed,
          });
        } else {
          console.log(`Document with ID ${batchDocument.$id} already exists.`);
          processed++;
          await updateOperation(database, operation.$id, {
            total: total,
            progress: processed,
          });
          continue;
        }
      }

      // Mark batch as processed and cleanup
      await database.deleteDocument("migrations", "batches", batchId);
      // Update the operation's batches array because it contains the batchId
      operation.batches = operation.batches.filter((id) => id !== batchId);

      await updateOperation(database, operation.$id, {
        batches: operation.batches,
        progress: processed,
      });
    }

    // Clear the operation's batches array and mark as completed
    await updateOperation(database, operation.$id, {
      progress: processed,
      batches: [],
      status: "completed",
    });
  }
};

export const initOrUpdateCollections = async (
  database: Databases,
  storage: Storage,
  databaseId: string,
  shouldWipeDb: boolean = false,
  generateSchemasFlag: boolean = false,
  shouldGenerateMockData: boolean = false,
  shouldImportData: boolean = false
): Promise<void> => {
  const configCollections = Object.values(COLLECTIONS_CONFIG);
  const sortedCollections = sortCollections(configCollections);
  await backupDatabase(database, databaseId, storage);

  let deletedCollections:
    | { collectionId: string; collectionName: string }[]
    | undefined;
  if (shouldWipeDb) {
    console.log("---------------------------------");
    console.log("Starting Wipe Databases");
    console.log("---------------------------------");
    deletedCollections = await wipeDatabase(database, databaseId);

    console.log("---------------------------------");
    console.log("Finished Wipe Databases");
    console.log("---------------------------------");
  }
  if (generateSchemasFlag) {
    console.log("---------------------------------");
    console.log("Starting Generate Schemas");
    console.log("---------------------------------");
    await generateSchemas(sortedCollections, databaseId);

    console.log("---------------------------------");
    console.log("Finished Generate Schemas");
    console.log("---------------------------------");
  }

  console.log("---------------------------------");
  console.log("Starting Create/Update Collections");
  console.log("---------------------------------");
  await createOrUpdateCollections(
    database,
    databaseId,
    sortedCollections,
    deletedCollections
  );
  console.log("---------------------------------");
  console.log("Finished Create/Update Collections");
  console.log("---------------------------------");

  if (shouldGenerateMockData) {
    console.log("---------------------------------");
    console.log("Starting Generate Mock Data");
    console.log("---------------------------------");
    await generateMockData(database, databaseId, sortedCollections);

    console.log("---------------------------------");
    console.log("Finished Generate Mock Data");
    console.log("---------------------------------");
  }
  if (shouldImportData) {
    console.log("---------------------------------");
    console.log("Starting Import Data");
    console.log("---------------------------------");
    await importData(database, databaseId, sortedCollections);

    console.log("---------------------------------");
    console.log("Finished Import Data");
    console.log("---------------------------------");
  }
};
