import { z } from "zod";

/**
 * Schema for bucket backup manifest
 *
 * This manifest is stored alongside bucket backup ZIPs to describe
 * the bucket configuration and files that were backed up.
 */

export interface BucketFileMetadata {
  $id: string;
  name: string;
  size: number;
  mimeType: string;
  $permissions: string[];
  chunksCount: number;
  signature: string;
  $createdAt: string;
  $updatedAt: string;
}

export interface BucketConfiguration {
  $permissions: string[];
  fileSecurity: boolean;
  enabled: boolean;
  maximumFileSize: number;
  allowedFileExtensions: string[];
  compression: string;
  encryption: boolean;
  antivirus: boolean;
}

export interface BucketManifest {
  version: string;
  bucketId: string;
  bucketName: string;
  createdAt: string;
  fileCount: number;
  totalSizeBytes: number;
  compression: 'gzip' | 'none';
  files: BucketFileMetadata[];
  bucketConfiguration: BucketConfiguration;
}

export const BucketFileMetadataSchema = z.object({
  $id: z.string(),
  name: z.string(),
  size: z.number(),
  mimeType: z.string(),
  $permissions: z.array(z.string()),
  chunksCount: z.number(),
  signature: z.string(),
  $createdAt: z.string(),
  $updatedAt: z.string()
});

export const BucketConfigurationSchema = z.object({
  $permissions: z.array(z.string()),
  fileSecurity: z.boolean(),
  enabled: z.boolean(),
  maximumFileSize: z.number(),
  allowedFileExtensions: z.array(z.string()),
  compression: z.string(),
  encryption: z.boolean(),
  antivirus: z.boolean()
});

export const BucketManifestSchema = z.object({
  version: z.string().default("1.0"),
  bucketId: z.string(),
  bucketName: z.string(),
  createdAt: z.string(),
  fileCount: z.number(),
  totalSizeBytes: z.number(),
  compression: z.enum(['gzip', 'none']),
  files: z.array(BucketFileMetadataSchema),
  bucketConfiguration: BucketConfigurationSchema
});
