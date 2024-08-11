import {
  Storage,
  Databases,
  Query,
  type Models,
  ID,
  Permission,
} from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { type OperationCreate, type BackupCreate } from "./backup.js";
import { splitIntoBatches } from "./migrationHelper.js";
import type { AppwriteConfig } from "appwrite-utils";
import {
  getAppwriteClient,
  tryAwaitWithRetry,
} from "../utils/helperFunctions.js";

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
      operation = await tryAwaitWithRetry(
        async () =>
          await db.updateDocument(
            "migrations",
            "currentOperations",
            operationId,
            operationDetails
          )
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
    const backupStorage = await tryAwaitWithRetry(
      async () => await storage.getBucket("backupStorage")
    );
    return backupStorage;
  } catch (e) {
    // ID backupStorage
    // Name Backups Storage
    const backupStorage = await tryAwaitWithRetry(
      async () => await storage.createBucket("backupStorage", "Backups Storage")
    );
    return backupStorage;
  }
};

export const initOrGetDocumentStorage = async (
  storage: Storage,
  config: AppwriteConfig,
  dbName: string
) => {
  try {
    await tryAwaitWithRetry(
      async () =>
        await storage.getBucket(
          `${config.documentBucketId}_${dbName.toLowerCase().replace(" ", "")}`
        )
    );
  } catch (e) {
    // ID documentStorage
    // Name Document Storage
    const documentStorage = await tryAwaitWithRetry(
      async () =>
        await storage.createBucket(
          `${config.documentBucketId}_${dbName.toLowerCase().replace(" ", "")}`,
          `Document Storage ${dbName}`,
          [
            Permission.read("any"),
            Permission.create("users"),
            Permission.update("users"),
            Permission.delete("users"),
          ]
        )
    );
    return documentStorage;
  }
};

