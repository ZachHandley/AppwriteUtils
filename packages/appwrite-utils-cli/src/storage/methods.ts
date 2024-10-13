import {
  Compression,
  Databases,
  Permission,
  Query,
  Role,
  Storage,
  type Models,
} from "node-appwrite";
import { tryAwaitWithRetry, type AppwriteConfig } from "appwrite-utils";
import { getClientFromConfig } from "../utils/getClientFromConfig.js";
import { ulid } from "ulidx";
import type { BackupCreate } from "./schemas.js";
import { logOperation } from "../migrations/helper.js";
import { splitIntoBatches } from "../migrations/migrationHelper.js";
import { retryFailedPromises } from "../utils/retryFailedPromises.js";
import { InputFile } from "node-appwrite/file";

export const getStorage = (config: AppwriteConfig) => {
  const client = getClientFromConfig(config);
  return new Storage(client!);
};

export const listBuckets = async (
  storage: Storage,
  queries?: string[],
  search?: string
) => {
  return await storage.listBuckets(queries, search);
};

export const getBucket = async (storage: Storage, bucketId: string) => {
  return await storage.getBucket(bucketId);
};

export const createBucket = async (
  storage: Storage,
  bucket: Omit<Models.Bucket, "$id" | "$createdAt" | "$updatedAt">,
  bucketId?: string
) => {
  return await storage.createBucket(
    bucketId ?? ulid(),
    bucket.name,
    bucket.$permissions,
    bucket.fileSecurity,
    bucket.enabled,
    bucket.maximumFileSize,
    bucket.allowedFileExtensions,
    bucket.compression as Compression,
    bucket.encryption,
    bucket.antivirus
  );
};

export const updateBucket = async (
  storage: Storage,
  bucket: Models.Bucket,
  bucketId: string
) => {
  return await storage.updateBucket(
    bucketId,
    bucket.name,
    bucket.$permissions,
    bucket.fileSecurity,
    bucket.enabled,
    bucket.maximumFileSize,
    bucket.allowedFileExtensions,
    bucket.compression as Compression,
    bucket.encryption,
    bucket.antivirus
  );
};

export const deleteBucket = async (storage: Storage, bucketId: string) => {
  return await storage.deleteBucket(bucketId);
};

export const getFile = async (
  storage: Storage,
  bucketId: string,
  fileId: string
) => {
  return await storage.getFile(bucketId, fileId);
};

export const listFiles = async (
  storage: Storage,
  bucketId: string,
  queries?: string[],
  search?: string
) => {
  return await storage.listFiles(bucketId, queries, search);
};

export const deleteFile = async (
  storage: Storage,
  bucketId: string,
  fileId: string
) => {
  return await storage.deleteFile(bucketId, fileId);
};

export const ensureDatabaseConfigBucketsExist = async (
  storage: Storage,
  config: AppwriteConfig,
  databases: Models.Database[] = []
) => {
  for (const db of databases) {
    const database = config.databases?.find((d) => d.$id === db.$id);
    if (database?.bucket) {
      try {
        await storage.getBucket(database.bucket.$id);
        console.log(`Bucket ${database.bucket.$id} already exists.`);
      } catch (e) {
        const permissions: string[] = [];
        if (
          database.bucket.permissions &&
          database.bucket.permissions.length > 0
        ) {
          for (const permission of database.bucket.permissions) {
            switch (permission.permission) {
              case "read":
                permissions.push(Permission.read(permission.target));
                break;
              case "create":
                permissions.push(Permission.create(permission.target));
                break;
              case "update":
                permissions.push(Permission.update(permission.target));
                break;
              case "delete":
                permissions.push(Permission.delete(permission.target));
                break;
              case "write":
                permissions.push(Permission.write(permission.target));
                break;
              default:
                console.warn(`Unknown permission: ${permission.permission}`);
                break;
            }
          }
        }
        try {
          await storage.createBucket(
            database.bucket.$id,
            database.bucket.name,
            permissions,
            database.bucket.fileSecurity,
            database.bucket.enabled,
            database.bucket.maximumFileSize,
            database.bucket.allowedFileExtensions,
            database.bucket.compression as Compression,
            database.bucket.encryption,
            database.bucket.antivirus
          );
          console.log(`Bucket ${database.bucket.$id} created successfully.`);
        } catch (createError) {
          // console.error(
          //   `Failed to create bucket ${database.bucket.$id}:`,
          //   createError
          // );
        }
      }
    }
  }
};

