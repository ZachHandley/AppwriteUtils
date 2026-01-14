import type { Storage, Databases, Models } from "node-appwrite";
import { ID } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { ulid } from "ulidx";
import { MessageFormatter } from 'appwrite-utils-helpers';
import { logger } from 'appwrite-utils-helpers';
import type { DatabaseAdapter } from 'appwrite-utils-helpers';
import { backupDatabase } from "../../storage/methods.js";
import { backupBucket } from "./bucketBackup.js";
import {
  recordCentralizedBackup,
  createCentralizedBackupTrackingTable
} from "../tracking/centralizedTracking.js";
import type {
  ComprehensiveManifest,
  DatabaseBackupReference,
  BucketBackupReference
} from "../schemas/comprehensiveManifest.js";
import type { AppwriteConfig } from "appwrite-utils";
import { fetchAllDatabases } from "../../databases/methods.js";

export interface ComprehensiveBackupOptions {
  trackingDatabaseId: string; // Database to store backup tracking
  backupFormat?: 'json' | 'zip';
  skipDatabases?: boolean;
  skipBuckets?: boolean;
  parallelDownloads?: number;
  onProgress?: (message: string) => void;
}

export interface ComprehensiveBackupResult {
  backupId: string;
  manifestFileId: string;
  databaseBackups: DatabaseBackupReference[];
  bucketBackups: BucketBackupReference[];
  totalSizeBytes: number;
  status: 'completed' | 'partial' | 'failed';
  errors: string[];
}

/**
 * Orchestrates comprehensive backup of ALL databases and ALL storage buckets
 */
