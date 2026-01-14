import { Databases, Query, type Models } from "node-appwrite";
import { tryAwaitWithRetry } from "appwrite-utils-helpers";
import { type AppwriteConfig } from "appwrite-utils";
import { ulid } from "ulidx";
import { MessageFormatter } from "appwrite-utils-helpers";

export const ensureDatabasesExist = async (config: AppwriteConfig, databasesToEnsure?: Models.Database[]) => {
  if (!config.appwriteClient) {
    throw new Error("Appwrite client is not initialized in the config");
  }
  const database = new Databases(config.appwriteClient);
  const databasesToCreate = databasesToEnsure || config.databases || [];

  if (!databasesToCreate.length) {
    MessageFormatter.info("No databases to create");
    return;
  }

  const existingDatabases = await tryAwaitWithRetry(
    async () => await database.list([Query.limit(500)])
  );

  for (const db of databasesToCreate) {
    if (!existingDatabases.databases.some((d) => d.name === db.name)) {
      await tryAwaitWithRetry(
        async () => await database.create(db.$id || ulid(), db.name, true)
      );
      MessageFormatter.success(`${db.name} database created`);
    }
  }
};

export const wipeOtherDatabases = async (
  database: Databases,
  databasesToKeep: Models.Database[]
) => {
  MessageFormatter.info(`Databases to keep: ${databasesToKeep.map(db => db.name).join(", ")}`);
  const allDatabases = await tryAwaitWithRetry(
    async () => await database.list([Query.limit(500)])
  );
  for (const db of allDatabases.databases) {
    if (!databasesToKeep.some((d) => d.name === db.name)) {
      await tryAwaitWithRetry(async () => await database.delete(db.$id));
      MessageFormatter.success(`Deleted database: ${db.name}`);
    }
  }
};

export const ensureCollectionsExist = async (
  config: AppwriteConfig,
  database: Models.Database,
  collectionsToEnsure?: Models.Collection[]
) => {
  const databaseClient = new Databases(config.appwriteClient!);
  const collectionsToCreate = collectionsToEnsure || 
    (config.collections ? config.collections : []);

  const existingCollections = await tryAwaitWithRetry(
    async () => await databaseClient.listCollections(database.$id, [Query.limit(500)])
  );

  for (const collection of collectionsToCreate) {
    if (!existingCollections.collections.some((c) => c.name === collection.name)) {
      await tryAwaitWithRetry(
        async () => await databaseClient.createCollection(
          database.$id,
          ulid(),
          collection.name,
          undefined,
          true,
          true
        )
      );
      MessageFormatter.success(`${collection.name} collection created in ${database.name}`);
    }
  }
};
