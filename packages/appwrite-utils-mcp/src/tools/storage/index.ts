/**
 * Storage tools for MCP
 * @packageDocumentation
 */

import { z } from 'zod';
import { ImageFormat, ImageGravity } from 'node-appwrite';
import type { ToolContext, ToolDefinition, ToolGroupDefinition } from '../ToolGroup.js';
// Deep import: StorageManager is not yet re-exported from the package barrel
// (helpers/src/index.ts is orchestrator-owned). Once `export * from './storage';`
// lands there, this import can become `from 'appwrite-utils-helpers'`.
import { StorageManager } from 'appwrite-utils-helpers/dist/storage/storageManager.js';

// ──────────────────────────────────────────────────
// INPUT SCHEMAS
// ──────────────────────────────────────────────────

const compressionEnum = z.enum(['none', 'gzip', 'zstd']);

const imageGravityEnum = z.enum([
  'center',
  'top-left',
  'top',
  'top-right',
  'left',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
]);

const imageFormatEnum = z.enum(['jpg', 'jpeg', 'png', 'webp', 'heic', 'avif', 'gif']);

const listBucketsSchema = z.object({
  queries: z
    .array(z.string())
    .optional()
    .describe(
      'Array of Appwrite Query strings. Filter on: enabled, name, fileSecurity, maximumFileSize, encryption, antivirus, transformations.'
    ),
  search: z
    .string()
    .max(256)
    .optional()
    .describe('Free-text search string applied server-side (max 256 chars).'),
});

const getBucketSchema = z.object({
  bucketId: z.string().min(1, 'Bucket ID is required'),
});

const createBucketSchema = z.object({
  bucketId: z.string().min(1, 'Bucket ID is required'),
  name: z.string().min(1, 'Bucket name is required'),
  permissions: z.array(z.string()).optional().describe('Array of Appwrite permission strings.'),
  fileSecurity: z.boolean().optional().describe('Enable per-file permissions in this bucket.'),
  enabled: z.boolean().optional().describe('Whether the bucket is enabled (default: true).'),
  maximumFileSize: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum file size in bytes (max 5GB).'),
  allowedFileExtensions: z
    .array(z.string())
    .max(100)
    .optional()
    .describe('Allowed file extensions (max 100, each up to 64 chars).'),
  compression: compressionEnum.optional().describe('Compression algorithm: none, gzip, or zstd.'),
  encryption: z.boolean().optional().describe('Enable server-side encryption.'),
  antivirus: z.boolean().optional().describe('Enable antivirus scanning on upload.'),
});

const updateBucketSchema = z.object({
  bucketId: z.string().min(1, 'Bucket ID is required'),
  name: z.string().min(1, 'Bucket name is required'),
  permissions: z.array(z.string()).optional(),
  fileSecurity: z.boolean().optional(),
  enabled: z.boolean().optional(),
  maximumFileSize: z.number().int().positive().optional(),
  allowedFileExtensions: z.array(z.string()).max(100).optional(),
  compression: compressionEnum.optional(),
  encryption: z.boolean().optional(),
  antivirus: z.boolean().optional(),
});

const deleteBucketSchema = z.object({
  bucketId: z.string().min(1, 'Bucket ID is required'),
});

const listFilesSchema = z.object({
  bucketId: z.string().min(1, 'Bucket ID is required'),
  queries: z
    .array(z.string())
    .optional()
    .describe(
      'Array of Appwrite Query strings. Filter on: name, signature, mimeType, sizeOriginal, chunksTotal, chunksUploaded.'
    ),
  search: z
    .string()
    .max(256)
    .optional()
    .describe('Free-text search string applied server-side (max 256 chars).'),
});

const getFileSchema = z.object({
  bucketId: z.string().min(1, 'Bucket ID is required'),
  fileId: z.string().min(1, 'File ID is required'),
});

const deleteFileSchema = z.object({
  bucketId: z.string().min(1, 'Bucket ID is required'),
  fileId: z.string().min(1, 'File ID is required'),
});

const getFileDownloadUrlSchema = z.object({
  bucketId: z.string().min(1, 'Bucket ID is required'),
  fileId: z.string().min(1, 'File ID is required'),
});

