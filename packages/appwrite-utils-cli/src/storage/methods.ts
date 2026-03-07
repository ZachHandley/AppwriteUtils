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
import { getClientFromConfig } from "appwrite-utils-helpers";
import { ulid } from "ulidx";
import type { BackupCreate } from "./schemas.js";
import { logOperation } from "../shared/operationLogger.js";
import { splitIntoBatches } from "../shared/migrationHelpers.js";
import { retryFailedPromises } from "appwrite-utils-helpers";
import { InputFile } from "node-appwrite/file";
import { MessageFormatter, Messages } from "appwrite-utils-helpers";
import { ProgressManager } from "../shared/progressManager.js";
import { recordBackup } from "../shared/backupTracking.js";
import { AdapterFactory } from "appwrite-utils-helpers";
import { createBackupZip } from "./backupCompression.js";

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

/**
 * Convert permission objects ({permission, target}) to Appwrite Permission strings.
 */
export const buildPermissionStrings = (
  permissions: Array<{ permission: string; target: string }> | undefined
): string[] => {
  const result: string[] = [];
  if (!permissions || permissions.length === 0) return result;
  for (const p of permissions) {
    switch (p.permission) {
      case 'read': result.push(Permission.read(p.target)); break;
      case 'create': result.push(Permission.create(p.target)); break;
      case 'update': result.push(Permission.update(p.target)); break;
      case 'delete': result.push(Permission.delete(p.target)); break;
      case 'write': result.push(Permission.write(p.target)); break;
      default: break;
    }
  }
  return result;
};

/**
 * Check if a bucket's current state differs from desired config.
 */
const bucketDiffers = (existing: Models.Bucket, desired: any, permissions: string[]): boolean => {
  return (
    existing.name !== desired.name ||
    JSON.stringify(existing.$permissions || []) !== JSON.stringify(permissions) ||
    !!existing.fileSecurity !== !!desired.fileSecurity ||
    !!existing.enabled !== !!desired.enabled ||
    (existing.maximumFileSize ?? undefined) !== (desired.maximumFileSize ?? undefined) ||
    JSON.stringify(existing.allowedFileExtensions || []) !== JSON.stringify(desired.allowedFileExtensions || []) ||
    String(existing.compression || 'none') !== String(desired.compression || 'none') ||
    !!existing.encryption !== !!desired.encryption ||
    !!existing.antivirus !== !!desired.antivirus
  );
};

/**
 * Create or update a single bucket to match desired config.
 */
const ensureSingleBucketExists = async (
  storage: Storage,
  desired: any
): Promise<void> => {
  const permissions = buildPermissionStrings(desired.permissions);
  try {
    const existing = await storage.getBucket(desired.$id);
    if (bucketDiffers(existing, desired, permissions)) {
      try {
        await storage.updateBucket(
          desired.$id,
          desired.name,
          permissions,
          desired.fileSecurity,
          desired.enabled,
          desired.maximumFileSize,
          desired.allowedFileExtensions,
          desired.compression as Compression,
          desired.encryption,
          desired.antivirus
        );
        MessageFormatter.info(`Updated bucket ${desired.$id} to match config`, { prefix: 'Buckets' });
      } catch (updateErr) {
        MessageFormatter.warning(`Failed to update bucket ${desired.$id}: ${updateErr instanceof Error ? updateErr.message : String(updateErr)}`, { prefix: 'Buckets' });
      }
    } else {
      MessageFormatter.debug(`Bucket ${desired.$id} up-to-date`, undefined, { prefix: 'Buckets' });
    }
  } catch (_e) {
    // Bucket doesn't exist, create it
    try {
      await storage.createBucket(
        desired.$id,
        desired.name,
        permissions,
        desired.fileSecurity,
        desired.enabled,
        desired.maximumFileSize,
        desired.allowedFileExtensions,
        desired.compression as Compression,
        desired.encryption,
        desired.antivirus
      );
      MessageFormatter.success(`Bucket ${desired.$id} created`, { prefix: 'Buckets' });
    } catch (createError) {
      MessageFormatter.error(`Failed to create bucket ${desired.$id}`, createError instanceof Error ? createError : new Error(String(createError)), { prefix: 'Buckets' });
    }
  }
};

