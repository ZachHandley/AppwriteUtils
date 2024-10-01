import { indexSchema, type Index } from "appwrite-utils";
import { Databases, IndexType, Query, type Models } from "node-appwrite";
import { delay, tryAwaitWithRetry } from "../utils/helperFunctions.js";

export const createOrUpdateIndex = async (
  dbId: string,
  db: Databases,
  collectionId: string,
  index: Index
) => {
  const existingIndex = await db.listIndexes(dbId, collectionId, [
    Query.equal("key", index.key),
  ]);
  let createIndex = false;
  let newIndex: Models.Index | null = null;
  if (
    existingIndex.total > 0 &&
    !existingIndex.indexes.some(
      (existingIndex) =>
        (existingIndex.key === index.key &&
          existingIndex.type === index.type &&
          existingIndex.attributes === index.attributes) ||
        JSON.stringify(existingIndex) === JSON.stringify(index)
    )
  ) {
    await db.deleteIndex(dbId, collectionId, existingIndex.indexes[0].key);
    createIndex = true;
  }
  if (createIndex) {
    newIndex = await db.createIndex(
      dbId,
      collectionId,
      index.key,
      index.type as IndexType,
      index.attributes,
      index.orders
    );
  }
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
    // Add delay after each index creation/update
    await delay(500);
  }
};
