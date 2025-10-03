import { z } from "zod";

/**
 * Schema for comprehensive backup manifest
 *
 * This manifest tracks all databases and buckets included in a comprehensive backup,
 * allowing for complete system restoration.
 */

export interface DatabaseBackupReference {
  databaseId: string;
  databaseName: string;
  backupFileId: string;      // Storage file ID for the database backup ZIP/JSON
  manifestFileId: string;     // Storage file ID for the database manifest JSON
  collectionCount: number;
  documentCount: number;
  sizeBytes: number;
  status: 'completed' | 'partial' | 'failed';
  error?: string;
}

export interface BucketBackupReference {
  bucketId: string;
  bucketName: string;
  backupFileId: string;       // Storage file ID for the bucket backup ZIP
  manifestFileId: string;     // Storage file ID for the bucket manifest JSON
  fileCount: number;
  sizeBytes: number;
  status: 'completed' | 'partial' | 'failed';
  error?: string;
}

export interface ComprehensiveManifest {
  version: string;
  backupId: string;           // Unique ID for this comprehensive backup
  createdAt: string;          // ISO timestamp
  databases: DatabaseBackupReference[];
  buckets: BucketBackupReference[];
  totalSizeBytes: number;
  status: 'completed' | 'partial' | 'failed';
  errors?: string[];
}

export const DatabaseBackupReferenceSchema = z.object({
  databaseId: z.string(),
  databaseName: z.string(),
  backupFileId: z.string(),
  manifestFileId: z.string(),
  collectionCount: z.number(),
  documentCount: z.number(),
  sizeBytes: z.number(),
  status: z.enum(['completed', 'partial', 'failed']),
  error: z.string().optional()
});

export const BucketBackupReferenceSchema = z.object({
  bucketId: z.string(),
  bucketName: z.string(),
  backupFileId: z.string(),
  manifestFileId: z.string(),
  fileCount: z.number(),
  sizeBytes: z.number(),
  status: z.enum(['completed', 'partial', 'failed']),
  error: z.string().optional()
});

export const ComprehensiveManifestSchema = z.object({
  version: z.string().default("1.0"),
  backupId: z.string(),
  createdAt: z.string(),
  databases: z.array(DatabaseBackupReferenceSchema),
  buckets: z.array(BucketBackupReferenceSchema),
  totalSizeBytes: z.number(),
  status: z.enum(['completed', 'partial', 'failed']),
  errors: z.array(z.string()).optional()
});
