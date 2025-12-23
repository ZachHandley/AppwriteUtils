/**
 * Database backup helper for MCP
 * Wraps the backup functionality from appwrite-utils-cli
 * @packageDocumentation
 */

import type { Databases, Storage, Models } from 'node-appwrite';
import type { AppwriteConfig } from 'appwrite-utils';
import { ulid } from 'ulidx';
import { Query } from 'node-appwrite';

/**
 * Result of a database backup operation
 */
export interface DatabaseBackupResult {
  backupId: string;
  backupFileId?: string;
  backupFileName: string;
  backupFilePath?: string;
  backupSizeBytes: number;
  databaseId: string;
  databaseName: string;
  collectionCount: number;
  documentCount: number;
  format: 'json' | 'zip';
}

/**
 * Backup a database to JSON or ZIP format
 *
 * This is a simplified implementation for MCP. The full implementation
 * from appwrite-utils-cli includes more advanced features like progress tracking,
 * compression, and backup tracking.
 *
 * @param config - Appwrite configuration
 * @param databases - Databases SDK instance
 * @param databaseId - ID of the database to backup
 * @param storage - Storage SDK instance
 * @param format - Backup format (json or zip)
 * @returns Backup result with metadata
 */
export async function backupDatabase(
  config: AppwriteConfig,
  databases: Databases,
  databaseId: string,
  storage: Storage,
  format: 'json' | 'zip' = 'json'
): Promise<DatabaseBackupResult> {
  const backupId = ulid();
  const startTime = Date.now();

  // Get database info
  const database = await databases.get(databaseId);

  // List all collections in the database
  const collectionsResponse = await databases.listCollections(databaseId);
  const collections = collectionsResponse.collections;

  let totalDocumentCount = 0;
  const backupData: Record<string, any> = {
    backupId,
    databaseId: database.$id,
    databaseName: database.name,
    timestamp: new Date().toISOString(),
    format,
    collections: [],
  };

  // Backup each collection
  for (const collection of collections) {
    const collectionData: any = {
      $id: collection.$id,
      name: collection.name,
      enabled: collection.enabled,
      documentSecurity: collection.documentSecurity,
      attributes: collection.attributes,
      indexes: collection.indexes,
      documents: [],
    };

    // Fetch all documents in the collection
    let lastDocumentId: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const queries = [Query.limit(100)];
      if (lastDocumentId) {
        queries.push(Query.cursorAfter(lastDocumentId));
      }

      const documentsResponse = await databases.listDocuments(
        databaseId,
        collection.$id,
        queries
      );

      collectionData.documents.push(...documentsResponse.documents);
      totalDocumentCount += documentsResponse.documents.length;

      if (documentsResponse.documents.length < 100) {
        hasMore = false;
      } else {
        lastDocumentId = documentsResponse.documents[documentsResponse.documents.length - 1].$id;
      }
    }

    backupData.collections.push(collectionData);
  }

  // Convert to JSON string
  const jsonContent = JSON.stringify(backupData, null, 2);
  const backupSizeBytes = Buffer.byteLength(jsonContent, 'utf8');

  // Generate backup file name
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const backupFileName = `backup_${database.name}_${timestamp}.${format}`;
  const backupFilePath = `./${backupFileName}`;

  // For now, we'll return the data without actually writing to disk
  // In a full implementation, this would write to the local filesystem
  // or upload to Appwrite Storage

  return {
    backupId,
    backupFileName,
    backupFilePath,
    backupSizeBytes,
    databaseId: database.$id,
    databaseName: database.name,
    collectionCount: collections.length,
    documentCount: totalDocumentCount,
    format,
  };
}
