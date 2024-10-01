import { Databases, Query, type Models } from "node-appwrite";
import { delay, tryAwaitWithRetry } from "../utils/helperFunctions.js";
import { fetchAllCollections } from "../collections/methods.js";

export const fetchAllDatabases = async (
  database: Databases
): Promise<Models.Database[]> => {
  const databases = await tryAwaitWithRetry(
    async () => await database.list([Query.limit(25)])
  );
  const allDatabases = databases.databases;
  if (allDatabases.length === 0) return [];
  let lastDatabaseId = allDatabases[allDatabases.length - 1].$id;

  while (databases.databases.length === 25) {
    const moreDatabases = await database.list([
      Query.limit(25),
      Query.cursorAfter(lastDatabaseId),
    ]);
    allDatabases.push(...moreDatabases.databases);
    if (moreDatabases.databases.length < 25) break;
    lastDatabaseId =
      moreDatabases.databases[moreDatabases.databases.length - 1].$id;
  }

  return allDatabases;
};

export const wipeDatabase = async (
  database: Databases,
  databaseId: string
): Promise<{ collectionId: string; collectionName: string }[]> => {
  console.log(`Wiping database: ${databaseId}`);
  const existingCollections = await fetchAllCollections(databaseId, database);
  let collectionsDeleted: { collectionId: string; collectionName: string }[] =
    [];

  for (const { $id: collectionId, name } of existingCollections) {
    console.log(`Deleting collection: ${collectionId}`);
    collectionsDeleted.push({ collectionId, collectionName: name });
    await tryAwaitWithRetry(
      async () => await database.deleteCollection(databaseId, collectionId)
    );
    await delay(100);
  }

  return collectionsDeleted;
};
