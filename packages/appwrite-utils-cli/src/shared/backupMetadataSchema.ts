import { z } from "zod";

/**
 * Schema for centralized backup tracking table (_appwrite_backups)
 *
 * Tracks all backups created for databases, buckets, and comprehensive backups
 */

export type BackupType = 'database' | 'bucket' | 'comprehensive';
export type BackupFormat = 'json' | 'zip';
export type BackupStatus = 'completed' | 'partial' | 'failed';
export type RestorationStatus = 'completed' | 'partial' | 'failed' | 'not_restored';

export const BACKUP_TYPES = ['database', 'bucket', 'comprehensive'] as const;
export const BACKUP_FORMATS = ['json', 'zip'] as const;
export const BACKUP_STATUSES = ['completed', 'partial', 'failed'] as const;
export const RESTORATION_STATUSES = ['completed', 'partial', 'failed', 'not_restored'] as const;

export const BackupTypeSchema = z.enum(['database', 'bucket', 'comprehensive']);
export const BackupFormatSchema = z.enum(['json', 'zip']);
export const BackupStatusSchema = z.enum(['completed', 'partial', 'failed']);
export const RestorationStatusSchema = z.enum(['completed', 'partial', 'failed', 'not_restored']);

export interface BackupMetadata {
  $id: string;
  $createdAt: string;
  $updatedAt: string;

  // Core backup info
  backupType: BackupType;         // Type of backup: database, bucket, or comprehensive
  backupId: string;               // File ID in storage bucket for the backup file
  manifestFileId?: string;        // File ID for the manifest JSON file
  format: BackupFormat;           // 'json' or 'zip'
  sizeBytes: number;              // Total backup file size

  // Resource identification (at least one must be present)
  databaseId?: string;            // Database ID (for database backups)
  bucketId?: string;              // Bucket ID (for bucket backups)
  comprehensiveBackupId?: string; // Parent comprehensive backup ID

  // Database-specific metrics
  collections?: number;           // Number of collections backed up
  documents?: number;             // Number of documents backed up

  // Bucket-specific metrics
  fileCount?: number;             // Number of files backed up (for bucket backups)

  // Status tracking
  status: BackupStatus;           // 'completed', 'partial', or 'failed'
  error?: string;                 // Error message if failed or partial

  // Restoration tracking
  restoredAt?: string;            // ISO timestamp of restoration
  restorationStatus: RestorationStatus; // Restoration status
  restorationError?: string;      // Error message if restoration failed
}

export const BackupMetadataSchema = z.object({
  $id: z.string(),
  $createdAt: z.string(),
  $updatedAt: z.string(),

  // Core backup info
  backupType: BackupTypeSchema,
  backupId: z.string(),
  manifestFileId: z.string().optional(),
  format: BackupFormatSchema,
  sizeBytes: z.number(),

  // Resource identification
  databaseId: z.string().optional(),
  bucketId: z.string().optional(),
  comprehensiveBackupId: z.string().optional(),

  // Database-specific metrics
  collections: z.number().optional(),
  documents: z.number().optional(),

  // Bucket-specific metrics
  fileCount: z.number().optional(),

  // Status tracking
  status: BackupStatusSchema,
  error: z.string().optional(),

  // Restoration tracking
  restoredAt: z.string().optional(),
  restorationStatus: RestorationStatusSchema.default('not_restored'),
  restorationError: z.string().optional()
});

export const BACKUP_TABLE_ID = "appwrite_backups";
export const BACKUP_TABLE_NAME = "Backup Tracking";