export async function comprehensiveBackup(
  config: AppwriteConfig,
  databases: Databases,
  storage: Storage,
  adapter: DatabaseAdapter,
  options: ComprehensiveBackupOptions
): Promise<ComprehensiveBackupResult> {
  const startTime = Date.now();
  const backupId = ulid();
  const errors: string[] = [];
  const databaseBackups: DatabaseBackupReference[] = [];
  const bucketBackups: BucketBackupReference[] = [];
  let totalSizeBytes = 0;

  try {
    // Ensure tracking table exists
    await createCentralizedBackupTrackingTable(adapter, options.trackingDatabaseId);

    // Initialize backup bucket
    const backupBucketId = "appwrite-backups";
    MessageFormatter.info(`Starting comprehensive backup ${backupId}`, { prefix: "Backup" });

    // Phase 1: Backup ALL databases
    if (!options.skipDatabases) {
      MessageFormatter.info("Phase 1: Backing up ALL databases", { prefix: "Backup" });

      const allDatabases = await fetchAllDatabases(databases);

      // Validate each database exists before attempting backup
      const validDatabases: Models.Database[] = [];
      const skippedDatabases: string[] = [];

      MessageFormatter.info(`Validating ${allDatabases.length} databases...`, { prefix: "Backup" });

      for (const db of allDatabases) {
        try {
          await databases.get(db.$id); // Validate existence
          validDatabases.push(db);
        } catch (error) {
          skippedDatabases.push(`${db.name} (${db.$id})`);
          MessageFormatter.warning(
            `Database ${db.name} not found - skipping`,
            { prefix: "Backup" }
          );
          logger.warn('Database validation failed', {
            databaseId: db.$id,
            databaseName: db.name,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      if (skippedDatabases.length > 0) {
        MessageFormatter.info(
          `Skipped ${skippedDatabases.length} invalid databases: ${skippedDatabases.join(', ')}`,
          { prefix: "Backup" }
        );
      }

      MessageFormatter.info(`Found ${validDatabases.length} valid databases to backup`, { prefix: "Backup" });

      for (const db of validDatabases) {
        try {
          if (options.onProgress) {
            options.onProgress(`Backing up database: ${db.name}`);
          }

          MessageFormatter.info(`Backing up database: ${db.name} (${db.$id})`, { prefix: "Backup" });

          // Use existing backupDatabase function
          const dbBackupResult = await backupDatabase(
            config,
            databases,
            db.$id,
            storage,
            options.backupFormat || 'zip'
          );

          // Create database manifest with complete data
          const manifestData = {
            version: "1.0",
            databaseId: dbBackupResult.databaseId,
            databaseName: dbBackupResult.databaseName,
            format: dbBackupResult.format,
            collectionCount: dbBackupResult.collectionCount,
            documentCount: dbBackupResult.documentCount,
            backupFileId: dbBackupResult.backupFileId,
            createdAt: new Date().toISOString()
          };

          const manifestBuffer = Buffer.from(JSON.stringify(manifestData, null, 2), 'utf-8');
          const manifestFile = await storage.createFile(
            backupBucketId,
            ID.unique(),
            InputFile.fromBuffer(new Uint8Array(manifestBuffer), `${db.$id}-manifest.json`)
          );

          databaseBackups.push({
            databaseId: dbBackupResult.databaseId,
            databaseName: dbBackupResult.databaseName,
            backupFileId: dbBackupResult.backupFileId,
            manifestFileId: manifestFile.$id,
            collectionCount: dbBackupResult.collectionCount,
            documentCount: dbBackupResult.documentCount,
            sizeBytes: dbBackupResult.backupSizeBytes,
            status: 'completed'
          });

          totalSizeBytes += dbBackupResult.backupSizeBytes;

          // Record individual database backup in tracking
          await recordCentralizedBackup(adapter, options.trackingDatabaseId, {
            backupType: 'database',
            backupId: dbBackupResult.backupFileId,
            manifestFileId: manifestFile.$id,
            format: dbBackupResult.format,
            sizeBytes: dbBackupResult.backupSizeBytes,
            databaseId: dbBackupResult.databaseId,
            collections: dbBackupResult.collectionCount,
            documents: dbBackupResult.documentCount,
            status: 'completed',
            restorationStatus: 'not_restored'
          });

          MessageFormatter.success(`Database ${db.name} backed up successfully`, { prefix: "Backup" });
        } catch (error) {
          const errorMsg = `Failed to backup database ${db.name}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logger.error(errorMsg);

          databaseBackups.push({
            databaseId: db.$id,
            databaseName: db.name,
            backupFileId: '',
            manifestFileId: '',
            collectionCount: 0,
            documentCount: 0,
            sizeBytes: 0,
            status: 'failed',
            error: errorMsg
          });
        }
      }
    }

    // Phase 2: Backup ALL storage buckets
    if (!options.skipBuckets) {
      MessageFormatter.info("Phase 2: Backing up ALL storage buckets", { prefix: "Backup" });

      const allBuckets = await storage.listBuckets();
      const bucketsToBackup = allBuckets.buckets.filter(b => b.$id !== backupBucketId);

      MessageFormatter.info(`Found ${bucketsToBackup.length} buckets to backup`, { prefix: "Backup" });

      for (const bucket of bucketsToBackup) {
        try {
          if (options.onProgress) {
            options.onProgress(`Backing up bucket: ${bucket.name}`);
          }

          MessageFormatter.info(`Backing up bucket: ${bucket.name} (${bucket.$id})`, { prefix: "Backup" });

          const bucketBackupResult = await backupBucket(
            storage,
            bucket.$id,
            backupBucketId,
            {
              parallelDownloads: options.parallelDownloads || 10,
              onProgress: (current, total, fileName) => {
                if (options.onProgress) {
                  options.onProgress(`Downloading ${fileName} (${current}/${total})`);
                }
              }
            }
          );

          bucketBackups.push({
            bucketId: bucket.$id,
            bucketName: bucket.name,
            backupFileId: bucketBackupResult.backupFileId,
            manifestFileId: bucketBackupResult.manifestFileId,
            fileCount: bucketBackupResult.fileCount,
            sizeBytes: bucketBackupResult.totalSizeBytes,
            status: bucketBackupResult.status,
            error: bucketBackupResult.errors?.join('; ')
          });

          totalSizeBytes += bucketBackupResult.zipSizeBytes;

          // Record individual bucket backup in tracking
          await recordCentralizedBackup(adapter, options.trackingDatabaseId, {
            backupType: 'bucket',
            backupId: bucketBackupResult.backupFileId,
            manifestFileId: bucketBackupResult.manifestFileId,
            format: 'zip',
            sizeBytes: bucketBackupResult.zipSizeBytes,
            bucketId: bucket.$id,
            fileCount: bucketBackupResult.fileCount,
            status: bucketBackupResult.status,
            error: bucketBackupResult.errors?.join('; '),
            restorationStatus: 'not_restored'
          });

          MessageFormatter.success(`Bucket ${bucket.name} backed up successfully`, { prefix: "Backup" });
        } catch (error) {
          const errorMsg = `Failed to backup bucket ${bucket.name}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logger.error(errorMsg);

          bucketBackups.push({
            bucketId: bucket.$id,
            bucketName: bucket.name,
            backupFileId: '',
            manifestFileId: '',
            fileCount: 0,
            sizeBytes: 0,
            status: 'failed',
            error: errorMsg
          });
        }
      }
    }

    // Phase 3: Create comprehensive manifest
    MessageFormatter.info("Creating comprehensive backup manifest", { prefix: "Backup" });

    const comprehensiveStatus: 'completed' | 'partial' | 'failed' =
      errors.length === 0 ? 'completed' :
      (databaseBackups.length > 0 || bucketBackups.length > 0) ? 'partial' :
      'failed';

    const manifest: ComprehensiveManifest = {
      version: "1.0",
      backupId,
      createdAt: new Date().toISOString(),
      databases: databaseBackups,
      buckets: bucketBackups,
      totalSizeBytes,
      status: comprehensiveStatus,
      errors: errors.length > 0 ? errors : undefined
    };

    // Upload comprehensive manifest
    const manifestFileName = `comprehensive-${backupId}.json`;
    const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8');
    const manifestFile = await storage.createFile(
      backupBucketId,
      ID.unique(),
      InputFile.fromBuffer(new Uint8Array(manifestBuffer), manifestFileName)
    );

    // Record comprehensive backup in tracking
    await recordCentralizedBackup(adapter, options.trackingDatabaseId, {
      backupType: 'comprehensive',
      backupId,
      manifestFileId: manifestFile.$id,
      format: 'zip',
      sizeBytes: totalSizeBytes,
      comprehensiveBackupId: backupId,
      status: comprehensiveStatus,
      error: errors.length > 0 ? errors.join('; ') : undefined,
      restorationStatus: 'not_restored'
    });

    const duration = Date.now() - startTime;
    MessageFormatter.success(
      `Comprehensive backup ${comprehensiveStatus} in ${(duration / 1000).toFixed(2)}s`,
      { prefix: "Backup" }
    );

    MessageFormatter.info(
      `Backed up ${databaseBackups.length} databases and ${bucketBackups.length} buckets (${MessageFormatter.formatBytes(totalSizeBytes)})`,
      { prefix: "Backup" }
    );

    return {
      backupId,
      manifestFileId: manifestFile.$id,
      databaseBackups,
      bucketBackups,
      totalSizeBytes,
      status: comprehensiveStatus,
      errors
    };
  } catch (error) {
    const errorMsg = `Comprehensive backup failed: ${error instanceof Error ? error.message : String(error)}`;
    MessageFormatter.error(errorMsg, error instanceof Error ? error : new Error(errorMsg), { prefix: "Backup" });

    return {
      backupId,
      manifestFileId: '',
      databaseBackups,
      bucketBackups,
      totalSizeBytes,
      status: 'failed',
      errors: [errorMsg, ...errors]
    };
  }
}
