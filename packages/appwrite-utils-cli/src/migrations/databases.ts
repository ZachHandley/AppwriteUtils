import { Databases, Query, type Models } from "node-appwrite";

export const fetchAllDatabases = async (
  database: Databases
): Promise<Models.Database[]> => {
  const databases = await database.list([Query.limit(25)]);
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
