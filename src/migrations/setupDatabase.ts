import { Databases, Query, Storage, type Models } from "node-appwrite";
import { createOrUpdateAttribute } from "./attributes";
import { initOrUpdateCollections } from "./collections";
import { getMigrationCollectionSchemas } from "./schema";
import { toCamelCase } from "@/utils";
import { initOrGetBackupStorage } from "./storage";

export const setupMigrationDatabase = async (database: Databases) => {
  // Create the migrations database if needed
  console.log("---------------------------------");
  console.log("Starting Migrations Setup");
  console.log("---------------------------------");
  let db: Models.Database | null = null;
  const dbCollections: Models.Collection[] = [];
  const migrationCollectionsSetup = getMigrationCollectionSchemas();
  try {
    db = await database.get("migrations");
    console.log("Migrations database found");
  } catch (e) {
    db = await database.create("migrations", "Migrations", true);
    console.log("Migrations database created");
  }
  if (db) {
    const collectionsPulled = await database.listCollections(db.$id, [
      Query.limit(25),
    ]);
    dbCollections.push(...collectionsPulled.collections);
  }
  console.log(`Collections in migrations database: ${dbCollections.length}`);

  // Iterate over each key in the migrationCollectionsSetup object
  for (const [collectionName, { collection, attributes }] of Object.entries(
    migrationCollectionsSetup
  )) {
    const collectionId = toCamelCase(collectionName); // Convert name to toCamelCase for the ID
    let collectionFound: Models.Collection | null = null;
    try {
      collectionFound = await database.getCollection(db.$id, collectionId);
    } catch (e) {
      console.log(`Collection not found: ${collectionId}`);
    }
    if (!collectionFound) {
      // Create the collection with the provided configuration
      collectionFound = await database.createCollection(
        db.$id,
        collectionId,
        collectionName,
        undefined,
        collection.documentSecurity,
        collection.enabled
      );
    }
    for (const attribute of attributes) {
      await createOrUpdateAttribute(
        database,
        db.$id,
        collectionFound,
        attribute
      );
    }
  }
  console.log("---------------------------------");
  console.log("Migrations Setup Complete");
  console.log("---------------------------------");
};

interface SetupOptions {
  runMain: boolean;
  wipeDatabases: boolean;
  generateSchemas: boolean;
  generateMockData: boolean;
  importData: boolean;
  checkDuplicates: boolean;
}

async function ensureDatabasesExist(database: Databases, runMain: boolean) {
  const databasesToEnsure = ["dev", "migrations"];
  if (runMain) {
    databasesToEnsure.push("main");
  }

  const existingDatabases = await database.list([
    Query.equal("$id", databasesToEnsure),
  ]);

  const existingDatabaseIds = existingDatabases.databases.map((db) => db.$id);

  for (const dbId of databasesToEnsure) {
    if (!existingDatabaseIds.includes(dbId)) {
      let name = dbId.charAt(0).toUpperCase() + dbId.slice(1);
      if (dbId === "dev") {
        name = "Development";
      }
      await database.create(dbId, name, true);
      console.log(`${dbId} database created`);
    }
  }
}

async function wipeOtherDatabases(database: Databases) {
  const databasesToKeep = ["dev", "main", "migrations"];
  const allDatabases = await database.list();
  for (const db of allDatabases.databases) {
    if (!databasesToKeep.includes(db.$id)) {
      await database.delete(db.$id);
      console.log(`Deleted database: ${db.name}`);
    }
  }
}

export async function performDatabaseSetupActions(
  database: Databases,
  storage: Storage,
  options: SetupOptions
) {
  const {
    runMain,
    wipeDatabases,
    generateSchemas,
    generateMockData,
    importData,
    checkDuplicates,
  } = options;

  await ensureDatabasesExist(database, runMain);
  await setupMigrationDatabase(database);

  if (wipeDatabases) {
    await wipeOtherDatabases(database);
    await initOrUpdateCollections(
      database,
      storage,
      "dev",
      true,
      false,
      false,
      false,
      false
    );
    if (runMain) {
      await initOrUpdateCollections(
        database,
        storage,
        "main",
        true,
        false,
        false,
        false,
        false
      );
    }
  }

  // Assuming initOrGetBackupStorage is a function that initializes or retrieves backup storage
  await initOrGetBackupStorage(storage);

  // Assuming initOrUpdateCollections is a function that initializes or updates collections
  // This is a placeholder for where you would implement generating schemas, mock data, and importing data
  if (generateSchemas || generateMockData || importData) {
    await initOrUpdateCollections(
      database,
      storage,
      "dev",
      wipeDatabases,
      generateSchemas,
      generateMockData,
      importData,
      checkDuplicates
    );
    if (runMain) {
      await initOrUpdateCollections(
        database,
        storage,
        "main",
        wipeDatabases,
        generateSchemas,
        generateMockData,
        importData,
        checkDuplicates
      );
    }
  }
}
