import { indexSchema, type Index } from "appwrite-utils";
import { Databases, Query, type Models } from "node-appwrite";
import { tryAwaitWithRetry } from "../utils/helperFunctions.js";
// import {}

export const createOrUpdateIndex = async (
  dbId: string,
  db: Databases,
  collectionId: string,
  index: Index
) => {
  const existingIndex = await db.listIndexes(dbId, collectionId, [
    Query.equal("key", index.key),
  ]);
  if (existingIndex.total > 0) {
    await db.deleteIndex(dbId, collectionId, existingIndex.indexes[0].key);
  }
  const newIndex = await db.createIndex(
    dbId,
    collectionId,
    index.key,
    index.type,
    index.attributes,
    index.orders
  );
  return newIndex;
};

export const createOrUpdateIndexes = async (
  dbId: string,
  db: Databases,
  collectionId: string,
  indexes: Index[]
) => {
  for (const index of indexes) {
    await tryAwaitWithRetry(
      async () => await createOrUpdateIndex(dbId, db, collectionId, index)
    );
  }
};
