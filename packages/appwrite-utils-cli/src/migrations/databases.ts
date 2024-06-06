import {
  Client,
  Databases,
  IndexType,
  Query,
  type Models,
} from "node-appwrite";
import {
  getAppwriteClient,
  tryAwaitWithRetry,
} from "../utils/helperFunctions.js";
import {
  transferDocumentsBetweenDbsLocalToLocal,
  transferDocumentsBetweenDbsLocalToRemote,
} from "./collections.js";
import { createOrUpdateAttribute } from "./attributes.js";
import { parseAttribute } from "appwrite-utils";

export const fetchAllDatabases = async (
  database: Databases
): Promise<Models.Database[]> => {
  const databases = await tryAwaitWithRetry(
    async () => await database.list([Query.limit(25)])
  );
  const allDatabases = databases.databases;
  let lastDatabaseId = allDatabases[allDatabases.length - 1].$id;
  if (databases.databases.length < 25) {
    return allDatabases;
  } else {
    while (lastDatabaseId) {
      const databases = await database.list([
        Query.limit(25),
        Query.cursorAfter(lastDatabaseId),
      ]);
      allDatabases.push(...databases.databases);
      if (databases.databases.length < 25) {
        break;
      }
      lastDatabaseId = databases.databases[databases.databases.length - 1].$id;
    }
  }
  return allDatabases;
};

/**
 * Transfers all collections and documents from one local database to another local database.
 *
 * @param {Databases} localDb - The local database instance.
 * @param {string} fromDbId - The ID of the source database.
 * @param {string} targetDbId - The ID of the target database.
 * @return {Promise<void>} A promise that resolves when the transfer is complete.
 */
export const transferDatabaseLocalToLocal = async (
  localDb: Databases,
  fromDbId: string,
  targetDbId: string
) => {
  let lastCollectionId: string | undefined;
  let fromCollections = await tryAwaitWithRetry(
    async () => await localDb.listCollections(fromDbId, [Query.limit(50)])
  );
  const allFromCollections = fromCollections.collections;
  if (fromCollections.collections.length < 50) {
    lastCollectionId = undefined;
  } else {
    lastCollectionId =
      fromCollections.collections[fromCollections.collections.length - 1].$id;
    while (lastCollectionId) {
      const collections = await localDb.listCollections(fromDbId, [
        Query.limit(50),
        Query.cursorAfter(lastCollectionId),
      ]);
      allFromCollections.push(...collections.collections);
      if (collections.collections.length < 50) {
        break;
      }
      lastCollectionId =
        collections.collections[collections.collections.length - 1].$id;
    }
  }
  lastCollectionId = undefined;
  let toCollections = await tryAwaitWithRetry(
    async () => await localDb.listCollections(targetDbId, [Query.limit(50)])
  );
  const allToCollections = toCollections.collections;
  if (toCollections.collections.length < 50) {
  } else {
    lastCollectionId =
      toCollections.collections[toCollections.collections.length - 1].$id;
    while (lastCollectionId) {
      const collections = await localDb.listCollections(targetDbId, [
        Query.limit(50),
        Query.cursorAfter(lastCollectionId),
      ]);
      allToCollections.push(...collections.collections);
      if (collections.collections.length < 50) {
        lastCollectionId = undefined;
      } else {
        lastCollectionId =
          collections.collections[collections.collections.length - 1].$id;
      }
    }
  }
  for (const collection of allFromCollections) {
    const toCollection = allToCollections.find((c) => c.$id === collection.$id);
    if (toCollection) {
      await transferDocumentsBetweenDbsLocalToLocal(
        localDb,
        fromDbId,
        targetDbId,
        collection.$id,
        toCollection.$id
      );
    } else {
      console.log(
        `Collection ${collection.name} not found in destination database, creating...`
      );
      const newCollection = await tryAwaitWithRetry(
        async () =>
          await localDb.createCollection(
            targetDbId,
            collection.$id,
            collection.name,
            collection.$permissions,
            collection.documentSecurity,
            collection.enabled
          )
      );
      console.log(`Collection ${newCollection.name} created`);
      for (const attribute of collection.attributes) {
        await tryAwaitWithRetry(
          async () =>
            await createOrUpdateAttribute(
              localDb,
              targetDbId,
              newCollection,
              parseAttribute(attribute as any)
            )
        );
      }
      for (const index of collection.indexes) {
        await tryAwaitWithRetry(
          async () =>
            await localDb.createIndex(
              targetDbId,
              newCollection.$id,
              index.key,
              index.type as IndexType,
              index.attributes,
              index.orders
            )
        );
      }
      await transferDocumentsBetweenDbsLocalToLocal(
        localDb,
        fromDbId,
        targetDbId,
        collection.$id,
        newCollection.$id
      );
    }
  }
};

export const transferDatabaseLocalToRemote = async (
  localDb: Databases,
  endpoint: string,
  projectId: string,
  apiKey: string,
  fromDbId: string,
  toDbId: string
) => {
  const client = getAppwriteClient(endpoint, projectId, apiKey);
  const remoteDb = new Databases(client);

  let lastCollectionId: string | undefined;
  let fromCollections = await tryAwaitWithRetry(
    async () => await localDb.listCollections(fromDbId, [Query.limit(50)])
  );
  const allFromCollections = fromCollections.collections;
  if (fromCollections.collections.length < 50) {
  } else {
    lastCollectionId =
      fromCollections.collections[fromCollections.collections.length - 1].$id;
    while (lastCollectionId) {
      const collections = await tryAwaitWithRetry(
        async () =>
          await localDb.listCollections(fromDbId, [
            Query.limit(50),
            Query.cursorAfter(lastCollectionId!),
          ])
      );
      allFromCollections.push(...collections.collections);
      if (collections.collections.length < 50) {
        break;
      }
      lastCollectionId =
        collections.collections[collections.collections.length - 1].$id;
    }
  }

  for (const collection of allFromCollections) {
    const toCollection = await tryAwaitWithRetry(
      async () =>
        await remoteDb.createCollection(
          toDbId,
          collection.$id,
          collection.name,
          collection.$permissions,
          collection.documentSecurity,
          collection.enabled
        )
    );
    console.log(`Collection ${toCollection.name} created`);

    for (const attribute of collection.attributes) {
      await tryAwaitWithRetry(
        async () =>
          await createOrUpdateAttribute(
            remoteDb,
            toDbId,
            toCollection,
            parseAttribute(attribute as any)
          )
      );
    }

    for (const index of collection.indexes) {
      await tryAwaitWithRetry(
        async () =>
          await remoteDb.createIndex(
            toDbId,
            toCollection.$id,
            index.key,
            index.type as IndexType,
            index.attributes,
            index.orders
          )
      );
    }

    await transferDocumentsBetweenDbsLocalToRemote(
      localDb,
      endpoint,
      projectId,
      apiKey,
      fromDbId,
      toDbId,
      collection.$id,
      toCollection.$id
    );
  }
};
