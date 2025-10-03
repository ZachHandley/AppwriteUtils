import type { DatabaseAdapter } from "../adapters/DatabaseAdapter.js";
import { logger } from "./logging.js";
import { tryAwaitWithRetry } from "../utils/helperFunctions.js";
import { Query, ID } from "node-appwrite";
import {
  BACKUP_TABLE_ID,
  BACKUP_TABLE_NAME,
  type BackupMetadata,
  BackupMetadataSchema
} from "./backupMetadataSchema.js";

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
 * Creates the backup tracking table in the specified database
 */
export async function createBackupTrackingTable(
  db: DatabaseAdapter,
  databaseId: string
): Promise<void> {
  // Check if table already exists
  const exists = await tableExists(db, databaseId);
  if (exists) {
    logger.debug("Backup tracking table already exists", {
      databaseId,
      tableId: BACKUP_TABLE_ID
    });
    return;
  }

  logger.info("Creating backup tracking table", {
    databaseId,
    tableId: BACKUP_TABLE_ID
  });

  // Create table
  await tryAwaitWithRetry(async () => {
    await db.createTable({
      databaseId,
      id: BACKUP_TABLE_ID,
      name: BACKUP_TABLE_NAME
    });
  });

  // Create attributes
  const attributes = [
    {
      key: "backupId",
      type: "string" as const,
      size: 50,
      required: true
    },
    {
      key: "databaseId",
      type: "string" as const,
      size: 50,
      required: true
    },
    {
      key: "sizeBytes",
      type: "integer" as const,
      required: true
    },
    {
      key: "collections",
      type: "integer" as const,
      required: true
    },
    {
      key: "documents",
      type: "integer" as const,
      required: true
    },
    {
      key: "format",
      type: "enum" as const,
      elements: ["json", "zip"],
      required: true
    },
    {
      key: "status",
      type: "enum" as const,
      elements: ["completed", "failed"],
      required: true
    },
    {
      key: "error",
      type: "string" as const,
      size: 10000,
      required: false
    }
  ];

  for (const attr of attributes) {
    await tryAwaitWithRetry(async () => {
      await db.createAttribute({
        databaseId,
        tableId: BACKUP_TABLE_ID,
        ...attr
      });
    });
  }

  logger.info("Backup tracking table created successfully", {
    databaseId,
    tableId: BACKUP_TABLE_ID
  });
}

/**
 * Records backup metadata in the tracking table
 */
export async function recordBackup(
  db: DatabaseAdapter,
  databaseId: string,
  metadata: Omit<BackupMetadata, '$id' | '$createdAt' | '$updatedAt'>
): Promise<BackupMetadata> {
  // Ensure tracking table exists
  await createBackupTrackingTable(db, databaseId);

  // Create backup record
  const result = await db.createRow({
    databaseId,
    tableId: BACKUP_TABLE_ID,
    id: ID.unique(),
    data: {
      backupId: metadata.backupId,
      databaseId: metadata.databaseId,
      sizeBytes: metadata.sizeBytes,
      collections: metadata.collections,
      documents: metadata.documents,
      format: metadata.format,
      status: metadata.status,
      error: metadata.error
    }
  });

  logger.info("Recorded backup metadata", {
    backupId: metadata.backupId,
    databaseId: metadata.databaseId,
    format: metadata.format
  });

  return result.data as BackupMetadata;
}

/**
 * Lists all backups for a database, sorted by creation date (newest first)
 */
export async function listBackups(
  db: DatabaseAdapter,
  databaseId: string
): Promise<BackupMetadata[]> {
  try {
    const result = await db.listRows({
      databaseId,
      tableId: BACKUP_TABLE_ID,
      queries: [
        Query.orderDesc("$createdAt"),
        Query.limit(100) // Limit to last 100 backups
      ]
    });

    return (result.rows || []) as BackupMetadata[];
  } catch (error) {
    // Table might not exist yet
    logger.debug("No backup tracking table found", { databaseId });
    return [];
  }
}

/**
 * Gets the most recent backup for a database
 */
export async function getLastBackup(
  db: DatabaseAdapter,
  databaseId: string
): Promise<BackupMetadata | null> {
  try {
    const result = await db.listRows({
      databaseId,
      tableId: BACKUP_TABLE_ID,
      queries: [
        Query.orderDesc("$createdAt"),
        Query.limit(1)
      ]
    });

    if (result.rows && result.rows.length > 0) {
      return result.rows[0] as BackupMetadata;
    }

    return null;
  } catch (error) {
    logger.debug("No backup found or table doesn't exist", { databaseId });
    return null;
  }
}
