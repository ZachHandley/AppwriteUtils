import type { Storage, Models } from "node-appwrite";
import JSZip from "jszip";
import { ID, Query } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import pLimit from "p-limit";
import { MessageFormatter } from "../../shared/messageFormatter.js";
import { logger } from "../../shared/logging.js";
import type { BucketManifest, BucketFileMetadata } from "../schemas/bucketManifest.js";
import { ulid } from "ulidx";

export interface BucketBackupOptions {
  compressionLevel?: number; // 0-9, default 6
  parallelDownloads?: number; // Number of concurrent downloads, default 10
  onProgress?: (current: number, total: number, fileName: string) => void;
}

export interface BucketBackupResult {
  backupFileId: string;
  manifestFileId: string;
  fileCount: number;
  totalSizeBytes: number;
  zipSizeBytes: number;
  status: 'completed' | 'partial' | 'failed';
  errors?: string[];
}

/**
 * Downloads all files from a bucket in parallel and creates a ZIP backup
 */
export async function backupBucket(
  storage: Storage,
  bucketId: string,
  backupBucketId: string,
  options: BucketBackupOptions = {}
): Promise<BucketBackupResult> {
  const {
    compressionLevel = 6,
    parallelDownloads = 10,
    onProgress
  } = options;

  const errors: string[] = [];
  let totalSizeBytes = 0;

  try {
    // Step 1: Get bucket metadata
    MessageFormatter.info(`Fetching bucket metadata for ${bucketId}`, { prefix: "Backup" });
    const bucket = await storage.getBucket(bucketId);

    // Step 2: List all files in bucket with pagination
    MessageFormatter.info(`Listing all files in bucket ${bucketId}`, { prefix: "Backup" });
    const allFiles: Models.File[] = [];
    let lastFileId: string | undefined;

    while (true) {
      const queries = [Query.limit(100)];
      if (lastFileId) {
        queries.push(Query.cursorAfter(lastFileId));
      }

      const filesPage = await storage.listFiles(bucketId, queries);
      allFiles.push(...filesPage.files);

      if (filesPage.files.length < 100) break;
      lastFileId = filesPage.files[filesPage.files.length - 1].$id;
    }

    MessageFormatter.info(`Found ${allFiles.length} files to backup`, { prefix: "Backup" });

    if (allFiles.length === 0) {
      // Empty bucket - create minimal backup
      const manifest: BucketManifest = {
        version: "1.0",
        bucketId: bucket.$id,
        bucketName: bucket.name,
        createdAt: new Date().toISOString(),
        fileCount: 0,
        totalSizeBytes: 0,
        compression: bucket.compression === 'gzip' ? 'gzip' : 'none',
        files: [],
        bucketConfiguration: {
          $permissions: bucket.$permissions,
          fileSecurity: bucket.fileSecurity,
          enabled: bucket.enabled,
          maximumFileSize: bucket.maximumFileSize,
          allowedFileExtensions: bucket.allowedFileExtensions,
          compression: bucket.compression,
          encryption: bucket.encryption,
          antivirus: bucket.antivirus
        }
      };

      const manifestFileId = await uploadManifest(storage, backupBucketId, bucketId, manifest);

      return {
        backupFileId: '',
        manifestFileId,
        fileCount: 0,
        totalSizeBytes: 0,
        zipSizeBytes: 0,
        status: 'completed'
      };
    }

    // Step 3: Download all files in parallel with concurrency limit
    MessageFormatter.info(`Downloading ${allFiles.length} files in parallel (max ${parallelDownloads} concurrent)`, { prefix: "Backup" });

    const limit = pLimit(parallelDownloads);
    const downloadedFiles: Map<string, { buffer: Buffer; file: Models.File }> = new Map();
    let successCount = 0;
    let errorCount = 0;

    const downloadTasks = allFiles.map((file, index) =>
      limit(async () => {
        try {
          const fileBuffer = await storage.getFileDownload(bucketId, file.$id);
          const buffer = Buffer.from(fileBuffer as ArrayBuffer);

          downloadedFiles.set(file.$id, { buffer, file });
          successCount++;
          totalSizeBytes += file.sizeOriginal || buffer.length;

          if (onProgress) {
            onProgress(successCount + errorCount, allFiles.length, file.name);
          }

          logger.debug(`Downloaded file ${file.name}`, {
            fileId: file.$id,
            size: buffer.length
          });
        } catch (error) {
          errorCount++;
          const errorMsg = `Failed to download file ${file.name} (${file.$id}): ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logger.error(errorMsg);

          if (onProgress) {
            onProgress(successCount + errorCount, allFiles.length, file.name);
          }
        }
      })
    );

    await Promise.all(downloadTasks);

    if (successCount === 0) {
      throw new Error(`Failed to download any files from bucket ${bucketId}`);
    }

    MessageFormatter.info(`Successfully downloaded ${successCount}/${allFiles.length} files`, { prefix: "Backup" });

    // Step 4: Create ZIP archive with all files
    MessageFormatter.info(`Creating ZIP archive for bucket ${bucketId}`, { prefix: "Backup" });
    const zip = new JSZip();

    for (const [fileId, { buffer, file }] of downloadedFiles.entries()) {
      // Preserve file structure by using file name
      const fileName = file.name || `file_${fileId}`;
      zip.file(fileName, new Uint8Array(buffer));
    }

    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: compressionLevel }
    });

    const zipSizeBytes = zipBuffer.length;
    MessageFormatter.info(`ZIP archive created: ${MessageFormatter.formatBytes(zipSizeBytes)}`, { prefix: "Backup" });

    // Step 5: Create manifest
    const fileMetadata: BucketFileMetadata[] = Array.from(downloadedFiles.values()).map(({ file }) => ({
      $id: file.$id,
      name: file.name,
      size: file.sizeOriginal,
      mimeType: file.mimeType,
      $permissions: file.$permissions,
      chunksCount: file.chunksTotal,
      signature: file.signature,
      $createdAt: file.$createdAt,
      $updatedAt: file.$updatedAt
    }));

    const manifest: BucketManifest = {
      version: "1.0",
      bucketId: bucket.$id,
      bucketName: bucket.name,
      createdAt: new Date().toISOString(),
      fileCount: successCount,
      totalSizeBytes,
      compression: bucket.compression === 'gzip' ? 'gzip' : 'none',
      files: fileMetadata,
      bucketConfiguration: {
        $permissions: bucket.$permissions,
        fileSecurity: bucket.fileSecurity,
        enabled: bucket.enabled,
        maximumFileSize: bucket.maximumFileSize,
        allowedFileExtensions: bucket.allowedFileExtensions,
        compression: bucket.compression,
        encryption: bucket.encryption,
        antivirus: bucket.antivirus
      }
    };

    // Step 6: Upload backup ZIP to backup bucket
    MessageFormatter.info(`Uploading backup ZIP to bucket ${backupBucketId}`, { prefix: "Backup" });
    const backupFileName = `${bucketId}.zip`;
    const backupFile = await storage.createFile(
      backupBucketId,
      ID.unique(),
      InputFile.fromBuffer(new Uint8Array(zipBuffer), backupFileName)
    );

    // Step 7: Upload manifest JSON
    const manifestFileId = await uploadManifest(storage, backupBucketId, bucketId, manifest);

    const status: 'completed' | 'partial' | 'failed' =
      errorCount === 0 ? 'completed' :
      successCount > 0 ? 'partial' :
      'failed';

    MessageFormatter.success(
      `Bucket backup ${status}: ${successCount}/${allFiles.length} files backed up`,
      { prefix: "Backup" }
    );

    return {
      backupFileId: backupFile.$id,
      manifestFileId,
      fileCount: successCount,
      totalSizeBytes,
      zipSizeBytes,
      status,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (error) {
    const errorMsg = `Bucket backup failed: ${error instanceof Error ? error.message : String(error)}`;
    MessageFormatter.error(errorMsg, error instanceof Error ? error : new Error(errorMsg), { prefix: "Backup" });

    return {
      backupFileId: '',
      manifestFileId: '',
      fileCount: 0,
      totalSizeBytes: 0,
      zipSizeBytes: 0,
      status: 'failed',
      errors: [errorMsg, ...errors]
    };
  }
}

/**
 * Uploads bucket manifest JSON to backup bucket
 */
async function uploadManifest(
  storage: Storage,
  backupBucketId: string,
  bucketId: string,
  manifest: BucketManifest
): Promise<string> {
  const manifestFileName = `${bucketId}.json`;
  const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8');

  const manifestFile = await storage.createFile(
    backupBucketId,
    ID.unique(),
    InputFile.fromBuffer(new Uint8Array(manifestBuffer), manifestFileName)
  );

  logger.info("Uploaded bucket manifest", {
    manifestFileId: manifestFile.$id,
    bucketId
  });

  return manifestFile.$id;
}
