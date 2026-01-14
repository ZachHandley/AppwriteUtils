import type { DatabaseAdapter } from 'appwrite-utils-helpers';
import { logger } from 'appwrite-utils-helpers';
import { tryAwaitWithRetry } from "appwrite-utils-helpers";
import { Query, ID } from "node-appwrite";
import {
  BACKUP_TABLE_ID,
  BACKUP_TABLE_NAME,
  type BackupMetadata,
  type BackupType,
  BackupMetadataSchema
} from "../../shared/backupMetadataSchema.js";

/**
 * Centralized backup tracking system
 *
 * All backups (databases, buckets, comprehensive) are tracked in a single
 * database selected by the user, providing a centralized backup registry.
 */

/**
 * Checks if backup tracking table exists in database
 */
async function tableExists(
  db: DatabaseAdapter,
  databaseId: string
): Promise<boolean> {
  try {
    await db.getTable({ databaseId, tableId: BACKUP_TABLE_ID });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Creates the centralized backup tracking table with enhanced schema
 */
export async function createCentralizedBackupTrackingTable(
  db: DatabaseAdapter,
  databaseId: string
): Promise<void> {
  // Check if table already exists
  const exists = await tableExists(db, databaseId);

  if (exists) {
    // Table exists - validate its schema
    try {
      const tableData = await db.getTable({ databaseId, tableId: BACKUP_TABLE_ID });
      const existingAttrs = ((tableData.data as any).attributes || []);

      // Expected attribute keys from our schema
      const expectedAttrKeys = [
        "backupType", "backupId", "manifestFileId", "format", "sizeBytes",
        "databaseId", "bucketId", "comprehensiveBackupId",
        "collections", "documents", "fileCount",
        "status", "error",
        "restoredAt", "restorationStatus", "restorationError"
      ];

      // Existing attribute keys
      const existingAttrKeys = new Set(existingAttrs.map((a: any) => a.key));

      // Check if they match
      const hasAllAttributes = expectedAttrKeys.every(key => existingAttrKeys.has(key));

      // Check if any have wrong sizes (old 10000 vs new 1000)
      const hasWrongSizes = existingAttrs.some((a: any) =>
        (a.key === 'error' || a.key === 'restorationError') && a.size === 10000
      );

      if (!hasAllAttributes || hasWrongSizes) {
        logger.warn("Backup table exists but has incorrect schema - recreating", {
          tableId: BACKUP_TABLE_ID,
          hasAllAttributes,
          hasWrongSizes,
          existingCount: existingAttrKeys.size,
          expectedCount: expectedAttrKeys.length
        });

        // Delete the old table
        await db.deleteTable({ databaseId, tableId: BACKUP_TABLE_ID });

        logger.info("Old backup table deleted, will recreate with correct schema");
      } else {
        logger.debug("Backup table exists with correct schema", {
          tableId: BACKUP_TABLE_ID,
          attributeCount: existingAttrKeys.size
        });
        return; // Table is good, no need to recreate
      }
    } catch (error) {
      // Error checking table - continue to create
      logger.debug("Error checking existing table, will attempt to create", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Create table (either first time or after deletion)
  logger.info("Creating centralized backup tracking table", {
    databaseId,
    tableId: BACKUP_TABLE_ID
  });

  await tryAwaitWithRetry(async () => {
    await db.createTable({
      databaseId,
      id: BACKUP_TABLE_ID,
      name: BACKUP_TABLE_NAME,
      permissions: [],
      documentSecurity: false,
      enabled: true
    });
  });

  // Define all attributes for the enhanced schema
  const attributes = [
    // Core backup info
    { key: "backupType", type: "enum" as const, elements: ["database", "bucket", "comprehensive"], required: true },
    { key: "backupId", type: "string" as const, size: 50, required: true },
    { key: "manifestFileId", type: "string" as const, size: 50, required: false },
    { key: "format", type: "enum" as const, elements: ["json", "zip"], required: true },
    { key: "sizeBytes", type: "integer" as const, required: true },

    // Resource identification (optional, at least one present based on type)
    { key: "databaseId", type: "string" as const, size: 50, required: false },
    { key: "bucketId", type: "string" as const, size: 50, required: false },
    { key: "comprehensiveBackupId", type: "string" as const, size: 50, required: false },

    // Database-specific metrics
    { key: "collections", type: "integer" as const, required: false },
    { key: "documents", type: "integer" as const, required: false },

    // Bucket-specific metrics
    { key: "fileCount", type: "integer" as const, required: false },

    // Status tracking
    { key: "status", type: "enum" as const, elements: ["completed", "partial", "failed"], required: true },
    { key: "error", type: "string" as const, size: 1000, required: false },

    // Restoration tracking
    { key: "restoredAt", type: "string" as const, size: 50, required: false },
    { key: "restorationStatus", type: "enum" as const, elements: ["completed", "partial", "failed", "not_restored"], required: false },
    { key: "restorationError", type: "string" as const, size: 1000, required: false }
  ];

  // Create each attribute with retry logic
  // No need to check for existing attributes - table is freshly created or validated above
  for (const attr of attributes) {
    await tryAwaitWithRetry(async () => {
      await db.createAttribute({
        databaseId,
        tableId: BACKUP_TABLE_ID,
        ...attr
      });
    });
  }

  logger.info("Centralized backup tracking table created successfully", {
    databaseId,
    tableId: BACKUP_TABLE_ID,
    attributeCount: attributes.length
  });
}

/**
 * Records backup metadata in the centralized tracking table
 */
export async function recordCentralizedBackup(
  db: DatabaseAdapter,
  trackingDatabaseId: string,
  metadata: Omit<BackupMetadata, '$id' | '$createdAt' | '$updatedAt'>
): Promise<BackupMetadata> {
  // Ensure tracking table exists with correct schema
  await createCentralizedBackupTrackingTable(db, trackingDatabaseId);

  // Create backup record with all fields
  // Table is guaranteed to have all attributes after createCentralizedBackupTrackingTable
  const result = await db.createRow({
    databaseId: trackingDatabaseId,
    tableId: BACKUP_TABLE_ID,
    id: ID.unique(),
    data: {
      // Core fields
      backupType: metadata.backupType,
      backupId: metadata.backupId,
      manifestFileId: metadata.manifestFileId || null,
      format: metadata.format,
      sizeBytes: metadata.sizeBytes,

      // Resource identification
      databaseId: metadata.databaseId || null,
      bucketId: metadata.bucketId || null,
      comprehensiveBackupId: metadata.comprehensiveBackupId || null,

      // Metrics
      collections: metadata.collections || null,
      documents: metadata.documents || null,
      fileCount: metadata.fileCount || null,

      // Status
      status: metadata.status,
      error: metadata.error || null,

      // Restoration
      restoredAt: metadata.restoredAt || null,
      restorationStatus: metadata.restorationStatus || 'not_restored',
      restorationError: metadata.restorationError || null
    }
  });

  logger.info("Recorded centralized backup metadata", {
    backupType: metadata.backupType,
    backupId: metadata.backupId,
    trackingDatabaseId
  });

  return result.data as BackupMetadata;
}

/**
 * Lists all backups of a specific type, sorted by creation date (newest first)
 */
export async function listCentralizedBackups(
  db: DatabaseAdapter,
  trackingDatabaseId: string,
  options?: {
    backupType?: BackupType;
    resourceId?: string;  // databaseId or bucketId
    limit?: number;
  }
): Promise<BackupMetadata[]> {
  try {
    const queries: string[] = [
      Query.orderDesc("$createdAt"),
      Query.limit(options?.limit || 100)
    ];

    // Filter by backup type if specified
    if (options?.backupType) {
      queries.push(Query.equal("backupType", options.backupType));
    }

    // Filter by resource ID if specified
    if (options?.resourceId) {
      if (options.backupType === 'database') {
        queries.push(Query.equal("databaseId", options.resourceId));
      } else if (options.backupType === 'bucket') {
        queries.push(Query.equal("bucketId", options.resourceId));
      }
    }

    const result = await db.listRows({
      databaseId: trackingDatabaseId,
      tableId: BACKUP_TABLE_ID,
      queries
    });

    return (result.rows || []) as BackupMetadata[];
  } catch (error) {
    logger.debug("No centralized backup tracking table found", { trackingDatabaseId });
    return [];
  }
}

/**
 * Gets a specific backup by its backup file ID
 */
export async function getCentralizedBackup(
  db: DatabaseAdapter,
  trackingDatabaseId: string,
  backupId: string
): Promise<BackupMetadata | null> {
  try {
    const result = await db.listRows({
      databaseId: trackingDatabaseId,
      tableId: BACKUP_TABLE_ID,
      queries: [
        Query.equal("backupId", backupId),
        Query.limit(1)
      ]
    });

    if (result.rows && result.rows.length > 0) {
      return result.rows[0] as BackupMetadata;
    }

    return null;
  } catch (error) {
    logger.debug("Backup not found", { backupId, trackingDatabaseId });
    return null;
  }
}

/**
 * Updates restoration status for a backup
 */
export async function updateRestorationStatus(
  db: DatabaseAdapter,
  trackingDatabaseId: string,
  backupRecordId: string,
  restorationData: {
    restoredAt: string;
    restorationStatus: 'completed' | 'partial' | 'failed';
    restorationError?: string;
  }
): Promise<void> {
  await db.updateRow({
    databaseId: trackingDatabaseId,
    tableId: BACKUP_TABLE_ID,
    id: backupRecordId,
    data: {
      restoredAt: restorationData.restoredAt,
      restorationStatus: restorationData.restorationStatus,
      restorationError: restorationData.restorationError || null
    }
  });

  logger.info("Updated restoration status", {
    backupRecordId,
    restorationStatus: restorationData.restorationStatus
  });
}

/**
 * Gets the most recent comprehensive backup
 */
export async function getLastComprehensiveBackup(
  db: DatabaseAdapter,
  trackingDatabaseId: string
): Promise<BackupMetadata | null> {
  try {
    const result = await db.listRows({
      databaseId: trackingDatabaseId,
      tableId: BACKUP_TABLE_ID,
      queries: [
        Query.equal("backupType", "comprehensive"),
        Query.orderDesc("$createdAt"),
        Query.limit(1)
      ]
    });

    if (result.rows && result.rows.length > 0) {
      return result.rows[0] as BackupMetadata;
    }

    return null;
  } catch (error) {
    logger.debug("No comprehensive backup found", { trackingDatabaseId });
    return null;
  }
}
