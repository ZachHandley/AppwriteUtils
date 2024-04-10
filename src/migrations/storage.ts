import {
  Storage,
  Databases,
  Query,
  InputFile,
  type Models,
  ID,
} from "node-appwrite";
import { type OperationCreate, type BackupCreate } from "./backup.js";
import { splitIntoBatches } from "./migrationHelper.js";
import type { AppwriteConfig } from "./schema.js";

export const logOperation = async (
  db: Databases,
  dbId: string,
  operationDetails: OperationCreate,
  operationId?: string
): Promise<Models.Document> => {
  try {
    let operation;
    if (operationId) {
      // Update existing operation log
      operation = await db.updateDocument(
        "migrations",
        "currentOperations",
        operationId,
        operationDetails
      );
    } else {
      // Create new operation log
      operation = await db.createDocument(
        "migrations",
        "currentOperations",
        ID.unique(),
        operationDetails
      );
    }
    console.log(`Operation logged: ${operation.$id}`);
    return operation;
  } catch (error) {
    console.error(`Error logging operation: ${error}`);
    throw error;
  }
};

export const initOrGetBackupStorage = async (storage: Storage) => {
  try {
    const backupStorage = await storage.getBucket("backupStorage");
    return backupStorage;
  } catch (e) {
    // ID backupStorage
    // Name Backups Storage
    const backupStorage = await storage.createBucket(
      "backupStorage",
      "Backups Storage"
    );
    return backupStorage;
  }
};

export const initOrGetDocumentStorage = async (
  storage: Storage,
  config: AppwriteConfig
) => {
  try {
    const documentStorage = await storage.getBucket(config.documentBucketId);
    return documentStorage;
  } catch (e) {
    // ID documentStorage
    // Name Document Storage
    const documentStorage = await storage.createBucket(
      config.documentBucketId,
      "Document Storage"
    );
    return documentStorage;
  }
};

async function retryFailedPromises(
  batch: Promise<Models.Document>[],
  maxRetries = 3
): Promise<PromiseSettledResult<Models.Document>[]> {
  const results = await Promise.allSettled(batch);
  const toRetry: Promise<any>[] = [];

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error("Promise rejected with reason:", result.reason);
      if (maxRetries > 0) {
        toRetry.push(batch[index]);
      }
    }
  });

  if (toRetry.length > 0) {
    console.log(`Retrying ${toRetry.length} promises`);
    return retryFailedPromises(toRetry, maxRetries - 1);
  } else {
    return results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result);
  }
}

