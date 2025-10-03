import JSZip from "jszip";
import type { BackupCreate } from "./schemas.js";

export interface BackupCompressionOptions {
  includeFiles?: boolean;
  compressionLevel?: number; // 0-9, default 6
}

/**
 * Creates a compressed ZIP backup from backup data
 *
 * Structure:
 * - metadata.json (backup metadata)
 * - database.json (database config)
 * - collections/*.json (one file per collection)
 * - documents/*.json (one file per collection's documents)
 * - files/ (optional, if includeFiles is true)
 */
export async function createBackupZip(
  backupData: BackupCreate,
  options: BackupCompressionOptions = {}
): Promise<Buffer> {
  const zip = new JSZip();
  const compressionLevel = options.compressionLevel ?? 6;

  // Add metadata.json
  const metadata = {
    version: "1.0",
    createdAt: new Date().toISOString(),
    databaseId: JSON.parse(backupData.database).$id,
    format: "zip",
    includesFiles: options.includeFiles ?? false
  };
  zip.file("metadata.json", JSON.stringify(metadata, null, 2));

  // Add database.json
  zip.file("database.json", backupData.database);

  // Add collections/*.json
  const collectionsFolder = zip.folder("collections");
  if (collectionsFolder) {
    backupData.collections.forEach((collectionStr, index) => {
      const collection = JSON.parse(collectionStr);
      collectionsFolder.file(`${collection.$id || `collection_${index}`}.json`, collectionStr);
    });
  }

  // Add documents/*.json
  const documentsFolder = zip.folder("documents");
  if (documentsFolder) {
    backupData.documents.forEach((docBatch) => {
      const collectionId = docBatch.collectionId;
      documentsFolder.file(`${collectionId}.json`, docBatch.data);
    });
  }

  // TODO: Add files support in future task (C3.5)
  if (options.includeFiles) {
    // Placeholder for file backup support
    const filesFolder = zip.folder("files");
    if (filesFolder) {
      filesFolder.file("file-manifest.json", JSON.stringify({
        note: "File backup not yet implemented"
      }, null, 2));
    }
  }

  // Generate ZIP buffer
  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: compressionLevel }
  });

  return buffer;
}

/**
 * Estimates compression ratio for backup data
 */
export function estimateCompressedSize(
  uncompressedSize: number,
  format: string = "json"
): number {
  // JSON typically compresses to 20-30% of original size with gzip
  const compressionRatio = format === "json" ? 0.25 : 0.5;
  return Math.ceil(uncompressedSize * compressionRatio);
}