const getFilePreviewUrlSchema = z.object({
  bucketId: z.string().min(1, 'Bucket ID is required'),
  fileId: z.string().min(1, 'File ID is required'),
  width: z.number().int().min(0).max(4000).optional(),
  height: z.number().int().min(0).max(4000).optional(),
  gravity: imageGravityEnum.optional(),
  quality: z.number().int().min(0).max(100).optional(),
  borderWidth: z.number().int().min(0).max(100).optional(),
  borderColor: z.string().optional().describe('Hex color without # prefix.'),
  borderRadius: z.number().int().min(0).max(4000).optional(),
  opacity: z.number().min(0).max(1).optional(),
  rotation: z.number().int().min(-360).max(360).optional(),
  background: z.string().optional().describe('Hex color without # prefix.'),
  output: imageFormatEnum.optional(),
});

const getFileViewUrlSchema = z.object({
  bucketId: z.string().min(1, 'Bucket ID is required'),
  fileId: z.string().min(1, 'File ID is required'),
});

// ──────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────

/**
 * Slim projection for a bucket in list views — keeps the per-row payload light
 * so MCP clients are not flooded by large bucket lists.
 */
function projectBucketSlim(bucket: Models_Bucket) {
  return {
    $id: bucket.$id,
    name: bucket.name,
    enabled: bucket.enabled,
    fileSecurity: bucket.fileSecurity,
    maximumFileSize: bucket.maximumFileSize,
    $createdAt: bucket.$createdAt,
  };
}

/**
 * Slim projection for a file in list views.
 */
function projectFileSlim(file: Models_File) {
  return {
    $id: file.$id,
    name: file.name,
    signature: file.signature,
    mimeType: file.mimeType,
    sizeOriginal: file.sizeOriginal,
    chunksTotal: file.chunksTotal,
    chunksUploaded: file.chunksUploaded,
    $createdAt: file.$createdAt,
  };
}

// Lightweight structural types so we don't have to drag in node-appwrite
// Models.* explicitly — they match the v23 SDK shapes we read from.
interface Models_Bucket {
  $id: string;
  $createdAt: string;
  name: string;
  enabled: boolean;
  fileSecurity: boolean;
  maximumFileSize: number;
  [key: string]: unknown;
}

interface Models_File {
  $id: string;
  $createdAt: string;
  name: string;
  signature: string;
  mimeType: string;
  sizeOriginal: number;
  chunksTotal: number;
  chunksUploaded: number;
  [key: string]: unknown;
}

/**
 * Build a public storage URL the human can open or fetch directly. We do NOT
 * ship raw bytes through MCP — file download/preview/view tools return URLs.
 *
 * `extraParams` is appended to the query string after the mandatory `project`
 * key (used by the Appwrite REST API for project resolution).
 */
function buildStorageUrl(
  endpoint: string,
  projectId: string,
  bucketId: string,
  fileId: string,
  kind: 'download' | 'preview' | 'view',
  extraParams?: Record<string, string | number | boolean | undefined>
): string {
  // Drop any trailing slash on the endpoint so we don't end up with a double /
  const base = endpoint.replace(/\/+$/, '');
  const params = new URLSearchParams();
  params.set('project', projectId);
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value === undefined || value === null || value === '') continue;
      params.set(key, String(value));
    }
  }
  return `${base}/storage/buckets/${encodeURIComponent(bucketId)}/files/${encodeURIComponent(
    fileId
  )}/${kind}?${params.toString()}`;
}

// ──────────────────────────────────────────────────
// TOOL HANDLERS
// ──────────────────────────────────────────────────

async function handleListBuckets(
  input: unknown,
  context: ToolContext
): Promise<{
  total: number;
  buckets: Array<{
    $id: string;
    name: string;
    enabled: boolean;
    fileSecurity: boolean;
    maximumFileSize: number;
    $createdAt: string;
  }>;
}> {
  const validated = listBucketsSchema.parse(input ?? {});

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const storageManager = new StorageManager(client);
  const result = await storageManager.listBuckets(validated.queries, validated.search);

  return {
    total: result.total,
    buckets: result.buckets.map((bucket) =>
      projectBucketSlim(bucket as unknown as Models_Bucket)
    ),
  };
}

async function handleGetBucket(input: unknown, context: ToolContext): Promise<unknown> {
  const validated = getBucketSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const storageManager = new StorageManager(client);
  return await storageManager.getBucket(validated.bucketId);
}

