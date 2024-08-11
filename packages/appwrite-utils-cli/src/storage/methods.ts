import { Compression, Storage, type Models } from "node-appwrite";
import { type AppwriteConfig } from "appwrite-utils";
import { getClientFromConfig } from "../utils/getClientFromConfig.js";
import { ulid } from "ulidx";

export const getStorage = (config: AppwriteConfig) => {
  const client = getClientFromConfig(config);
  return new Storage(client!);
};

export const listBuckets = async (
  storage: Storage,
  queries?: string[],
  search?: string
) => {
  return await storage.listBuckets(queries, search);
};

export const getBucket = async (storage: Storage, bucketId: string) => {
  return await storage.getBucket(bucketId);
};

export const createBucket = async (
  storage: Storage,
  bucket: Models.Bucket,
  bucketId?: string
) => {
  return await storage.createBucket(
    bucketId ?? ulid(),
    bucket.name,
    bucket.$permissions,
    bucket.fileSecurity,
    bucket.enabled,
    bucket.maximumFileSize,
    bucket.allowedFileExtensions,
    bucket.compression as Compression,
    bucket.encryption,
    bucket.antivirus
  );
};

export const updateBucket = async (
  storage: Storage,
  bucket: Models.Bucket,
  bucketId: string
) => {
  return await storage.updateBucket(
    bucketId,
    bucket.name,
    bucket.$permissions,
    bucket.fileSecurity,
    bucket.enabled,
    bucket.maximumFileSize,
    bucket.allowedFileExtensions,
    bucket.compression as Compression,
    bucket.encryption,
    bucket.antivirus
  );
};

export const deleteBucket = async (storage: Storage, bucketId: string) => {
  return await storage.deleteBucket(bucketId);
};

export const getFile = async (
  storage: Storage,
  bucketId: string,
  fileId: string
) => {
  return await storage.getFile(bucketId, fileId);
};

export const listFiles = async (
  storage: Storage,
  bucketId: string,
  queries?: string[],
  search?: string
) => {
  return await storage.listFiles(bucketId, queries, search);
};

export const deleteFile = async (
  storage: Storage,
  bucketId: string,
  fileId: string
) => {
  return await storage.deleteFile(bucketId, fileId);
};
