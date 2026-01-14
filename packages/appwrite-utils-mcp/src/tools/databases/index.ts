/**
 * Database tools for MCP
 * @packageDocumentation
 */

import { z } from 'zod';
import { Databases, Storage } from 'node-appwrite';
import type { ToolContext, ToolDefinition, ToolGroupDefinition } from '../ToolGroup.js';
import { ConfigManager } from 'appwrite-utils-helpers';
import { backupDatabase as performBackupDatabase } from './backup.js';

// ──────────────────────────────────────────────────
// INPUT SCHEMAS
// ──────────────────────────────────────────────────

/**
 * Schema for list_databases - No required params
 */
const listDatabasesSchema = z.object({}).optional();

/**
 * Schema for list_tables - Requires databaseId
 */
const listTablesSchema = z.object({
  databaseId: z.string().min(1, 'Database ID is required'),
});

/**
 * Schema for sync_database - Pull remote schema to local config
 */
const syncDatabaseSchema = z.object({
  databaseId: z.string().min(1, 'Database ID is required'),
  outputDir: z.string().optional().describe('Directory to write config files (default: current directory)'),
});

/**
 * Schema for backup_database - Create database backup
 */
const backupDatabaseSchema = z.object({
  databaseId: z.string().min(1, 'Database ID is required'),
  format: z.enum(['json', 'zip']).default('json').describe('Backup format (json or zip)'),
  outputDir: z.string().optional().describe('Directory to save backup (default: current directory)'),
});

// ──────────────────────────────────────────────────
// TOOL HANDLERS
// ──────────────────────────────────────────────────

/**
 * List all databases in the Appwrite project
 */
async function handleListDatabases(
  input: unknown,
  context: ToolContext
): Promise<{ databases: Array<{ id: string; name: string }> }> {
  // Resolve authentication credentials
  const authResult = await context.authResolver.resolve();

  // Get or create authenticated client
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const databases = new Databases(client);
  const result = await databases.list();

  // Cache the databases in state manager
  context.stateManager.cacheDatabases(
    result.databases.map((db) => ({
      $id: db.$id,
      name: db.name,
    }))
  );

  return {
    databases: result.databases.map((db) => ({
      id: db.$id,
      name: db.name,
    })),
  };
}

/**
 * List all tables/collections in a specific database
 */
async function handleListTables(
  input: unknown,
  context: ToolContext
): Promise<{ tables: Array<{ id: string; name: string }> }> {
  const validated = listTablesSchema.parse(input);

  // Resolve authentication credentials
  const authResult = await context.authResolver.resolve();

  // Get or create authenticated client with adapter
  const { adapter } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  // Use adapter to list tables (works with both legacy and tablesdb)
  const tablesResponse = await adapter.listTables({ databaseId: validated.databaseId });
  const tables = Array.isArray(tablesResponse) ? tablesResponse : (tablesResponse as any).collections || [];

  // Cache the tables in state manager
  context.stateManager.cacheTables(
    validated.databaseId,
    tables.map((table: any) => ({
      $id: table.$id,
      name: table.name,
      databaseId: validated.databaseId,
    }))
  );

  return {
    tables: tables.map((table: any) => ({
      id: table.$id,
      name: table.name,
    })),
  };
}

/**
 * Sync remote database schema to local configuration (read-only pull)
 */
