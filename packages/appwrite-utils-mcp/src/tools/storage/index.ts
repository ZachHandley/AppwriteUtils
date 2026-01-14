/**
 * Storage tools for MCP
 * @packageDocumentation
 */

import { z } from 'zod';
import { Storage } from 'node-appwrite';
import type { ToolContext, ToolDefinition, ToolGroupDefinition } from '../ToolGroup.js';

// ──────────────────────────────────────────────────
// INPUT SCHEMAS
// ──────────────────────────────────────────────────

/**
 * Schema for list_buckets - No required params
 */
const listBucketsSchema = z.object({}).optional();

/**
 * Schema for get_bucket - Requires bucketId
 */
const getBucketSchema = z.object({
  bucketId: z.string().min(1, 'Bucket ID is required'),
});

/**
 * Schema for list_files - Requires bucketId, optional limit and offset
 */
const listFilesSchema = z.object({
  bucketId: z.string().min(1, 'Bucket ID is required'),
  limit: z.number().int().positive().max(100).optional().describe('Maximum number of files to return (max 100)'),
  offset: z.number().int().nonnegative().optional().describe('Offset for pagination'),
});

// ──────────────────────────────────────────────────
// TOOL HANDLERS
// ──────────────────────────────────────────────────

/**
 * List all storage buckets in the Appwrite project
 */
async function handleListBuckets(
  input: unknown,
  context: ToolContext
): Promise<{ buckets: Array<{ id: string; name: string; fileSecurity: boolean; enabled: boolean }> }> {
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

  const storage = new Storage(client);
  const result = await storage.listBuckets();

  // Cache the buckets in state manager
  context.stateManager.cacheBuckets(
    result.buckets.map((bucket) => ({
      $id: bucket.$id,
      name: bucket.name,
      fileSecurity: bucket.fileSecurity,
      enabled: bucket.enabled,
    }))
  );

  return {
    buckets: result.buckets.map((bucket) => ({
      id: bucket.$id,
      name: bucket.name,
      fileSecurity: bucket.fileSecurity,
      enabled: bucket.enabled,
    })),
  };
}

/**
 * Get details of a specific storage bucket
 */
async function handleGetBucket(
  input: unknown,
  context: ToolContext
): Promise<{
  id: string;
  name: string;
  fileSecurity: boolean;
  enabled: boolean;
  maximumFileSize: number;
  allowedFileExtensions: string[];
  compression: string;
  encryption: boolean;
  antivirus: boolean;
}> {
  const validated = getBucketSchema.parse(input);

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

  const storage = new Storage(client);
  const bucket = await storage.getBucket(validated.bucketId);

  return {
    id: bucket.$id,
    name: bucket.name,
    fileSecurity: bucket.fileSecurity,
    enabled: bucket.enabled,
    maximumFileSize: bucket.maximumFileSize,
    allowedFileExtensions: bucket.allowedFileExtensions,
    compression: bucket.compression,
    encryption: bucket.encryption,
    antivirus: bucket.antivirus,
  };
}

/**
 * List files in a specific storage bucket
 */
async function handleListFiles(
  input: unknown,
  context: ToolContext
): Promise<{
  files: Array<{
    id: string;
    name: string;
    bucketId: string;
    mimeType: string;
    sizeOriginal: number;
    chunksTotal: number;
    chunksUploaded: number;
  }>;
  total: number;
}> {
  const validated = listFilesSchema.parse(input);

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

  const storage = new Storage(client);

  // Build queries array for limit and offset
  const queries: string[] = [];
  if (validated.limit !== undefined) {
    queries.push(`limit(${validated.limit})`);
  }
  if (validated.offset !== undefined) {
    queries.push(`offset(${validated.offset})`);
  }

  const result = await storage.listFiles(validated.bucketId, queries);

  return {
    files: result.files.map((file) => ({
      id: file.$id,
      name: file.name,
      bucketId: file.bucketId,
      mimeType: file.mimeType,
      sizeOriginal: file.sizeOriginal,
      chunksTotal: file.chunksTotal,
      chunksUploaded: file.chunksUploaded,
    })),
    total: result.total,
  };
}

// ──────────────────────────────────────────────────
// TOOL DEFINITIONS
// ──────────────────────────────────────────────────

const listBucketsTool: ToolDefinition = {
  name: 'list_buckets',
  description: 'List all storage buckets in the Appwrite project',
  inputSchema: listBucketsSchema || z.object({}),
  handler: handleListBuckets,
  requiresAuth: true,
};

const getBucketTool: ToolDefinition = {
  name: 'get_bucket',
  description: 'Get detailed information about a specific storage bucket',
  inputSchema: getBucketSchema,
  handler: handleGetBucket,
  requiresAuth: true,
};

const listFilesTool: ToolDefinition = {
  name: 'list_files',
  description: 'List files in a specific storage bucket with optional pagination',
  inputSchema: listFilesSchema,
  handler: handleListFiles,
  requiresAuth: true,
};

// ──────────────────────────────────────────────────
// TOOL GROUP EXPORT
// ──────────────────────────────────────────────────

/**
 * Storage tools group for MCP
 */
export const storageToolGroup: ToolGroupDefinition = {
  name: 'Storage',
  flag: 'storage',
  description: 'Tools for managing Appwrite storage buckets and files',
  tools: [
    listBucketsTool,
    getBucketTool,
    listFilesTool,
  ],
};
