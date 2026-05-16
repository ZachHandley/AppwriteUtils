import {
  Client,
  Storage,
  Compression,
  ImageGravity,
  ImageFormat,
  type Models,
} from "node-appwrite";
import pLimit from "p-limit";
import { tryAwaitWithRetry } from "../utils/helperFunctions.js";

// Concurrency limits — mirror FunctionManager (read-heavy higher, write moderate).
const storageLimit = pLimit(5);  // Moderate limit for write operations (create/update/delete)
const queryLimit = pLimit(25);   // Higher limit for read operations (list/get/download/preview/view)

/**
 * Map a string compression value (as it appears in MCP tool input or config files)
 * to the SDK's Compression enum. Returns undefined when input is undefined so the
 * SDK falls back to its default.
 */
function toCompression(value?: "none" | "gzip" | "zstd"): Compression | undefined {
  if (value === undefined) return undefined;
  switch (value) {
    case "none":
      return Compression.None;
    case "gzip":
      return Compression.Gzip;
    case "zstd":
      return Compression.Zstd;
  }
}

/**
 * Parameters for creating a new storage bucket.
 */
export interface CreateBucketParams {
  bucketId: string;
  name: string;
  permissions?: string[];
  fileSecurity?: boolean;
  enabled?: boolean;
  maximumFileSize?: number;
  allowedFileExtensions?: string[];
  compression?: "none" | "gzip" | "zstd";
  encryption?: boolean;
  antivirus?: boolean;
}

/**
 * Parameters for updating an existing storage bucket. Mirrors the SDK's
 * updateBucket signature where `name` is required and everything else is optional.
 */
export interface UpdateBucketParams {
  name: string;
  permissions?: string[];
  fileSecurity?: boolean;
  enabled?: boolean;
  maximumFileSize?: number;
  allowedFileExtensions?: string[];
  compression?: "none" | "gzip" | "zstd";
  encryption?: boolean;
  antivirus?: boolean;
}

/**
 * Parameters accepted by getFilePreview. Mirrors the SDK's preview transformation
 * options for resizing, cropping, recoloring, and reformatting image previews.
 */
export interface GetFilePreviewParams {
  width?: number;
  height?: number;
  gravity?: ImageGravity;
  quality?: number;
  borderWidth?: number;
  borderColor?: string;
  borderRadius?: number;
  opacity?: number;
  rotation?: number;
  background?: string;
  output?: ImageFormat;
}

/**
 * StorageManager — thin wrapper over the node-appwrite v23 Storage service that
 * adds per-operation concurrency limiting and retry semantics consistent with
 * FunctionManager.
 *
 * Note: `createFile` is intentionally NOT implemented here yet — multipart
 * uploads over the MCP transport are awkward to model and will be addressed in
 * a follow-up. Non-MCP callers should drop down to `new Storage(client)` for
 * uploads in the meantime.
 */
export class StorageManager {
  private client: Client;
  private storage: Storage;

  constructor(client: Client) {
    this.client = client;
    this.storage = new Storage(client);
  }

  // ────────────────────────────────────────────────────────────────────────
  // BUCKETS
  // ────────────────────────────────────────────────────────────────────────

