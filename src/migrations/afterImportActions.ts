import { Databases, Storage, InputFile, Query, ID } from "node-appwrite";
import type { AppwriteConfig } from "./schema";

const getDatabaseFromConfig = (config: AppwriteConfig) => {
  return new Databases(config.appwriteClient!);
};

const getStorageFromConfig = (config: AppwriteConfig) => {
  return new Storage(config.appwriteClient!);
};

export const afterImportActions = {
  updateCreatedDocument: async (
    config: AppwriteConfig,
    dbId: string,
    collId: string,
    docId: string,
    data: any
  ) => {
    try {
      const db = getDatabaseFromConfig(config);
      await db.updateDocument(dbId, collId, docId, data);
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  },
  checkAndUpdateFieldInDocument: async (
    config: AppwriteConfig,
    dbId: string,
    collId: string,
    docId: string,
    fieldName: string,
    oldFieldValue: any,
    newFieldValue: any
  ) => {
    try {
      const db = getDatabaseFromConfig(config);
      const doc = await db.getDocument(dbId, collId, docId);
      if (doc[fieldName as keyof typeof doc] == oldFieldValue) {
        await db.updateDocument(dbId, collId, docId, {
          [fieldName]: newFieldValue,
        });
      }
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  },
  createOrGetBucket: async (
    config: AppwriteConfig,
    bucketName: string,
    bucketId?: string,
    permissions?: string[],
    fileSecurity?: boolean,
    enabled?: boolean,
    maxFileSize?: number,
    allowedExtensions?: string[],
    compression?: string,
    encryption?: boolean,
    antivirus?: boolean
  ) => {
    try {
      const storage = getStorageFromConfig(config);
      const bucket = await storage.listBuckets([
        Query.equal("name", bucketName),
      ]);
      if (bucket.buckets.length > 0) {
        return bucket.buckets[0];
      } else if (bucketId) {
        try {
          return await storage.getBucket(bucketId);
        } catch (error) {
          return await storage.createBucket(
            bucketId,
            bucketName,
            permissions,
            fileSecurity,
            enabled,
            maxFileSize,
            allowedExtensions,
            compression,
            encryption,
            antivirus
          );
        }
      } else {
        return await storage.createBucket(
          bucketId || ID.unique(),
          bucketName,
          permissions,
          fileSecurity,
          enabled,
          maxFileSize,
          allowedExtensions,
          compression,
          encryption,
          antivirus
        );
      }
    } catch (error) {
      console.error("Error creating or getting bucket: ", error);
    }
  },
  createFileAndUpdateField: async (
    config: AppwriteConfig,
    dbId: string,
    collId: string,
    docId: string,
    fieldName: string,
    bucketId: string,
    filePath: string,
    fileName: string
  ) => {
    try {
      const db = getDatabaseFromConfig(config);
      const storage = getStorageFromConfig(config);
      const inputFile = InputFile.fromPath(filePath, fileName);
      const file = await storage.createFile(bucketId, ID.unique(), inputFile);
      await db.updateDocument(dbId, collId, docId, {
        [fieldName]: file.$id,
      });
    } catch (error) {
      console.error("Error creating file and updating field: ", error);
    }
  },
};