export const ensureDatabaseConfigBucketsExist = async (
  storage: Storage,
  config: AppwriteConfig,
  databases: Models.Database[] = []
) => {
  for (const db of databases) {
    const database = config.databases?.find((d) => d.$id === db.$id);
    if (database?.bucket) {
      await ensureSingleBucketExists(storage, database.bucket);
    }
  }
};

/**
 * Ensure global/root-level buckets from config.buckets[] exist on remote.
 * Optionally filter to only push selected bucket IDs.
 */
export const ensureGlobalBucketsExist = async (
  storage: Storage,
  config: AppwriteConfig,
  selectedBucketIds?: string[]
) => {
  const globalBuckets = config.buckets || [];
  for (const bucket of globalBuckets) {
    if (selectedBucketIds && !selectedBucketIds.includes(bucket.$id)) {
      continue;
    }
    await ensureSingleBucketExists(storage, bucket);
  }
};

export const wipeDocumentStorage = async (
  storage: Storage,
  bucketId: string,
  options: { skipConfirmation?: boolean } = {}
): Promise<void> => {
  MessageFormatter.warning(`About to delete all files in bucket: ${bucketId}`);
  
  if (!options.skipConfirmation) {
    const { ConfirmationDialogs } = await import("../shared/confirmationDialogs.js");
    const confirmed = await ConfirmationDialogs.confirmDestructiveOperation({
      operation: "Storage Wipe",
      targets: [bucketId],
      consequences: [
        "Delete ALL files in the storage bucket",
        "This action cannot be undone",
      ],
      requireExplicitConfirmation: true,
      confirmationText: "DELETE FILES",
    });

    if (!confirmed) {
      MessageFormatter.info("Storage wipe cancelled by user");
      return;
    }
  }

  MessageFormatter.progress(`Scanning files in bucket: ${bucketId}`);

  let moreFiles = true;
  let lastFileId: string | undefined;
  const allFiles: string[] = [];
  
  // First pass: collect all file IDs
  while (moreFiles) {
    const queries = [Query.limit(100)];
    if (lastFileId) {
      queries.push(Query.cursorAfter(lastFileId));
    }
    const filesPulled = await tryAwaitWithRetry(
      async () => await storage.listFiles(bucketId, queries)
    );
    if (filesPulled.files.length === 0) {
      moreFiles = false;
      break;
    } else if (filesPulled.files.length > 0) {
      const fileIds = filesPulled.files.map((file) => file.$id);
      allFiles.push(...fileIds);
    }
    moreFiles = filesPulled.files.length === 100;
    if (moreFiles) {
      lastFileId = filesPulled.files[filesPulled.files.length - 1].$id;
    }
  }

  if (allFiles.length === 0) {
    MessageFormatter.info("No files found in bucket");
    return;
  }

  // Second pass: delete files with progress tracking
  const progress = ProgressManager.create(`wipe-${bucketId}`, allFiles.length, {
    title: `Deleting files from ${bucketId}`,
  });

  try {
    for (let i = 0; i < allFiles.length; i++) {
      const fileId = allFiles[i];
      await tryAwaitWithRetry(
        async () => await storage.deleteFile(bucketId, fileId)
      );
      progress.update(i + 1, `Deleted file: ${fileId.slice(0, 20)}...`);
    }

    progress.stop();
    MessageFormatter.success(`All ${MessageFormatter.formatNumber(allFiles.length)} files in bucket ${bucketId} have been deleted`);
  } catch (error) {
    progress.fail(error instanceof Error ? error.message : String(error));
    throw error;
  }
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

/**
 * Initializes or gets the centralized backup bucket
 * All backups are stored in a single "appwrite-backups" bucket
 */
export const initBackupBucket = async (
  storage: Storage
): Promise<Models.Bucket | undefined> => {
  const BACKUP_BUCKET_ID = "appwrite-backups";
  const BACKUP_BUCKET_NAME = "Backups";

  try {
    // Try to get existing bucket
    const bucket = await storage.getBucket(BACKUP_BUCKET_ID);
    return bucket;
  } catch (error) {
    // Bucket doesn't exist, create it
    try {
      const bucket = await storage.createBucket(
        BACKUP_BUCKET_ID,
        BACKUP_BUCKET_NAME,
        [
          Permission.read(Role.any()),
          Permission.create(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users())
        ],
        false, // fileSecurity
        true,  // enabled
        undefined, // maximumFileSize
        undefined, // allowedFileExtensions
        Compression.Gzip, // compression
        false,     // encryption
        false      // antivirus
      );

      MessageFormatter.success(`Created backup bucket: ${BACKUP_BUCKET_ID}`);
      return bucket;
    } catch (createError) {
      MessageFormatter.error("Failed to create backup bucket",
        createError instanceof Error ? createError : new Error(String(createError))
      );
      return undefined;
    }
  }
};

export interface DatabaseBackupResult {
  backupFileId: string;
  backupFileName: string;
  backupSizeBytes: number;
  databaseId: string;
  databaseName: string;
  collectionCount: number;
  documentCount: number;
  format: 'json' | 'zip';
}

export const backupDatabase = async (
  config: AppwriteConfig,
  database: Databases,
  databaseId: string,
  storage: Storage,
  format: 'json' | 'zip' = 'json'
): Promise<DatabaseBackupResult> => {
  const startTime = Date.now();
  
  MessageFormatter.banner("Database Backup", `Backing up database: ${databaseId}`);
  MessageFormatter.info(Messages.BACKUP_STARTED(databaseId));

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

  let progress: ProgressManager | null = null;
  let totalDocuments = 0;
  let processedDocuments = 0;

  try {
    const db = await tryAwaitWithRetry(
      async () => await database.get(databaseId)
    );
    data.database = JSON.stringify(db);

    // First pass: count collections and documents for progress tracking
    MessageFormatter.step(1, 3, "Analyzing database structure");
    let lastCollectionId = "";
    let moreCollections = true;
    let totalCollections = 0;

    while (moreCollections) {
      const collectionResponse = await tryAwaitWithRetry(
        async () =>
          await database.listCollections(databaseId, [
            Query.limit(500),
            ...(lastCollectionId ? [Query.cursorAfter(lastCollectionId)] : []),
          ])
      );

      totalCollections += collectionResponse.collections.length;

      // Count documents in each collection
      for (const { $id: collectionId } of collectionResponse.collections) {
        try {
          const documentCount = await tryAwaitWithRetry(
            async () => (await database.listDocuments(databaseId, collectionId, [Query.limit(1)])).total
          );
          totalDocuments += documentCount;
        } catch (error) {
          MessageFormatter.warning(`Could not count documents in collection ${collectionId}`);
        }
      }

      moreCollections = collectionResponse.collections.length === 500;
      if (moreCollections) {
        lastCollectionId = collectionResponse.collections[collectionResponse.collections.length - 1].$id;
      }
    }

    const totalItems = totalCollections + totalDocuments;
    progress = ProgressManager.create(`backup-${databaseId}`, totalItems, {
      title: `Backing up ${databaseId}`,
    });

    MessageFormatter.step(2, 3, `Processing ${totalCollections} collections and ${totalDocuments} documents`);

    // Second pass: actual backup with progress tracking
    lastCollectionId = "";
    moreCollections = true;

    while (moreCollections) {
      const collectionResponse = await tryAwaitWithRetry(
        async () =>
          await database.listCollections(databaseId, [
            Query.limit(500),
            ...(lastCollectionId ? [Query.cursorAfter(lastCollectionId)] : []),
          ])
      );

      for (const {
        $id: collectionId,
        name: collectionName,
      } of collectionResponse.collections) {
        try {
          const collection = await tryAwaitWithRetry(
            async () => await database.getCollection(databaseId, collectionId)
          );
          
          data.collections.push(JSON.stringify(collection));
          progress?.increment(1, `Processing collection: ${collectionName}`);

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
              
              // Update progress for each batch
              progress?.increment(successfulDocuments.length, 
                `Processing ${collectionName}: ${processedDocuments + successfulDocuments.length}/${totalDocuments} documents`
              );
              processedDocuments += successfulDocuments.length;
            }

            data.documents.push({
              collectionId: collectionId,
              data: JSON.stringify(documentsPulled),
            });

            if (backupOperation) {
              await logOperation(
                database,
                databaseId,
                {
                  operationType: "backup",
                  collectionId: collectionId,
                  data: `Backing up, ${data.collections.length} collections so far`,
                  progress: processedDocuments,
                  total: totalDocuments,
                  error: "",
                  status: "in_progress",
                },
                backupOperation.$id
              );
            }

            moreDocuments = documentResponse.documents.length === 500;
            if (moreDocuments) {
              lastDocumentId =
                documentResponse.documents[
                  documentResponse.documents.length - 1
                ].$id;
            }
          }

          MessageFormatter.success(
            `Collection ${collectionName} backed up with ${MessageFormatter.formatNumber(collectionDocumentCount)} documents`
          );
        } catch (error) {
          MessageFormatter.warning(
            `Collection ${collectionName} could not be backed up: ${error instanceof Error ? error.message : String(error)}`
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

    MessageFormatter.step(3, 3, "Creating backup file");

    const bucket = await initBackupBucket(storage);
    if (!bucket) {
      throw new Error("Failed to initialize backup bucket");
    }

    let inputFile: any;
    let fileName: string;
    let backupSize: number;

    if (format === 'zip') {
      // Create compressed backup
      const zipBuffer = await createBackupZip(data);
      fileName = `${new Date().toISOString()}-${databaseId}.zip`;
      backupSize = zipBuffer.length;
      inputFile = InputFile.fromBuffer(new Uint8Array(zipBuffer), fileName);
    } else {
      // Use JSON format (existing logic)
      const backupData = JSON.stringify(data, null, 2);
      fileName = `${new Date().toISOString()}-${databaseId}.json`;
      backupSize = Buffer.byteLength(backupData, 'utf8');
      inputFile = InputFile.fromPlainText(backupData, fileName);
    }

    const fileCreated = await storage.createFile(
      bucket.$id,
      ulid(),
      inputFile
    );

    progress?.stop();

    // Record backup metadata
    try {
      const { adapter } = await AdapterFactory.create({
        appwriteEndpoint: config.appwriteEndpoint,
        appwriteProject: config.appwriteProject,
        appwriteKey: config.appwriteKey,
        sessionCookie: config.sessionCookie
      });

      await recordBackup(adapter, databaseId, {
        backupId: fileCreated.$id,
        backupType: 'database',
        databaseId: databaseId,
        sizeBytes: backupSize,
        collections: data.collections.length,
        documents: processedDocuments,
        format: format,
        status: 'completed',
        restorationStatus: 'not_restored'
      });
    } catch (metadataError) {
      // Don't fail backup if metadata recording fails
      MessageFormatter.warning(
        `Failed to record backup metadata: ${metadataError instanceof Error ? metadataError.message : String(metadataError)}`
      );
    }

    if (backupOperation) {
      await logOperation(
        database,
        databaseId,
        {
          operationType: "backup",
          collectionId: "",
          data: fileCreated.$id,
          progress: totalItems,
          total: totalItems,
          error: "",
          status: "completed",
        },
        backupOperation.$id
      );
    }

    const duration = Date.now() - startTime;

    MessageFormatter.operationSummary("Backup", {
      database: databaseId,
      collections: data.collections.length,
      documents: processedDocuments,
      fileSize: MessageFormatter.formatBytes(backupSize),
      backupFile: fileName,
      bucket: bucket!.$id,
    }, duration);

    MessageFormatter.success(Messages.BACKUP_COMPLETED(databaseId, backupSize));

    // Return backup result for tracking
    const dbData = JSON.parse(data.database);
    return {
      backupFileId: fileCreated.$id,
      backupFileName: fileName,
      backupSizeBytes: backupSize,
      databaseId: databaseId,
      databaseName: dbData.name || databaseId,
      collectionCount: data.collections.length,
      documentCount: processedDocuments,
      format: format
    };
  } catch (error) {
    progress?.fail(error instanceof Error ? error.message : String(error));

    MessageFormatter.error("Backup failed", error instanceof Error ? error : new Error(String(error)));

    if (backupOperation) {
      await logOperation(
        database,
        databaseId,
        {
          operationType: "backup",
          collectionId: "",
          data: "Backup failed",
          progress: 0,
          total: totalDocuments,
          error: String(error),
          status: "error",
        },
        backupOperation.$id
      );
    }

    throw error;
  }
};