  /**
   * List all storage buckets. Supports Appwrite Query strings and a free-text
   * search filter applied server-side.
   */
  public async listBuckets(
    queries?: string[],
    search?: string
  ): Promise<Models.BucketList> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () => {
        const params: { queries?: string[]; search?: string } = {};
        if (queries && queries.length > 0) params.queries = queries;
        if (search && search.trim().length > 0) params.search = search;
        return await this.storage.listBuckets(params);
      })
    );
  }

  /**
   * Get a single bucket by its unique ID.
   */
  public async getBucket(bucketId: string): Promise<Models.Bucket> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () => await this.storage.getBucket({ bucketId }))
    );
  }

  /**
   * Create a new storage bucket.
   */
  public async createBucket(params: CreateBucketParams): Promise<Models.Bucket> {
    return await storageLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.storage.createBucket({
          bucketId: params.bucketId,
          name: params.name,
          permissions: params.permissions,
          fileSecurity: params.fileSecurity,
          enabled: params.enabled,
          maximumFileSize: params.maximumFileSize,
          allowedFileExtensions: params.allowedFileExtensions,
          compression: toCompression(params.compression),
          encryption: params.encryption,
          antivirus: params.antivirus,
        })
      )
    );
  }

  /**
   * Update an existing storage bucket. `name` is required by the SDK; all
   * other fields are optional and will overwrite existing values when provided.
   */
  public async updateBucket(
    bucketId: string,
    params: UpdateBucketParams
  ): Promise<Models.Bucket> {
    return await storageLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.storage.updateBucket({
          bucketId,
          name: params.name,
          permissions: params.permissions,
          fileSecurity: params.fileSecurity,
          enabled: params.enabled,
          maximumFileSize: params.maximumFileSize,
          allowedFileExtensions: params.allowedFileExtensions,
          compression: toCompression(params.compression),
          encryption: params.encryption,
          antivirus: params.antivirus,
        })
      )
    );
  }

  /**
   * Delete a storage bucket and all files within it.
   */
  public async deleteBucket(bucketId: string): Promise<void> {
    await storageLimit(() =>
      tryAwaitWithRetry(async () => {
        await this.storage.deleteBucket({ bucketId });
      })
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // FILES
  // ────────────────────────────────────────────────────────────────────────

  /**
   * List files in a bucket. Supports Appwrite Query strings and a free-text
   * search filter applied server-side.
   */
  public async listFiles(
    bucketId: string,
    queries?: string[],
    search?: string
  ): Promise<Models.FileList> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () => {
        const params: { bucketId: string; queries?: string[]; search?: string } = {
          bucketId,
        };
        if (queries && queries.length > 0) params.queries = queries;
        if (search && search.trim().length > 0) params.search = search;
        return await this.storage.listFiles(params);
      })
    );
  }

  /**
   * Get a single file's metadata by ID.
   */
  public async getFile(bucketId: string, fileId: string): Promise<Models.File> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.storage.getFile({ bucketId, fileId })
      )
    );
  }

  /**
   * Delete a single file by ID.
   */
  public async deleteFile(bucketId: string, fileId: string): Promise<void> {
    await storageLimit(() =>
      tryAwaitWithRetry(async () => {
        await this.storage.deleteFile({ bucketId, fileId });
      })
    );
  }

  /**
   * Download a file's raw bytes. Returns the ArrayBuffer the SDK produces —
   * suitable for CLI / script callers. MCP callers should prefer building a
   * download URL instead of shipping raw bytes through the transport.
   */
  public async getFileDownload(
    bucketId: string,
    fileId: string
  ): Promise<ArrayBuffer> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.storage.getFileDownload({ bucketId, fileId })
      )
    );
  }

  /**
   * Get a transformed image preview for a file. Returns raw bytes — same
   * caveat as getFileDownload applies for MCP transport.
   */
  public async getFilePreview(
    bucketId: string,
    fileId: string,
    params?: GetFilePreviewParams
  ): Promise<ArrayBuffer> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.storage.getFilePreview({
          bucketId,
          fileId,
          width: params?.width,
          height: params?.height,
          gravity: params?.gravity,
          quality: params?.quality,
          borderWidth: params?.borderWidth,
          borderColor: params?.borderColor,
          borderRadius: params?.borderRadius,
          opacity: params?.opacity,
          rotation: params?.rotation,
          background: params?.background,
          output: params?.output,
        })
      )
    );
  }

  /**
   * View a file's contents inline (no Content-Disposition: attachment header
   * server-side). Returns raw bytes — same caveat as getFileDownload applies
   * for MCP transport.
   */
  public async getFileView(
    bucketId: string,
    fileId: string
  ): Promise<ArrayBuffer> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.storage.getFileView({ bucketId, fileId })
      )
    );
  }
}
