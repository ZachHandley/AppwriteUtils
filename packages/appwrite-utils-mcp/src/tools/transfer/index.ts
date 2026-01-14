/**
 * Transfer tools for MCP
 * @packageDocumentation
 */

import { z } from 'zod';
import { Databases, Storage, Query } from 'node-appwrite';
import type { ToolContext, ToolDefinition, ToolGroupDefinition } from '../ToolGroup.js';
import { AdapterFactory } from 'appwrite-utils-helpers';
import type { DatabaseAdapter } from 'appwrite-utils-helpers';
import { tryAwaitWithRetry } from 'appwrite-utils-helpers';
import { ulid } from 'ulidx';
import { InputFile } from 'node-appwrite/file';

// ──────────────────────────────────────────────────
// HELPER TYPES
// ──────────────────────────────────────────────────

interface BackupCreate {
  database: string;
  collections: string[];
  documents: Array<{ collectionId: string; data: string }>;
}

// ──────────────────────────────────────────────────
// INPUT SCHEMAS
// ──────────────────────────────────────────────────

/**
 * Schema for transfer_database - Transfer database between projects
 */
const transferDatabaseSchema = z.object({
  sourceDatabaseId: z.string().min(1, 'Source database ID is required'),
  targetEndpoint: z.string().url('Target endpoint must be a valid URL'),
  targetProjectId: z.string().min(1, 'Target project ID is required'),
  targetApiKey: z.string().min(1, 'Target API key is required'),
  targetDatabaseId: z.string().optional().describe('Target database ID (defaults to same as source)'),
});

/**
 * Schema for export_database - Export database to JSON
 */
const exportDatabaseSchema = z.object({
  databaseId: z.string().min(1, 'Database ID is required'),
  outputDir: z.string().optional().describe('Directory to save export (defaults to current directory)'),
  format: z.enum(['json', 'zip']).default('json').describe('Export format (json or zip)'),
});

// ──────────────────────────────────────────────────
// TOOL HANDLERS
// ──────────────────────────────────────────────────

/**
 * Transfer database between projects
 */