export const wipeDocumentStorage = async (
  storage: Storage,
  bucketId: string
): Promise<void> => {
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

export const initOrGetDocumentStorage = async (
  storage: Storage,
  config: AppwriteConfig,
  dbId: string,
  bucketName?: string
) => {
  const bucketId =
    bucketName ??
    `${config.documentBucketId}_${dbId.toLowerCase().replace(" ", "")}`;
  try {
    return await tryAwaitWithRetry(
      async () => await storage.getBucket(bucketId)
    );
  } catch (e) {
    return await tryAwaitWithRetry(
      async () =>
        await storage.createBucket(bucketId, `${dbId} Storage`, [
          Permission.read(Role.any()),
          Permission.create(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users()),
        ])
    );
  }
};

export const initOrGetBackupStorage = async (
  config: AppwriteConfig,
  storage: Storage
) => {
  try {
    return await tryAwaitWithRetry(
      async () => await storage.getBucket("backup")
    );
  } catch (e) {
    return await initOrGetDocumentStorage(
      storage,
      config,
      "backups",
      "Database Backups"
    );
  }
};

export const backupDatabase = async (
  config: AppwriteConfig,
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
    total: 100,
    error: "",
    status: "in_progress",
  });

  try {
    const db = await tryAwaitWithRetry(
      async () => await database.get(databaseId)
    );
    data.database = JSON.stringify(db);

    let lastCollectionId = "";
    let moreCollections = true;
    let progress = 0;
    let total = 0;

    while (moreCollections) {
      const collectionResponse = await tryAwaitWithRetry(
        async () =>
          await database.listCollections(databaseId, [
            Query.limit(500),
            ...(lastCollectionId ? [Query.cursorAfter(lastCollectionId)] : []),
          ])
      );

      total += collectionResponse.collections.length;

      for (const {
        $id: collectionId,
        name: collectionName,
      } of collectionResponse.collections) {
        try {
          const collection = await tryAwaitWithRetry(
            async () => await database.getCollection(databaseId, collectionId)
          );
          progress++;
          data.collections.push(JSON.stringify(collection));

          let lastDocumentId = "";
          let moreDocuments = true;
          let collectionDocumentCount = 0;

          while (moreDocuments) {
            const documentResponse = await tryAwaitWithRetry(
              async () =>
                await database.listDocuments(databaseId, collectionId, [
                  Query.limit(500),
                  ...(lastDocumentId
                    ? [Query.cursorAfter(lastDocumentId)]
                    : []),
                ])
            );

            total += documentResponse.documents.length;
            collectionDocumentCount += documentResponse.documents.length;

            const documentPromises = documentResponse.documents.map(
              ({ $id: documentId }) =>
                database.getDocument(databaseId, collectionId, documentId)
            );

            const promiseBatches = splitIntoBatches(documentPromises);
            const documentsPulled = [];
            for (const batch of promiseBatches) {
              const successfulDocuments = await retryFailedPromises(batch);
              documentsPulled.push(...successfulDocuments);
            }

            data.documents.push({
              collectionId: collectionId,
              data: JSON.stringify(documentsPulled),
            });
            progress += documentsPulled.length;

            await logOperation(
              database,
              databaseId,
              {
                operationType: "backup",
                collectionId: collectionId,
                data: `Backing up, ${data.collections.length} collections so far`,
                progress: progress,
                total: total,
                error: "",
                status: "in_progress",
              },
              backupOperation.$id
            );

            moreDocuments = documentResponse.documents.length === 500;
            if (moreDocuments) {
              lastDocumentId =
                documentResponse.documents[
                  documentResponse.documents.length - 1
                ].$id;
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

      moreCollections = collectionResponse.collections.length === 500;
      if (moreCollections) {
        lastCollectionId =
          collectionResponse.collections[
            collectionResponse.collections.length - 1
          ].$id;
      }
    }

    const bucket = await initOrGetDocumentStorage(storage, config, databaseId);
    const inputFile = InputFile.fromPlainText(
      JSON.stringify(data),
      `${new Date().toISOString()}-${databaseId}.json`
    );
    const fileCreated = await storage.createFile(
      bucket!.$id,
      ulid(),
      inputFile
    );

    await logOperation(
      database,
      databaseId,
      {
        operationType: "backup",
        collectionId: "",
        data: fileCreated.$id,
        progress: 100,
        total: total,
        error: "",
        status: "completed",
      },
      backupOperation.$id
    );

    console.log("---------------------------------");
    console.log("Database Backup Complete");
    console.log("---------------------------------");
  } catch (error) {
    console.error("Error during backup:", error);
    await logOperation(
      database,
      databaseId,
      {
        operationType: "backup",
        collectionId: "",
        data: "Backup failed",
        progress: 0,
        total: 100,
        error: String(error),
        status: "error",
      },
      backupOperation.$id
    );
  }
};