export const wipeDocumentStorage = async (
  storage: Storage,
  config: AppwriteConfig,
  dbName: string
): Promise<void> => {
  const bucketId = `${config.documentBucketId
    .toLowerCase()
    .replace(" ", "")}_${dbName.toLowerCase().replace(" ", "")}`;
  console.log(`Wiping storage for bucket ID: ${bucketId}`);
  let moreFiles = true;
  let lastFileId: string | undefined;
  const allFiles: string[] = [];
  while (moreFiles) {
    const queries = [Query.limit(100)]; // Adjust the limit as needed
    if (lastFileId) {
      queries.push(Query.cursorAfter(lastFileId));
    }
    const filesPulled = await tryAwaitWithRetry(
      async () => await storage.listFiles(bucketId, queries)
    );
    if (filesPulled.files.length === 0) {
      console.log("No files found, done!");
      moreFiles = false;
      break;
    } else if (filesPulled.files.length > 0) {
      const fileIds = filesPulled.files.map((file) => file.$id);
      allFiles.push(...fileIds);
    }
    moreFiles = filesPulled.files.length === 100; // Adjust based on the limit
    if (moreFiles) {
      lastFileId = filesPulled.files[filesPulled.files.length - 1].$id;
    }
  }

  for (const fileId of allFiles) {
    console.log(`Deleting file: ${fileId}`);
    await tryAwaitWithRetry(
      async () => await storage.deleteFile(bucketId, fileId)
    );
  }
  console.log(`All files in bucket ${bucketId} have been deleted.`);
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
    db = await tryAwaitWithRetry(async () => await database.get(databaseId));
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
    const collectionResponse = await tryAwaitWithRetry(
      async () =>
        await database.listCollections(databaseId, [
          Query.limit(500), // Adjust the limit as needed
          ...(lastCollectionId ? [Query.cursorAfter(lastCollectionId)] : []),
        ])
    );

    total += collectionResponse.collections.length; // Update total with number of collections

    for (const {
      $id: collectionId,
      name: collectionName,
    } of collectionResponse.collections) {
      let collectionDocumentCount = 0; // Initialize document count for the current collection
      try {
        const collection = await tryAwaitWithRetry(
          async () => await database.getCollection(databaseId, collectionId)
        );
        progress++;
        data.collections.push(JSON.stringify(collection));

        // Initialize pagination for documents within the current collection
        let lastDocumentId = "";
        let moreDocuments = true;

        while (moreDocuments) {
          const documentResponse = await tryAwaitWithRetry(
            async () =>
              await database.listDocuments(databaseId, collectionId, [
                Query.limit(500), // Adjust the limit as needed
                ...(lastDocumentId ? [Query.cursorAfter(lastDocumentId)] : []),
              ])
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

export const transferStorageLocalToLocal = async (
  storage: Storage,
  fromBucketId: string,
  toBucketId: string
) => {
  console.log(`Transferring files from ${fromBucketId} to ${toBucketId}`);
  let lastFileId: string | undefined;
  let fromFiles = await tryAwaitWithRetry(
    async () => await storage.listFiles(fromBucketId, [Query.limit(100)])
  );
  const allFromFiles = fromFiles.files;
  let numberOfFiles = 0;

  const downloadFileWithRetry = async (bucketId: string, fileId: string) => {
    let attempts = 3;
    while (attempts > 0) {
      try {
        return await storage.getFileDownload(bucketId, fileId);
      } catch (error) {
        console.error(`Error downloading file ${fileId}: ${error}`);
        attempts--;
        if (attempts === 0) throw error;
      }
    }
  };

  if (fromFiles.files.length < 100) {
    for (const file of allFromFiles) {
      const fileData = await tryAwaitWithRetry(
        async () => await downloadFileWithRetry(file.bucketId, file.$id)
      );
      if (!fileData) {
        console.error(`Error downloading file ${file.$id}`);
        continue;
      }
      const fileToCreate = InputFile.fromBuffer(fileData, file.name);
      console.log(`Creating file: ${file.name}`);
      tryAwaitWithRetry(
        async () =>
          await storage.createFile(
            toBucketId,
            file.$id,
            fileToCreate,
            file.$permissions
          )
      );
      numberOfFiles++;
    }
  } else {
    lastFileId = fromFiles.files[fromFiles.files.length - 1].$id;
    while (lastFileId) {
      const files = await tryAwaitWithRetry(
        async () =>
          await storage.listFiles(fromBucketId, [
            Query.limit(100),
            Query.cursorAfter(lastFileId!),
          ])
      );
      allFromFiles.push(...files.files);
      if (files.files.length < 100) {
        lastFileId = undefined;
      } else {
        lastFileId = files.files[files.files.length - 1].$id;
      }
    }
    for (const file of allFromFiles) {
      const fileData = await tryAwaitWithRetry(
        async () => await downloadFileWithRetry(file.bucketId, file.$id)
      );
      if (!fileData) {
        console.error(`Error downloading file ${file.$id}`);
        continue;
      }
      const fileToCreate = InputFile.fromBuffer(
        Buffer.from(fileData),
        file.name
      );
      await tryAwaitWithRetry(
        async () =>
          await storage.createFile(
            toBucketId,
            file.$id,
            fileToCreate,
            file.$permissions
          )
      );
      numberOfFiles++;
    }
  }

  console.log(
    `Transferred ${numberOfFiles} files from ${fromBucketId} to ${toBucketId}`
  );
};

export const transferStorageLocalToRemote = async (
  localStorage: Storage,
  endpoint: string,
  projectId: string,
  apiKey: string,
  fromBucketId: string,
  toBucketId: string
) => {
  console.log(
    `Transferring files from current storage ${fromBucketId} to ${endpoint} bucket ${toBucketId}`
  );
  const client = getAppwriteClient(endpoint, apiKey, projectId);
  const remoteStorage = new Storage(client);
  let numberOfFiles = 0;
  let lastFileId: string | undefined;
  let fromFiles = await tryAwaitWithRetry(
    async () => await localStorage.listFiles(fromBucketId, [Query.limit(100)])
  );
  const allFromFiles = fromFiles.files;
  if (fromFiles.files.length === 100) {
    lastFileId = fromFiles.files[fromFiles.files.length - 1].$id;
    while (lastFileId) {
      const files = await tryAwaitWithRetry(
        async () =>
          await localStorage.listFiles(fromBucketId, [
            Query.limit(100),
            Query.cursorAfter(lastFileId!),
          ])
      );
      allFromFiles.push(...files.files);
      if (files.files.length < 100) {
        break;
      }
      lastFileId = files.files[files.files.length - 1].$id;
    }
  }

  for (const file of allFromFiles) {
    const fileData = await tryAwaitWithRetry(
      async () => await localStorage.getFileDownload(file.bucketId, file.$id)
    );
    const fileToCreate = InputFile.fromBuffer(Buffer.from(fileData), file.name);
    await tryAwaitWithRetry(
      async () =>
        await remoteStorage.createFile(
          toBucketId,
          file.$id,
          fileToCreate,
          file.$permissions
        )
    );
    numberOfFiles++;
  }
  console.log(
    `Transferred ${numberOfFiles} files from ${fromBucketId} to ${toBucketId}`
  );
};
