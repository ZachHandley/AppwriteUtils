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
import {
  nameToIdMapping,
  enqueueOperation,
  processQueue,
  documentExists,
} from "./queue";
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
  maxDataLength,
  splitIntoBatches,
  updateOperation,
} from "./migrationHelper";
import { globallyConvertAll } from "./conversions";
import { resolveAndUpdateRelationships } from "./relationships";

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
    const schemaPath = join(__dirname, "../../schemas");
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

// Map of collection name to array of documents so we can update the relationships
const documentsWithRelationships = new Map<string, Models.Document[]>();

const importData = async (
  database: Databases,
  databaseId: string,
  configCollections: any[]
): Promise<void> => {
  // let relationshipInfo: Record<string, any[]> = {};
  await globallyConvertAll();
  for (const { collection, attributes, convertFunction } of configCollections) {
    if (!convertFunction) continue;

    // Identify if the collection has a relationship with any other collection
    const hasRelationship = attributes.some(
      (attribute: Attribute) => attribute.type === "relationship"
    );

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
      const batches = splitIntoBatches(dataToImport);
      console.log(`Creating ${batches.length} batches...`);
      for (const batchData of batches) {
        console.log(
          `Creating batch with ${batchData.length} documents of length ${
            JSON.stringify(batchData).length
          }`
        );
        const batchDataLength = JSON.stringify(batchData);
        if (batchDataLength.length > maxDataLength) {
          console.log(`batchData bigger than allowed, handling`);
        }
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

      // Prepare to check each document in the batch for existence
      const existenceChecks = batchData.map((data: any) =>
        documentExists(database, databaseId, existingCollection.$id, data)
      );
      if (hasRelationship) {
        const relationshipInfo = attributes.filter(
          (attribute: Attribute) => attribute.type === "relationship"
        );
        for (const relationship of relationshipInfo) {
          if (relationship.relatedCollection) {
            documentsWithRelationships.set(
              relationship.relatedCollection,
              batchData
            );
          }
        }
      }

      // Execute all existence checks in parallel
      const existenceResults = await Promise.all(existenceChecks);

      // Process documents based on existence check results
      const creationPromises: Promise<Models.Document>[] = [];
      const processingPromises = batchData.map(
        async (data: any, index: number) => {
          // If document does not exist, create it
          if (!existenceResults[index]) {
            creationPromises.push(
              database.createDocument(
                databaseId,
                existingCollection.$id,
                ID.unique(),
                data
              )
            );
            processed++;
          } else {
            console.log(`Document already exists, skipping creation.`);
            processed++;
            return Promise.resolve(); // No operation needed, return resolved promise
          }
        }
      );

      // Wait for all processing promises to complete
      console.log(`Processing ${processingPromises.length} documents...`);
      await Promise.all(processingPromises);
      console.log(`Processed ${processingPromises.length} documents...`);
      const createdDocuments = await Promise.all(creationPromises);
      console.log(`Created ${createdDocuments.length} documents...`);

      // Update operation progress after processing the batch
      await updateOperation(database, operation.$id, {
        progress: processed,
      });

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

export const checkForDuplicatesInCollections = async (
  database: Databases,
  databaseId: string
): Promise<void> => {
  console.log(
    `Checking for duplicates in all collections of database: ${databaseId}`
  );
  try {
    // List all collections in the database
    const { collections } = await database.listCollections(databaseId);
    for (const collection of collections) {
      console.log(`Checking collection: ${collection.name} for duplicates`);

      let lastDocumentId: string | undefined;
      let moreDocuments = true;
      let duplicateCount = 0;

      while (moreDocuments) {
        // Fetch documents in batches of 500
        const documentsResponse = await database.listDocuments(
          databaseId,
          collection.$id,
          [
            Query.limit(500),
            ...(lastDocumentId ? [Query.cursorAfter(lastDocumentId)] : []),
          ]
        );

        // Check each document for duplicates using the documentExists function
        for (const document of documentsResponse.documents) {
          const exists = await documentExists(
            database,
            databaseId,
            collection.$id,
            document
          );
          if (exists) {
            console.log(
              `Potential duplicate found in collection ${collection.name} for document ID: ${document.$id}`
            );
            duplicateCount++;
          }
        }

        // Determine if there are more documents to fetch
        moreDocuments = documentsResponse.documents.length === 500;
        if (moreDocuments) {
          lastDocumentId =
            documentsResponse.documents[documentsResponse.documents.length - 1]
              .$id;
        }
      }

      if (duplicateCount > 0) {
        console.log(
          `Found ${duplicateCount} potential duplicates in collection ${collection.name}.`
        );
      } else {
        console.log(`No duplicates found in collection ${collection.name}.`);
      }
    }
    console.log("Finished checking for duplicates.");
  } catch (error) {
    console.error(`Error checking for duplicates: ${error}`);
  }
};

export const initOrUpdateCollections = async (
  database: Databases,
  storage: Storage,
  databaseId: string,
  shouldWipeDb: boolean = false,
  generateSchemasFlag: boolean = false,
  shouldGenerateMockData: boolean = false,
  shouldImportData: boolean = false,
  checkDuplicates: boolean = false
): Promise<void> => {
  const configCollections: any[] = Object.values(COLLECTIONS_CONFIG);
  const sortedCollections = sortCollections(configCollections);
  if (shouldWipeDb || shouldGenerateMockData || shouldImportData) {
    await backupDatabase(database, databaseId, storage);
  }

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

    console.log("---------------------------------");
    console.log("Starting Resolve Relationships");
    console.log("---------------------------------");
    await resolveAndUpdateRelationships(databaseId, database);

    console.log("---------------------------------");
    console.log("Finished Resolve Relationships");
    console.log("---------------------------------");
  }

  if (checkDuplicates) {
    console.log("---------------------------------");
    console.log("Starting Check Duplicates");
    console.log("---------------------------------");

    // await checkForDuplicatesInCollections(database, databaseId);

    console.log("---------------------------------");
    console.log("Finished Check Duplicates");
    console.log("---------------------------------");
  }
};