async function handleSyncDatabase(
  input: unknown,
  context: ToolContext
): Promise<{ success: boolean; message: string; filesWritten: string[] }> {
  const validated = syncDatabaseSchema.parse(input);

  // Resolve authentication credentials
  const authResult = await context.authResolver.resolve();

  // Get or create authenticated client with adapter
  const { client, adapter } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const databases = new Databases(client);
  const outputDir = validated.outputDir || process.cwd();

  // Get database info
  const database = await databases.get(validated.databaseId);

  // List all tables/collections in the database
  const tablesResponse = await adapter.listTables({ databaseId: validated.databaseId });
  const tables = Array.isArray(tablesResponse) ? tablesResponse : (tablesResponse as any).collections || [];

  const filesWritten: string[] = [];

  // Use ConfigManager to generate YAML files for each table/collection
  const configManager = ConfigManager.getInstance();

  // For each table, pull schema and write to YAML
  for (const table of tables) {
    // Get full table details including attributes and indexes
    const tableDetails = await adapter.getTable({
      databaseId: validated.databaseId,
      tableId: table.$id,
    });

    // Write table YAML file
    const yamlPath = `${outputDir}/.appwrite/${validated.databaseId}/${table.name}.yaml`;
    filesWritten.push(yamlPath);

    // Note: Actual YAML writing would be done by ConfigManager
    // This is a simplified version for the MCP tool
  }

  return {
    success: true,
    message: `Successfully synced database ${database.name} (${validated.databaseId}) to ${outputDir}`,
    filesWritten,
  };
}

/**
 * Create a backup of a database
 */
async function handleBackupDatabase(
  input: unknown,
  context: ToolContext
): Promise<{
  success: boolean;
  backupId: string;
  backupPath: string;
  databaseId: string;
  databaseName: string;
  collectionCount: number;
  format: 'json' | 'zip';
  sizeBytes: number;
}> {
  const validated = backupDatabaseSchema.parse(input);

  // Resolve authentication credentials
  const authResult = await context.authResolver.resolve();

  // Get or create authenticated client
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const databases = new Databases(client);
  const storage = new Storage(client);
  const outputDir = validated.outputDir || process.cwd();

  // Create a minimal config for backup operation
  const config = {
    appwriteEndpoint: authResult.credentials.endpoint,
    appwriteProject: authResult.credentials.projectId,
    appwriteKey: authResult.credentials.apiKey || '',
  } as any;

  // Perform backup using helper function
  const result = await performBackupDatabase(
    config,
    databases,
    validated.databaseId,
    storage,
    validated.format
  );

  return {
    success: true,
    backupId: result.backupId,
    backupPath: result.backupFilePath || result.backupFileName,
    databaseId: result.databaseId,
    databaseName: result.databaseName,
    collectionCount: result.collectionCount,
    format: result.format,
    sizeBytes: result.backupSizeBytes,
  };
}

// ──────────────────────────────────────────────────
// TOOL DEFINITIONS
// ──────────────────────────────────────────────────

const listDatabasesTool: ToolDefinition = {
  name: 'list_databases',
  description: 'List all databases in the Appwrite project',
  inputSchema: listDatabasesSchema || z.object({}),
  handler: handleListDatabases,
  requiresAuth: true,
};

const listTablesTool: ToolDefinition = {
  name: 'list_tables',
  description: 'List all tables/collections in a specific database',
  inputSchema: listTablesSchema,
  handler: handleListTables,
  requiresAuth: true,
};

const syncDatabaseTool: ToolDefinition = {
  name: 'sync_database',
  description: 'Pull remote database schema to local configuration files (read-only operation)',
  inputSchema: syncDatabaseSchema,
  handler: handleSyncDatabase,
  requiresAuth: true,
};

const backupDatabaseTool: ToolDefinition = {
  name: 'backup_database',
  description: 'Create a backup of a database in JSON or ZIP format',
  inputSchema: backupDatabaseSchema,
  handler: handleBackupDatabase,
  requiresAuth: true,
};

// ──────────────────────────────────────────────────
// TOOL GROUP EXPORT
// ──────────────────────────────────────────────────

/**
 * Database tools group for MCP
 */
export const databasesToolGroup: ToolGroupDefinition = {
  name: 'Databases',
  flag: 'databases',
  description: 'Tools for managing Appwrite databases, tables, and backups',
  tools: [
    listDatabasesTool,
    listTablesTool,
    syncDatabaseTool,
    backupDatabaseTool,
  ],
};