async function handleTransferDatabase(
  input: unknown,
  context: ToolContext
): Promise<{
  success: boolean;
  message: string;
  sourceDatabaseId: string;
  targetDatabaseId: string;
  collectionsTransferred: number;
}> {
  const validated = transferDatabaseSchema.parse(input);

  // Resolve source authentication credentials
  const sourceAuth = await context.authResolver.resolve();

  // Get or create source client with adapter
  const { client: sourceClient, adapter: sourceAdapter } = await context.clientRegistry.getOrCreate({
    endpoint: sourceAuth.credentials.endpoint,
    projectId: sourceAuth.credentials.projectId,
    apiKey: sourceAuth.credentials.apiKey,
    sessionCookie: sourceAuth.credentials.sessionCookie,
    authMethod: sourceAuth.credentials.authMethod,
  });

  // Create target adapter using provided credentials
  const targetAdapterResult = await AdapterFactory.create({
    appwriteEndpoint: validated.targetEndpoint,
    appwriteProject: validated.targetProjectId,
    appwriteKey: validated.targetApiKey,
    apiMode: 'auto',
  });

  const targetAdapter = targetAdapterResult.adapter;
  const targetDatabaseId = validated.targetDatabaseId || validated.sourceDatabaseId;

  // Get databases instances
  const sourceDatabases = new Databases(sourceClient);
  const targetDatabases = new Databases(targetAdapterResult.client);

  // Get source database info
  const sourceDb = await sourceDatabases.get(validated.sourceDatabaseId);

  // Ensure target database exists
  try {
    await targetDatabases.get(targetDatabaseId);
  } catch (error) {
    // Database doesn't exist, create it
    await targetDatabases.create(targetDatabaseId, sourceDb.name);
  }

  // List all collections from source database
  const collectionsResponse = await sourceAdapter.listTables({
    databaseId: validated.sourceDatabaseId,
  });

  const collections = (collectionsResponse as any).collections || (collectionsResponse as any).tables || [];
  let transferredCount = 0;

  // Transfer each collection
  for (const collection of collections) {
    try {
      // Get full collection details
      const collectionDetails = await sourceAdapter.getTable({
        databaseId: validated.sourceDatabaseId,
        tableId: collection.$id,
      });

      // Check if collection exists in target
      let targetCollection: any;
      try {
        targetCollection = await targetAdapter.getTable({
          databaseId: targetDatabaseId,
          tableId: collection.$id,
        });
      } catch (error) {
        // Collection doesn't exist, create it
        targetCollection = await targetAdapter.createTable({
          databaseId: targetDatabaseId,
          id: collection.$id,
          name: collection.name,
          permissions: collection.$permissions || [],
          documentSecurity: collection.documentSecurity,
          enabled: collection.enabled,
        });
      }

      // Transfer attributes (non-relationship first)
      const attributes = (collectionDetails as any).attributes || (collectionDetails as any).columns || [];
      const nonRelAttributes = attributes.filter((attr: any) => attr.type !== 'relationship');

      for (const attr of nonRelAttributes) {
        try {
          await targetAdapter.createAttribute({
            databaseId: targetDatabaseId,
            tableId: collection.$id,
            key: attr.key,
            type: attr.type,
            size: attr.size,
            required: attr.required,
            default: attr.default,
            array: attr.array,
            encrypt: attr.encrypt,
            min: attr.min,
            max: attr.max,
            elements: attr.elements,
          });
          await new Promise((resolve) => setTimeout(resolve, 150));
        } catch (error) {
          // Attribute might already exist, continue
        }
      }

      // Wait for attributes to become available
      for (const attr of nonRelAttributes) {
        const maxWait = 60000;
        const start = Date.now();
        while (Date.now() - start < maxWait) {
          try {
            const tableRes = await targetAdapter.getTable({
              databaseId: targetDatabaseId,
              tableId: collection.$id,
            });
            const attrs = (tableRes as any).attributes || (tableRes as any).columns || [];
            const found = attrs.find((a: any) => a.key === attr.key);
            if (found && found.status === 'available') break;
          } catch (error) {
            // Continue waiting
          }
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      // Transfer relationship attributes
      const relAttributes = attributes.filter((attr: any) => attr.type === 'relationship');
      for (const attr of relAttributes) {
        try {
          await targetAdapter.createAttribute({
            databaseId: targetDatabaseId,
            tableId: collection.$id,
            key: attr.key,
            type: 'relationship',
            relatedCollection: attr.relatedCollection,
            relationType: attr.relationType,
            twoWay: attr.twoWay,
            twoWayKey: attr.twoWayKey,
            onDelete: attr.onDelete,
          });
          await new Promise((resolve) => setTimeout(resolve, 150));
        } catch (error) {
          // Relationship might already exist, continue
        }
      }

      // Transfer indexes
      const indexes = (collectionDetails as any).indexes || [];
      for (const index of indexes) {
        try {
          await targetAdapter.createIndex({
            databaseId: targetDatabaseId,
            tableId: collection.$id,
            key: index.key,
            type: index.type,
            attributes: index.attributes || index.columns || [],
            orders: index.orders || [],
          });
          await new Promise((resolve) => setTimeout(resolve, 150));
        } catch (error) {
          // Index might already exist, continue
        }
      }

      // Transfer documents
      let lastDocumentId: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const queries = [Query.limit(100)];
        if (lastDocumentId) {
          queries.push(Query.cursorAfter(lastDocumentId));
        }

        const documentsResponse = await sourceAdapter.listRows({
          databaseId: validated.sourceDatabaseId,
          tableId: collection.$id,
          queries,
        });

        const documents = (documentsResponse as any).documents || (documentsResponse as any).rows || [];

        for (const doc of documents) {
          try {
            await targetAdapter.createRow({
              databaseId: targetDatabaseId,
              tableId: collection.$id,
              id: doc.$id,
              data: doc,
              permissions: doc.$permissions,
            });
          } catch (error) {
            // Document might already exist, try update
            try {
              await targetAdapter.updateRow({
                databaseId: targetDatabaseId,
                tableId: collection.$id,
                id: doc.$id,
                data: doc,
                permissions: doc.$permissions,
              });
            } catch (updateError) {
              // Skip if still fails
            }
          }
        }

        hasMore = documents.length === 100;
        if (hasMore) {
          lastDocumentId = documents[documents.length - 1].$id;
        }
      }

      transferredCount++;
    } catch (error) {
      // Log error but continue with next collection
      console.error(`Failed to transfer collection ${collection.name}:`, error);
    }
  }

  return {
    success: true,
    message: `Successfully transferred ${transferredCount} collections from ${sourceDb.name} to target`,
    sourceDatabaseId: validated.sourceDatabaseId,
    targetDatabaseId,
    collectionsTransferred: transferredCount,
  };
}

/**
 * Export database to JSON
 */
async function handleExportDatabase(
  input: unknown,
  context: ToolContext
): Promise<{
  success: boolean;
  exportPath: string;
  databaseId: string;
  databaseName: string;
  collectionCount: number;
  documentCount: number;
  sizeBytes: number;
}> {
  const validated = exportDatabaseSchema.parse(input);

  // Resolve authentication credentials
  const authResult = await context.authResolver.resolve();

  // Get or create authenticated client
  const { client, adapter } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const databases = new Databases(client);
  const storage = new Storage(client);

  // Get database info
  const database = await databases.get(validated.databaseId);

  let data: BackupCreate = {
    database: '',
    collections: [],
    documents: [],
  };

  // Serialize database metadata
  data.database = JSON.stringify(database);

  // List all collections
  const collectionsResponse = await adapter.listTables({
    databaseId: validated.databaseId,
  });

  const collections = (collectionsResponse as any).collections || (collectionsResponse as any).tables || [];
  let totalDocuments = 0;

  // Export each collection
  for (const collection of collections) {
    try {
      // Get full collection details
      const collectionDetails = await adapter.getTable({
        databaseId: validated.databaseId,
        tableId: collection.$id,
      });

      data.collections.push(JSON.stringify(collectionDetails));

      // Export all documents from this collection
      let lastDocumentId: string | undefined;
      let hasMore = true;
      const allDocuments: any[] = [];

      while (hasMore) {
        const queries = [Query.limit(500)];
        if (lastDocumentId) {
          queries.push(Query.cursorAfter(lastDocumentId));
        }

        const documentsResponse = await adapter.listRows({
          databaseId: validated.databaseId,
          tableId: collection.$id,
          queries,
        });

        const documents = (documentsResponse as any).documents || (documentsResponse as any).rows || [];
        allDocuments.push(...documents);
        totalDocuments += documents.length;

        hasMore = documents.length === 500;
        if (hasMore) {
          lastDocumentId = documents[documents.length - 1].$id;
        }
      }

      data.documents.push({
        collectionId: collection.$id,
        data: JSON.stringify(allDocuments),
      });
    } catch (error) {
      console.error(`Failed to export collection ${collection.name}:`, error);
    }
  }

  // Create backup file
  const backupId = ulid();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `backup-${validated.databaseId}-${timestamp}.json`;

  // Ensure backup bucket exists
  const BACKUP_BUCKET_ID = 'appwrite-backups';
  try {
    await storage.getBucket(BACKUP_BUCKET_ID);
  } catch (error) {
    // Create backup bucket
    await storage.createBucket(
      BACKUP_BUCKET_ID,
      'Backups',
      [],
      false,
      true
    );
  }

  // Upload backup file
  const backupContent = JSON.stringify(data, null, 2);
  const backupBuffer = Buffer.from(backupContent, 'utf-8');
  const backupFile = InputFile.fromBuffer(new Uint8Array(backupBuffer), fileName);

  const uploadedFile = await storage.createFile(
    BACKUP_BUCKET_ID,
    backupId,
    backupFile
  );

  return {
    success: true,
    exportPath: `${BACKUP_BUCKET_ID}/${fileName}`,
    databaseId: validated.databaseId,
    databaseName: database.name,
    collectionCount: data.collections.length,
    documentCount: totalDocuments,
    sizeBytes: backupBuffer.length,
  };
}

// ──────────────────────────────────────────────────
// TOOL DEFINITIONS
// ──────────────────────────────────────────────────

const transferDatabaseTool: ToolDefinition = {
  name: 'transfer_database',
  description: 'Transfer a database with all collections, attributes, and documents to another Appwrite project',
  inputSchema: transferDatabaseSchema,
  handler: handleTransferDatabase,
  requiresAuth: true,
};

const exportDatabaseTool: ToolDefinition = {
  name: 'export_database',
  description: 'Export a database to JSON format with all collections and documents',
  inputSchema: exportDatabaseSchema,
  handler: handleExportDatabase,
  requiresAuth: true,
};

// ──────────────────────────────────────────────────
// TOOL GROUP EXPORT
// ──────────────────────────────────────────────────

/**
 * Transfer tools group for MCP
 */
export const transferToolGroup: ToolGroupDefinition = {
  name: 'Transfer',
  flag: 'transfer',
  description: 'Tools for transferring and exporting databases between projects',
  tools: [transferDatabaseTool, exportDatabaseTool],
};
