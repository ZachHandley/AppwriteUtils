import { Databases, Query, type Models } from "node-appwrite";
import { createOrUpdateAttribute } from "./attributes.js";
import { getMigrationCollectionSchemas } from "./backup.js";
import {
  areCollectionNamesSame,
  delay,
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
  let db: Models.Database | undefined;
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

  if (!db) {
    console.error("Failed to create or retrieve the migrations database");
    return;
  }

  for (const [collectionName, { collection, attributes }] of Object.entries(
    migrationCollectionsSetup
  )) {
    const collectionId = toCamelCase(collectionName);
    let collectionFound: Models.Collection | undefined;
    try {
      collectionFound = await tryAwaitWithRetry(
        async () => await database.getCollection(db.$id, collectionId),
        undefined,
        true
      );
      console.log(`Collection found: ${collectionId}`);
    } catch (e) {
      console.log(`Collection not found: ${collectionId}`);
      try {
        collectionFound = await tryAwaitWithRetry(
          async () =>
            await database.createCollection(
              db.$id,
              collectionId,
              collectionName,
              undefined,
              collection.documentSecurity,
              collection.enabled
            ),
          undefined,
          true
        );
        console.log(`Collection created: ${collectionId}`);
      } catch (createError) {
        console.error(
          `Failed to create collection: ${collectionId}`,
          createError
        );
        continue;
      }
    }

    if (!collectionFound) {
      console.error(`Failed to create or retrieve collection: ${collectionId}`);
      continue;
    }

    for (const attribute of attributes) {
      try {
        await createOrUpdateAttribute(
          database,
          db.$id,
          collectionFound,
          attribute
        );
        await delay(100);
        console.log(`Attribute created/updated: ${attribute.key}`);
      } catch (attrError) {
        console.error(
          `Failed to create/update attribute: ${attribute.key}`,
          attrError
        );
      }
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
    console.log("Creating all databases except migrations");
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