export const backupDatabase = async (
  database: Databases,
  databaseId: string,
  storage: Storage
): Promise<void> => {
  console.log("---------------------------------");
  console.log("Starting Database Backup of " + databaseId);
  console.log("---------------------------------");
  let data: BackupCreate = {
    database: "",
    collections: [],
    documents: [],
  };

  const backupOperation = await logOperation(database, databaseId, {
    operationType: "backup",
    collectionId: "",
    data: "Starting backup...",
    progress: 0,
    total: 100, // This will be dynamically updated later
    error: "",
    status: "in_progress",
  });

  // Fetch and backup the database details
  let db: Models.Database;
  try {
    db = await database.get(databaseId);
  } catch (e) {
    console.error(`Error fetching database: ${e}`);
    await logOperation(
      database,
      databaseId,
      {
        operationType: "backup",
        collectionId: "",
        data: "Error fetching database, skipping...",
        progress: 0,
        total: 100, // This will be dynamically updated later
        error: `Error fetching database: ${e}`,
        status: "error",
      },
      backupOperation.$id
    );
    return;
  }
  data.database = JSON.stringify(db);

  // Initialize pagination for collections
  let lastCollectionId = "";
  let moreCollections = true;
  let progress = 0;
  let total = 0; // Initialize total to 0, will be updated dynamically

  while (moreCollections) {
    const collectionResponse = await database.listCollections(databaseId, [
      Query.limit(500), // Adjust the limit as needed
      ...(lastCollectionId ? [Query.cursorAfter(lastCollectionId)] : []),
    ]);

    total += collectionResponse.collections.length; // Update total with number of collections

    for (const {
      $id: collectionId,
      name: collectionName,
    } of collectionResponse.collections) {
      let collectionDocumentCount = 0; // Initialize document count for the current collection
      try {
        const collection = await database.getCollection(
          databaseId,
          collectionId
        );
        progress++;
        data.collections.push(JSON.stringify(collection));

        // Initialize pagination for documents within the current collection
        let lastDocumentId = "";
        let moreDocuments = true;

        while (moreDocuments) {
          const documentResponse = await database.listDocuments(
            databaseId,
            collectionId,
            [
              Query.limit(500), // Adjust the limit as needed
              ...(lastDocumentId ? [Query.cursorAfter(lastDocumentId)] : []),
            ]
          );

          total += documentResponse.documents.length; // Update total with number of documents
          collectionDocumentCount += documentResponse.documents.length; // Update document count for the current collection
          let documentPromises: Promise<Models.Document>[] = [];
          for (const { $id: documentId } of documentResponse.documents) {
            documentPromises.push(
              database.getDocument(databaseId, collectionId, documentId)
            );
          }
          const promiseBatches = splitIntoBatches(documentPromises);
          const documentsPulled = [];
          for (const batch of promiseBatches) {
            const successfulDocuments = await retryFailedPromises(batch);
            documentsPulled.push(...successfulDocuments);
          }
          const documents = documentsPulled;
          data.documents.push({
            collectionId: collectionId,
            data: JSON.stringify(documents),
          });
          progress += documents.length;

          console.log(
            `Collection ${collectionName} backed up ${collectionDocumentCount} documents (so far)`
          );

          // Update the operation log with the current progress
          await logOperation(
            database,
            databaseId,
            {
              operationType: "backup",
              collectionId: collectionId,
              data: `Still backing up, ${data.collections.length} collections so far`,
              progress: progress,
              total: total,
              error: "",
              status: "in_progress",
            },
            backupOperation.$id
          );

          // Check if there are more documents to fetch
          moreDocuments = documentResponse.documents.length === 500;
          if (moreDocuments) {
            lastDocumentId =
              documentResponse.documents[documentResponse.documents.length - 1]
                .$id;
          }
        }
        console.log(
          `Collection ${collectionName} backed up with ${collectionDocumentCount} documents.`
        );
      } catch (error) {
        console.log(
          `Collection ${collectionName} must not exist, continuing...`
        );
        continue;
      }
    }

    // Check if there are more collections to fetch
    moreCollections = collectionResponse.collections.length === 500;
    if (moreCollections) {
      lastCollectionId =
        collectionResponse.collections[
          collectionResponse.collections.length - 1
        ].$id;
    }
  }

  // Update the backup operation with the current progress and total
  await logOperation(
    database,
    databaseId,
    {
      operationType: "backup",
      collectionId: "",
      data: `Still backing up, ${data.collections.length} collections so far`,
      progress: progress,
      total: total,
      error: "",
      status: "in_progress",
    },
    backupOperation.$id
  );

  // Create the backup with the accumulated data
  const bucket = await initOrGetBackupStorage(storage);
  const inputFile = InputFile.fromPlainText(
    JSON.stringify(data),
    `${new Date().toISOString()}-${databaseId}.json`
  );
  const fileCreated = await storage.createFile(
    bucket.$id,
    ID.unique(),
    inputFile
  );

  // Final update to the backup operation marking it as completed
  await logOperation(
    database,
    databaseId,
    {
      operationType: "backup",
      collectionId: "",
      data: fileCreated.$id,
      progress: 100,
      total: total, // Ensure the total reflects the actual total processed
      error: "",
      status: "completed",
    },
    backupOperation.$id
  );
  console.log("---------------------------------");
  console.log("Database Backup Complete");
  console.log("---------------------------------");
};
