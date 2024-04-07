import { Databases, ID, Query, Storage, type Models } from "node-appwrite";
import { createOrUpdateAttribute } from "./attributes";
import {
  createOrUpdateCollections,
  generateSchemas,
  initOrUpdateCollections,
  wipeDatabase,
} from "./collections";
import { getMigrationCollectionSchemas } from "./backup";
import { toCamelCase } from "@/utils";
import { backupDatabase, initOrGetBackupStorage } from "./storage";
import { type AppwriteConfig } from "./schema";
import type { SetupOptions } from "@/utilsController";

export const setupMigrationDatabase = async (config: AppwriteConfig) => {
  // Create the migrations database if needed
  console.log("---------------------------------");
  console.log("Starting Migrations Setup");
  console.log("---------------------------------");
  const database = new Databases(config.appwriteClient!);
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

export const ensureDatabasesExist = async (config: AppwriteConfig) => {
  const database = new Databases(config.appwriteClient);
  const databasesToEnsure = config.databases;
  databasesToEnsure.push({
    $id: "migrations",
    name: "Migrations",
  });
  const dbNames = databasesToEnsure.map((db) => db.name);

  const existingDatabases = await database.list([Query.equal("name", dbNames)]);

  for (const db of databasesToEnsure) {
    if (!existingDatabases.databases.some((d) => d.name === db.name)) {
      await database.create(db.$id || ID.unique(), db.name, true);
      console.log(`${db.name} database created`);
    }
  }
};

export const wipeOtherDatabases = async (
  database: Databases,
  config: AppwriteConfig
) => {
  const databasesToKeep = config.databases.map((db) => db.name);
  databasesToKeep.push("migrations");
  const allDatabases = await database.list([
    Query.notEqual("name", databasesToKeep),
  ]);
  for (const db of allDatabases.databases) {
    if (!databasesToKeep.includes(db.name)) {
      await database.delete(db.$id);
      console.log(`Deleted database: ${db.name}`);
    }
  }
};

export const startSetup = async (
  database: Databases,
  storage: Storage,
  config: AppwriteConfig,
  setupOptions: SetupOptions
) => {
  await setupMigrationDatabase(config);

  if (config.enableBackups) {
    await initOrGetBackupStorage(storage);
  }
  if (config.enableWipeOtherDatabases) {
    await wipeOtherDatabases(database, config);
  }
  await ensureDatabasesExist(config);

  for (const db of config.databases) {
    console.log(`---------------------------------`);
    console.log(`Starting setup for database: ${db.name}`);
    console.log(`---------------------------------`);
    let deletedCollections:
      | { collectionId: string; collectionName: string }[]
      | undefined;
    if (setupOptions.wipeDatabases) {
      if (config.enableBackups) {
        await backupDatabase(database, db.$id, storage);
      }
      deletedCollections = await wipeDatabase(database, db.$id);
    }
    if (setupOptions.generateSchemas) {
      await generateSchemas(config.collections);
    }
    await createOrUpdateCollections(
      database,
      db.$id,
      config,
      deletedCollections
    );
    deletedCollections = undefined;
    if (setupOptions.importData) {
      // TODO: Figure out data importing
    }
    console.log(`---------------------------------`);
    console.log(`Finished setup for database: ${db.name}`);
    console.log(`---------------------------------`);
  }
};
