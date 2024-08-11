import { Databases, Query, type Models } from "node-appwrite";
import { createOrUpdateAttribute } from "./attributes.js";
import { getMigrationCollectionSchemas } from "./backup.js";
import {
  areCollectionNamesSame,
  toCamelCase,
  tryAwaitWithRetry,
} from "../utils/index.js";
import { type AppwriteConfig } from "appwrite-utils";
import { ulid } from "ulidx";

export const setupMigrationDatabase = async (config: AppwriteConfig) => {
  console.log("---------------------------------");
  console.log("Starting Migrations Setup");
  console.log("---------------------------------");
  const database = new Databases(config.appwriteClient!);
  let db: Models.Database | null = null;
  const migrationCollectionsSetup = getMigrationCollectionSchemas();

  try {
    db = await tryAwaitWithRetry(
      async () => await database.get("migrations"),
      undefined,
      true
    );
    console.log("Migrations database found");
  } catch (e) {
    db = await tryAwaitWithRetry(
      async () => await database.create("migrations", "Migrations", true)
    );
    console.log("Migrations database created");
  }

  for (const [collectionName, { collection, attributes }] of Object.entries(
    migrationCollectionsSetup
  )) {
    const collectionId = toCamelCase(collectionName);
    let collectionFound: Models.Collection | null = null;
    try {
      collectionFound = await tryAwaitWithRetry(
        async () => await database.getCollection(db!.$id, collectionId)
      );
    } catch (e) {
      console.log(`Collection not found: ${collectionId}`);
      collectionFound = await tryAwaitWithRetry(
        async () =>
          await database.createCollection(
            db!.$id,
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
        db!.$id,
        collectionFound!,
        attribute
      );
    }
  }
  console.log("---------------------------------");
  console.log("Migrations Setup Complete");
  console.log("---------------------------------");
};

export const ensureDatabasesExist = async (config: AppwriteConfig) => {
  const database = new Databases(config.appwriteClient!);
  const databasesToEnsure = config.databases;

  const existingDatabases = await tryAwaitWithRetry(
    async () => await database.list([Query.limit(500)])
  );

  const migrationsDatabase = existingDatabases.databases.find(
    (d) => d.name.toLowerCase().trim().replace(" ", "") === "migrations"
  );
  if (existingDatabases.databases.length !== 0 && migrationsDatabase) {
    console.log("Wiping all databases except migrations");
    databasesToEnsure.push(migrationsDatabase);
  }

  for (const db of databasesToEnsure) {
    if (!existingDatabases.databases.some((d) => d.name === db.name)) {
      await tryAwaitWithRetry(
        async () => await database.create(db.$id || ulid(), db.name, true)
      );
      console.log(`${db.name} database created`);
    }
  }
};

export const wipeOtherDatabases = async (
  database: Databases,
  databasesToKeep: Models.Database[]
) => {
  console.log(`Databases to keep: ${databasesToKeep.join(", ")}`);
  const allDatabases = await tryAwaitWithRetry(
    async () => await database.list([Query.limit(500)])
  );
  const migrationsDatabase = allDatabases.databases.find(
    (d) => d.name.toLowerCase().trim().replace(" ", "") === "migrations"
  );
  if (allDatabases.databases.length !== 0 && migrationsDatabase) {
    console.log("Wiping all databases except migrations");
    databasesToKeep.push(migrationsDatabase);
  }
  for (const db of allDatabases.databases) {
    if (!databasesToKeep.some((d) => d.name === db.name)) {
      await tryAwaitWithRetry(async () => await database.delete(db.$id));
      console.log(`Deleted database: ${db.name}`);
    }
  }
};
