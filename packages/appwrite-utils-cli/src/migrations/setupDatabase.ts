import { Databases, ID, Query, Storage, type Models } from "node-appwrite";
import { createOrUpdateAttribute } from "./attributes.js";
import {
  createOrUpdateCollections,
  generateSchemas,
  wipeDatabase,
} from "./collections.js";
import { getMigrationCollectionSchemas } from "./backup.js";
import {
  areCollectionNamesSame,
  toCamelCase,
  tryAwaitWithRetry,
} from "../utils/index.js";
import {
  backupDatabase,
  initOrGetBackupStorage,
  initOrGetDocumentStorage,
  wipeDocumentStorage,
} from "./storage.js";
import { type AppwriteConfig } from "appwrite-utils";
import type { SetupOptions } from "../utilsController.js";
import { nameToIdMapping } from "./queue.js";
import { UsersController } from "./users.js";

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
    db = await tryAwaitWithRetry(async () => await database.get("migrations"));
    console.log("Migrations database found");
  } catch (e) {
    db = await tryAwaitWithRetry(
      async () => await database.create("migrations", "Migrations", true)
    );
    console.log("Migrations database created");
  }
  if (db) {
    const collectionsPulled = await tryAwaitWithRetry(
      async () => await database.listCollections(db.$id, [Query.limit(25)])
    );
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
      collectionFound = await tryAwaitWithRetry(
        async () => await database.getCollection(db.$id, collectionId)
      );
    } catch (e) {
      console.log(`Collection not found: ${collectionId}`);
    }
    if (!collectionFound) {
      // Create the collection with the provided configuration
      collectionFound = await tryAwaitWithRetry(
        async () =>
          await database.createCollection(
            db.$id,
            collectionId,
            collectionName,
            undefined,
            collection.documentSecurity,
            collection.enabled
          )
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

  const existingDatabases = await tryAwaitWithRetry(
    async () => await database.list([Query.equal("name", dbNames)])
  );

  for (const db of databasesToEnsure) {
    if (!existingDatabases.databases.some((d) => d.name === db.name)) {
      await tryAwaitWithRetry(
        async () => await database.create(db.$id || ID.unique(), db.name, true)
      );
      console.log(`${db.name} database created`);
    }
  }
};

export const wipeOtherDatabases = async (
  database: Databases,
  config: AppwriteConfig
) => {
  const databasesToKeep = config.databases.map((db) =>
    db.name.toLowerCase().trim().replace(" ", "")
  );
  databasesToKeep.push("migrations");
  console.log(`Databases to keep: ${databasesToKeep.join(", ")}`);
  const allDatabases = await tryAwaitWithRetry(
    async () => await database.list([Query.limit(500)])
  );
  for (const db of allDatabases.databases) {
    if (
      !databasesToKeep.includes(db.name.toLowerCase().trim().replace(" ", ""))
    ) {
      await tryAwaitWithRetry(async () => await database.delete(db.$id));
      console.log(`Deleted database: ${db.name}`);
    }
  }
};

export const startSetup = async (
  database: Databases,
  storage: Storage,
  config: AppwriteConfig,
  setupOptions: SetupOptions,
  appwriteFolderPath: string
) => {
  await setupMigrationDatabase(config);

  if (config.enableBackups) {
    await initOrGetBackupStorage(storage);
    if (setupOptions.wipeDocumentStorage) {
      if (setupOptions.runProd) {
        await initOrGetDocumentStorage(
          storage,
          config,
          config.databases[0].name
        );
        await wipeDocumentStorage(storage, config, config.databases[0].name);
      }
      if (setupOptions.runStaging) {
        await initOrGetDocumentStorage(
          storage,
          config,
          config.databases[1].name
        );
        await wipeDocumentStorage(storage, config, config.databases[1].name);
      }
      if (setupOptions.runDev) {
        await initOrGetDocumentStorage(
          storage,
          config,
          config.databases[2].name
        );
        await wipeDocumentStorage(storage, config, config.databases[2].name);
      }
    }
  }
  if (config.enableWipeOtherDatabases) {
    await wipeOtherDatabases(database, config);
  }
  if (setupOptions.wipeUsers) {
    const usersController = new UsersController(config, database);
    console.log("Wiping users");
    await usersController.wipeUsers();
    console.log("Users wiped");
  }
  await ensureDatabasesExist(config);

  const databaseNames = config.databases.map((db) => db.name);

  // Move to here so it always runs if it's set to true
  if (setupOptions.generateSchemas) {
    await generateSchemas(config, appwriteFolderPath);
  }

  for (const db of config.databases) {
    // Determine if the current database should be processed based on the setup options
    const processDatabase =
      (setupOptions.runProd &&
        areCollectionNamesSame(db.name, databaseNames[0])) ||
      (setupOptions.runStaging &&
        areCollectionNamesSame(db.name, databaseNames[1])) ||
      (setupOptions.runDev &&
        areCollectionNamesSame(db.name, databaseNames[2]));
    if (!processDatabase) {
      continue;
    } else {
      await initOrGetDocumentStorage(storage, config, db.name);
    }
    console.log(`---------------------------------`);
    console.log(`Starting setup for database: ${db.name}`);
    console.log(`---------------------------------`);
    let deletedCollections:
      | { collectionId: string; collectionName: string }[]
      | undefined;

    if (setupOptions.wipeDatabases && processDatabase) {
      if (config.enableBackups && setupOptions.doBackup) {
        await backupDatabase(database, db.$id, storage);
      }
      deletedCollections = await wipeDatabase(database, db.$id);
      // Add a delay to ensure the deletion process completes
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.log(`Waited a few seconds to let the database wipe complete...`);
    }

    if (processDatabase) {
      await createOrUpdateCollections(
        database,
        db.$id,
        config,
        deletedCollections
      );
    }

    deletedCollections = undefined;
    nameToIdMapping.clear();
    console.log(`---------------------------------`);
    console.log(`Finished setup for database: ${db.name}`);
    console.log(`---------------------------------`);
  }
};
