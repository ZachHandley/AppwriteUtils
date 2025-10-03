import type { Storage, Databases, Models } from "node-appwrite";
import { ID, Query } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { ulid } from "ulidx";
import { MessageFormatter } from "../../shared/messageFormatter.js";
import { logger } from "../../shared/logging.js";
import type { DatabaseAdapter } from "../../adapters/DatabaseAdapter.js";
import { tryAwaitWithRetry } from "appwrite-utils";
import { splitIntoBatches } from "../../shared/migrationHelpers.js";
import { retryFailedPromises } from "../../utils/retryFailedPromises.js";
import { ProgressManager } from "../../shared/progressManager.js";
import { createBackupZip } from "../../storage/backupCompression.js";
import {
  recordCentralizedBackup,
  createCentralizedBackupTrackingTable
} from "../tracking/centralizedTracking.js";
import type { AppwriteConfig } from "appwrite-utils";

export interface CollectionBackupOptions {
  trackingDatabaseId: string;
  databaseId: string;
  collectionIds: string[];
  backupFormat?: 'json' | 'zip';
  onProgress?: (message: string) => void;
}

export interface CollectionBackupResult {
  backupId: string;
  manifestFileId: string;
  databaseId: string;
  collections: Array<{
    collectionId: string;
    collectionName: string;
    documentCount: number;
    status: 'completed' | 'failed';
    error?: string;
  }>;
  totalDocuments: number;
  sizeBytes: number;
  status: 'completed' | 'partial' | 'failed';
  errors: string[];
}

interface BackupData {
  database: string;
  collections: string[];
  documents: Array<{
    collectionId: string;
    data: string;
  }>;
}

/**
 * Backup specific collections from a database
 */
