import { AppwriteException, Databases, Query } from "appwrite";

/**
 * Tries to execute the given createFunction and retries up to 5 times if it fails.
 *
 * @param {() => Promise<any>} createFunction - The function to be executed.
 * @param {number} [attemptNum=0] - The number of attempts made so far (default: 0).
 * @return {Promise<any>} - A promise that resolves to the result of the createFunction or rejects with an error if it fails after 5 attempts.
 */
export const tryAwaitWithRetry = async <T>(
  createFunction: () => Promise<T>,
  attemptNum: number = 0
): Promise<T> => {
  try {
    return await createFunction();
  } catch (error) {
    if (
      error instanceof AppwriteException &&
      (error.message.toLowerCase().includes("fetch failed") ||
        error.message.toLowerCase().includes("server error"))
    ) {
      console.log(`Fetch failed on attempt ${attemptNum}. Retrying...`);
      if (attemptNum > 5) {
        throw error;
      }
      return tryAwaitWithRetry(createFunction, attemptNum + 1);
    }
    throw error;
  }
};

/**
 * Compares existing and updated objects to determine if an update is needed.
 * Filters out Appwrite system fields before comparison.
 *
 * @param existing - The existing object
 * @param updated - The updated object
 * @returns true if the object needs to be updated, false otherwise
 */
export const objectNeedsUpdate = (existing: any, updated: any) => {
  if (!existing || !updated) {
    return true;
  }

  // Create clean versions without Appwrite system fields
  const existingClean = Object.fromEntries(
    Object.entries({
      ...existing,
    }).filter(([key]) => !key.startsWith("$"))
  );
  delete existingClean.$id;
  delete existingClean.$createdAt;
  delete existingClean.$updatedAt;
  delete existingClean.$permissions;
  delete existingClean.$collectionId;
  delete existingClean.$databaseId;
  delete existingClean.databaseId;

  const updatedClean = Object.fromEntries(
    Object.entries({
      ...updated,
    }).filter(([key]) => !key.startsWith("$"))
  );
  delete updatedClean.$id;
  delete updatedClean.$createdAt;
  delete updatedClean.$updatedAt;
  delete updatedClean.$permissions;
  delete updatedClean.$collectionId;
  delete updatedClean.$databaseId;
  delete updatedClean.databaseId;

  // Check for new fields or changed values
  const allKeys = new Set([
    ...Object.keys(existingClean),
    ...Object.keys(updatedClean),
  ]);

  return Array.from(allKeys).some((key) => {
    const existingValue = existingClean[key];
    const updatedValue = updatedClean[key];

    // If a value went from null/undefined to a real value or vice versa, that's a change
    const existingIsEmpty =
      existingValue === null || existingValue === undefined;
    const updatedIsEmpty = updatedValue === null || updatedValue === undefined;

    if (existingIsEmpty !== updatedIsEmpty) {
      return true;
    }

    // If both values exist but are different, that's a change
    if (!existingIsEmpty && !updatedIsEmpty && existingValue !== updatedValue) {
      return true;
    }

    return false;
  });
};

/**
 * Removes Appwrite system fields from an object before create/update operations.
 *
 * @param obj - The object to clean
 * @returns A new object with Appwrite system fields removed
 */
export const cleanObjectForAppwrite = (obj: any) => {
  const cleaned = { ...obj };
  delete cleaned.$id;
  delete cleaned.$createdAt;
  delete cleaned.$updatedAt;
  delete cleaned.$permissions;
  delete cleaned.$collectionId;
  delete cleaned.$databaseId;
  delete cleaned.databaseId;
  return cleaned;
};

/**
 * Appwrite only supports Query.equal("$id", [someArrayOfIds])
 * with 100 ids at a time, so we have this helper function to list documents in batches
 *
 * @param databases - Appwrite Databases instance
 * @param databaseId - Database ID
 * @param collectionId - Collection ID
 * @param field - Field to query (typically "$id")
 * @param ids - Array of IDs to query
 * @returns Array of documents
 */
export const listDocumentsBatched = async <T>(
  databases: Databases,
  databaseId: string,
  collectionId: string,
  field: string,
  ids: string[]
) => {
  const batches = ids.reduce((acc, id, index) => {
    const batchIndex = Math.floor(index / 100);
    if (!acc[batchIndex]) {
      acc[batchIndex] = [];
    }
    acc[batchIndex].push(id);
    return acc;
  }, [] as string[][]);

  const documents = await Promise.all(
    batches.map((batch) =>
      databases.listDocuments(databaseId, collectionId, [
        Query.equal(field, batch),
      ])
    )
  );

  return documents
    .flat()
    .map((docList) => docList.documents)
    .flat()
    .map((doc) => doc as T);
};