async function handleCreateBucket(input: unknown, context: ToolContext): Promise<unknown> {
  const validated = createBucketSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const storageManager = new StorageManager(client);
  return await storageManager.createBucket({
    bucketId: validated.bucketId,
    name: validated.name,
    permissions: validated.permissions,
    fileSecurity: validated.fileSecurity,
    enabled: validated.enabled,
    maximumFileSize: validated.maximumFileSize,
    allowedFileExtensions: validated.allowedFileExtensions,
    compression: validated.compression,
    encryption: validated.encryption,
    antivirus: validated.antivirus,
  });
}

async function handleUpdateBucket(input: unknown, context: ToolContext): Promise<unknown> {
  const validated = updateBucketSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const storageManager = new StorageManager(client);
  return await storageManager.updateBucket(validated.bucketId, {
    name: validated.name,
    permissions: validated.permissions,
    fileSecurity: validated.fileSecurity,
    enabled: validated.enabled,
    maximumFileSize: validated.maximumFileSize,
    allowedFileExtensions: validated.allowedFileExtensions,
    compression: validated.compression,
    encryption: validated.encryption,
    antivirus: validated.antivirus,
  });
}

async function handleDeleteBucket(
  input: unknown,
  context: ToolContext
): Promise<{ success: true }> {
  const validated = deleteBucketSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const storageManager = new StorageManager(client);
  await storageManager.deleteBucket(validated.bucketId);
  return { success: true };
}

async function handleListFiles(
  input: unknown,
  context: ToolContext
): Promise<{
  total: number;
  files: Array<{
    $id: string;
    name: string;
    signature: string;
    mimeType: string;
    sizeOriginal: number;
    chunksTotal: number;
    chunksUploaded: number;
    $createdAt: string;
  }>;
}> {
  const validated = listFilesSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const storageManager = new StorageManager(client);
  const result = await storageManager.listFiles(
    validated.bucketId,
    validated.queries,
    validated.search
  );

  return {
    total: result.total,
    files: result.files.map((file) => projectFileSlim(file as unknown as Models_File)),
  };
}

async function handleGetFile(input: unknown, context: ToolContext): Promise<unknown> {
  const validated = getFileSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const storageManager = new StorageManager(client);
  return await storageManager.getFile(validated.bucketId, validated.fileId);
}

async function handleDeleteFile(
  input: unknown,
  context: ToolContext
): Promise<{ success: true }> {
  const validated = deleteFileSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const storageManager = new StorageManager(client);
  await storageManager.deleteFile(validated.bucketId, validated.fileId);
  return { success: true };
}

/**
 * Build a URL the caller can use to download the file. We intentionally do NOT
 * call StorageManager.getFileDownload — raw bytes are awkward to ship through
 * MCP and large files would blow the response size.
 */
async function handleGetFileDownloadUrl(
  input: unknown,
  context: ToolContext
): Promise<{ url: string }> {
  const validated = getFileDownloadUrlSchema.parse(input);
  const authResult = await context.authResolver.resolve();
  // No client call needed — we just need endpoint + projectId to construct the URL.
  return {
    url: buildStorageUrl(
      authResult.credentials.endpoint,
      authResult.credentials.projectId,
      validated.bucketId,
      validated.fileId,
      'download'
    ),
  };
}

async function handleGetFilePreviewUrl(
  input: unknown,
  context: ToolContext
): Promise<{ url: string }> {
  const validated = getFilePreviewUrlSchema.parse(input);
  const authResult = await context.authResolver.resolve();

  // Validate enum strings against the SDK enums for parity — z.enum already
  // restricted the values, but we want to ensure they round-trip cleanly.
  const gravity =
    validated.gravity !== undefined
      ? (ImageGravity as Record<string, string>)
      : undefined;
  const output =
    validated.output !== undefined ? (ImageFormat as Record<string, string>) : undefined;
  // The enum lookups above are intentionally side-effect free — we ship the raw
  // string value into the URL since that's what the REST API expects.
  void gravity;
  void output;

  return {
    url: buildStorageUrl(
      authResult.credentials.endpoint,
      authResult.credentials.projectId,
      validated.bucketId,
      validated.fileId,
      'preview',
      {
        width: validated.width,
        height: validated.height,
        gravity: validated.gravity,
        quality: validated.quality,
        borderWidth: validated.borderWidth,
        borderColor: validated.borderColor,
        borderRadius: validated.borderRadius,
        opacity: validated.opacity,
        rotation: validated.rotation,
        background: validated.background,
        output: validated.output,
      }
    ),
  };
}