export async function backupCollections(
  config: AppwriteConfig,
  databases: Databases,
  storage: Storage,
  adapter: DatabaseAdapter,
  options: CollectionBackupOptions
): Promise<CollectionBackupResult> {
  const startTime = Date.now();
  const backupId = ulid();
  const errors: string[] = [];
  const collections: CollectionBackupResult['collections'] = [];
  let totalDocuments = 0;
  let totalSizeBytes = 0;

  try {
    // Ensure tracking table exists
    await createCentralizedBackupTrackingTable(adapter, options.trackingDatabaseId);

    const backupBucketId = "appwrite-backups";
    MessageFormatter.info(`Starting collection backup ${backupId}`, { prefix: "Backup" });
    MessageFormatter.info(`Database: ${options.databaseId}, Collections: ${options.collectionIds.length}`, { prefix: "Backup" });

    // Get database info
    const db = await tryAwaitWithRetry(
      async () => await databases.get(options.databaseId)
    );

    const backupData: BackupData = {
      database: JSON.stringify(db),
      collections: [],
      documents: []
    };

    // Phase 1: Count documents for progress tracking
    MessageFormatter.step(1, 3, "Analyzing collections");
    let totalItems = options.collectionIds.length; // Start with collection count

    for (const collectionId of options.collectionIds) {
      try {
        const documentCount = await tryAwaitWithRetry(
          async () => (await databases.listDocuments(options.databaseId, collectionId, [Query.limit(1)])).total
        );
        totalDocuments += documentCount;
        totalItems += documentCount;
      } catch (error) {
        MessageFormatter.warning(`Could not count documents in collection ${collectionId}`);
      }
    }

    const progress = ProgressManager.create(`backup-collections-${backupId}`, totalItems, {
      title: `Backing up ${options.collectionIds.length} collections`,
    });

    // Phase 2: Backup selected collections
    MessageFormatter.step(2, 3, `Processing ${options.collectionIds.length} collections and ${totalDocuments} documents`);

    let processedDocuments = 0;

    for (const collectionId of options.collectionIds) {
      try {
        if (options.onProgress) {
          options.onProgress(`Backing up collection: ${collectionId}`);
        }

        // Get collection metadata
        const collection = await tryAwaitWithRetry(
          async () => await databases.getCollection(options.databaseId, collectionId)
        );

        backupData.collections.push(JSON.stringify(collection));
        progress.increment(1, `Processing collection: ${collection.name}`);

        // Backup all documents in this collection
        let lastDocumentId = "";
        let moreDocuments = true;
        let collectionDocumentCount = 0;

        while (moreDocuments) {
          const documentResponse = await tryAwaitWithRetry(
            async () =>
              await databases.listDocuments(options.databaseId, collectionId, [
                Query.limit(500),
                ...(lastDocumentId ? [Query.cursorAfter(lastDocumentId)] : []),
              ])
          );

          collectionDocumentCount += documentResponse.documents.length;

          const documentPromises = documentResponse.documents.map(
            ({ $id: documentId }) =>
              databases.getDocument(options.databaseId, collectionId, documentId)
          );

          const promiseBatches = splitIntoBatches(documentPromises);
          const documentsPulled = [];

          for (const batch of promiseBatches) {
            const successfulDocuments = await retryFailedPromises(batch);
            documentsPulled.push(...successfulDocuments);

            // Update progress for each batch
            progress.increment(successfulDocuments.length,
              `Processing ${collection.name}: ${processedDocuments + successfulDocuments.length}/${totalDocuments} documents`
            );
            processedDocuments += successfulDocuments.length;
          }

          backupData.documents.push({
            collectionId: collectionId,
            data: JSON.stringify(documentsPulled),
          });

          moreDocuments = documentResponse.documents.length === 500;
          if (moreDocuments) {
            lastDocumentId = documentResponse.documents[documentResponse.documents.length - 1].$id;
          }
        }

        collections.push({
          collectionId,
          collectionName: collection.name,
          documentCount: collectionDocumentCount,
          status: 'completed'
        });

        MessageFormatter.success(
          `Collection ${collection.name} backed up with ${MessageFormatter.formatNumber(collectionDocumentCount)} documents`
        );
      } catch (error) {
        const errorMsg = `Failed to backup collection ${collectionId}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        logger.error(errorMsg);

        collections.push({
          collectionId,
          collectionName: collectionId,
          documentCount: 0,
          status: 'failed',
          error: errorMsg
        });
      }
    }

    // Phase 3: Create backup file
    MessageFormatter.step(3, 3, "Creating backup file");

    let inputFile: any;
    let fileName: string;
    let backupSize: number;

    if (options.backupFormat === 'zip') {
      // Create compressed backup
      const zipBuffer = await createBackupZip(backupData);
      fileName = `${new Date().toISOString()}-${options.databaseId}-collections.zip`;
      backupSize = zipBuffer.length;
      inputFile = InputFile.fromBuffer(new Uint8Array(zipBuffer), fileName);
    } else {
      // Use JSON format
      const backupDataString = JSON.stringify(backupData, null, 2);
      fileName = `${new Date().toISOString()}-${options.databaseId}-collections.json`;
      backupSize = Buffer.byteLength(backupDataString, 'utf8');
      inputFile = InputFile.fromPlainText(backupDataString, fileName);
    }

    const fileCreated = await storage.createFile(
      backupBucketId,
      ulid(),
      inputFile
    );

    totalSizeBytes = backupSize;

    // Create manifest
    const manifestData = {
      version: "1.0",
      backupId,
      databaseId: options.databaseId,
      collectionIds: options.collectionIds,
      collections: collections,
      format: options.backupFormat || 'json',
      createdAt: new Date().toISOString(),
      totalDocuments: processedDocuments,
      totalSizeBytes: backupSize
    };

    const manifestBuffer = Buffer.from(JSON.stringify(manifestData, null, 2), 'utf-8');
    const manifestFile = await storage.createFile(
      backupBucketId,
      ID.unique(),
      InputFile.fromBuffer(new Uint8Array(manifestBuffer), `${backupId}-manifest.json`)
    );

    // Record in centralized tracking
    await recordCentralizedBackup(adapter, options.trackingDatabaseId, {
      backupType: 'database',
      backupId: fileCreated.$id,
      manifestFileId: manifestFile.$id,
      format: options.backupFormat || 'json',
      sizeBytes: backupSize,
      databaseId: options.databaseId,
      collections: backupData.collections.length,
      documents: processedDocuments,
      status: errors.length === 0 ? 'completed' : 'partial',
      error: errors.length > 0 ? errors.join('; ') : undefined,
      restorationStatus: 'not_restored'
    });

    progress.stop();

    const duration = Date.now() - startTime;
    const status: 'completed' | 'partial' | 'failed' =
      errors.length === 0 ? 'completed' :
      collections.some(c => c.status === 'completed') ? 'partial' :
      'failed';

    MessageFormatter.success(
      `Collection backup ${status} in ${(duration / 1000).toFixed(2)}s`,
      { prefix: "Backup" }
    );

    MessageFormatter.operationSummary("Collection Backup", {
      database: options.databaseId,
      collections: backupData.collections.length,
      documents: processedDocuments,
      fileSize: MessageFormatter.formatBytes(backupSize),
      backupFile: fileName,
      bucket: backupBucketId,
    }, duration);

    return {
      backupId,
      manifestFileId: manifestFile.$id,
      databaseId: options.databaseId,
      collections,
      totalDocuments: processedDocuments,
      sizeBytes: totalSizeBytes,
      status,
      errors
    };
  } catch (error) {
    const errorMsg = `Collection backup failed: ${error instanceof Error ? error.message : String(error)}`;
    MessageFormatter.error(errorMsg, error instanceof Error ? error : new Error(errorMsg), { prefix: "Backup" });

    return {
      backupId,
      manifestFileId: '',
      databaseId: options.databaseId,
      collections: [],
      totalDocuments: 0,
      sizeBytes: 0,
      status: 'failed',
      errors: [errorMsg, ...errors]
    };
  }
}
