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

export const fetchAllDatabases = async (
  database: Databases
): Promise<Models.Database[]> => {
  const databases = await tryAwaitWithRetry(
    async () => await database.list([Query.limit(25)])
  );
  const allDatabases = databases.databases;
  if (allDatabases.length === 0) return [];
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