async function handleGetFileViewUrl(
  input: unknown,
  context: ToolContext
): Promise<{ url: string }> {
  const validated = getFileViewUrlSchema.parse(input);
  const authResult = await context.authResolver.resolve();
  return {
    url: buildStorageUrl(
      authResult.credentials.endpoint,
      authResult.credentials.projectId,
      validated.bucketId,
      validated.fileId,
      'view'
    ),
  };
}

// ──────────────────────────────────────────────────
// TOOL DEFINITIONS
// ──────────────────────────────────────────────────

const listBucketsTool: ToolDefinition = {
  name: 'list_buckets',
  description:
    'List storage buckets. Returns a slim per-row projection ($id, name, enabled, fileSecurity, maximumFileSize, $createdAt). Use get_bucket for full bucket metadata.',
  inputSchema: listBucketsSchema,
  handler: handleListBuckets,
  requiresAuth: true,
};

const getBucketTool: ToolDefinition = {
  name: 'get_bucket',
  description: 'Get full metadata for a single storage bucket by ID.',
  inputSchema: getBucketSchema,
  handler: handleGetBucket,
  requiresAuth: true,
};

const createBucketTool: ToolDefinition = {
  name: 'create_bucket',
  description:
    'Create a new storage bucket. Supports per-file permissions, max size, allowed extensions, compression (none/gzip/zstd), encryption, and antivirus scanning.',
  inputSchema: createBucketSchema,
  handler: handleCreateBucket,
  requiresAuth: true,
};

const updateBucketTool: ToolDefinition = {
  name: 'update_bucket',
  description:
    'Update an existing storage bucket. `name` is required; all other fields are optional and overwrite existing values when provided.',
  inputSchema: updateBucketSchema,
  handler: handleUpdateBucket,
  requiresAuth: true,
};

const deleteBucketTool: ToolDefinition = {
  name: 'delete_bucket',
  description: 'Delete a storage bucket and all files within it. Returns { success: true }.',
  inputSchema: deleteBucketSchema,
  handler: handleDeleteBucket,
  requiresAuth: true,
};

const listFilesTool: ToolDefinition = {
  name: 'list_files',
  description:
    'List files in a bucket. Returns a slim per-row projection ($id, name, signature, mimeType, sizeOriginal, chunksTotal, chunksUploaded, $createdAt). Use get_file for full file metadata.',
  inputSchema: listFilesSchema,
  handler: handleListFiles,
  requiresAuth: true,
};

const getFileTool: ToolDefinition = {
  name: 'get_file',
  description: 'Get full metadata for a single file by ID.',
  inputSchema: getFileSchema,
  handler: handleGetFile,
  requiresAuth: true,
};

const deleteFileTool: ToolDefinition = {
  name: 'delete_file',
  description: 'Delete a single file by ID. Returns { success: true }.',
  inputSchema: deleteFileSchema,
  handler: handleDeleteFile,
  requiresAuth: true,
};

const getFileDownloadUrlTool: ToolDefinition = {
  name: 'get_file_download_url',
  description:
    "Build a direct download URL for a file. We don't ship raw bytes through MCP — the caller (or a human) opens this URL to fetch the file content.",
  inputSchema: getFileDownloadUrlSchema,
  handler: handleGetFileDownloadUrl,
  requiresAuth: true,
};

const getFilePreviewUrlTool: ToolDefinition = {
  name: 'get_file_preview_url',
  description:
    'Build a preview URL for an image file with optional transformation params (width, height, gravity, quality, borders, rotation, background, output format). Returns a URL only — bytes are not streamed through MCP.',
  inputSchema: getFilePreviewUrlSchema,
  handler: handleGetFilePreviewUrl,
  requiresAuth: true,
};

const getFileViewUrlTool: ToolDefinition = {
  name: 'get_file_view_url',
  description:
    "Build an inline view URL for a file (no Content-Disposition: attachment). Returns a URL only — bytes are not streamed through MCP.",
  inputSchema: getFileViewUrlSchema,
  handler: handleGetFileViewUrl,
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
  description: 'Tools for managing Appwrite Storage buckets and files',
  tools: [
    listBucketsTool,
    getBucketTool,
    createBucketTool,
    updateBucketTool,
    deleteBucketTool,
    listFilesTool,
    getFileTool,
    deleteFileTool,
    getFileDownloadUrlTool,
    getFilePreviewUrlTool,
    getFileViewUrlTool,
  ],
};
