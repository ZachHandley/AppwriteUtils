import {
  Databases,
  Storage,
  InputFile,
  Query,
  ID,
  type Models,
} from "node-appwrite";
import type { AppwriteConfig } from "./schema.js";
import path from "path";
import fs from "fs";
import os from "os";

const getDatabaseFromConfig = (config: AppwriteConfig) => {
  return new Databases(config.appwriteClient!);
};

const getStorageFromConfig = (config: AppwriteConfig) => {
  return new Storage(config.appwriteClient!);
};

export interface AfterImportActions {
  [key: string]: (config: AppwriteConfig, ...args: any[]) => Promise<any>;
}

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
  setFieldFromOtherCollectionDocument: async (
    config: AppwriteConfig,
    dbId: string,
    collIdOrName: string,
    docId: string,
    fieldName: string,
    otherCollIdOrName: string,
    otherDocId: string,
    otherFieldName: string
  ) => {
    const db = getDatabaseFromConfig(config);

    // Helper function to find a collection ID by name or return the ID if given
    const findCollectionId = async (collectionIdentifier: string) => {
      const collectionsPulled = await db.listCollections(dbId, [
        Query.limit(25),
        Query.equal("name", collectionIdentifier),
      ]);
      if (collectionsPulled.total > 0) {
        return collectionsPulled.collections[0].$id;
      } else {
        // Assuming the passed identifier might directly be an ID if not found by name
        return collectionIdentifier;
      }
    };

    try {
      // Resolve the IDs for both the target and other collections
      const targetCollectionId = await findCollectionId(collIdOrName);
      const otherCollectionId = await findCollectionId(otherCollIdOrName);

      // Retrieve the "other" document
      const otherDoc = await db.getDocument(
        dbId,
        otherCollectionId,
        otherDocId
      );
      const valueToSet = otherDoc[otherFieldName as keyof typeof otherDoc];

      if (valueToSet) {
        // Update the target document
        await db.updateDocument(dbId, targetCollectionId, docId, {
          [fieldName]: valueToSet,
        });
      }

      console.log(
        `Field ${fieldName} updated successfully in document ${docId}.`
      );
    } catch (error) {
      console.error(
        "Error setting field from other collection document: ",
        error
      );
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
      const collection = await db.getCollection(dbId, collId);
      const attributes = collection.attributes as any[];
      const attribute = attributes.find((a) => a.key === fieldName);
      let isArray = false;
      if (!attribute) {
        console.log(
          `Field ${fieldName} not found in collection ${collId}, weird, skipping...`
        );
        return;
      } else if (attribute.array === true) {
        isArray = true;
      }
      if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
        // Create a temporary directory
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "appwrite-"));
        const tempFilePath = path.join(tempDir, fileName);

        // Download the file using fetch
        const response = await fetch(filePath);
        if (!response.ok)
          console.error(
            `Failed to fetch ${filePath}: ${response.statusText} for document ${docId} with field ${fieldName}`
          );

        // Use arrayBuffer if buffer is not available
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(tempFilePath, buffer);

        // Create InputFile from the downloaded file
        const inputFile = InputFile.fromPath(tempFilePath, fileName);

        // Use the full file name (with extension) for creating the file
        const file = await storage.createFile(bucketId, ID.unique(), inputFile);

        const doc = await db.getDocument(dbId, collId, docId);
        const existingFieldValue = doc[fieldName as keyof typeof doc];

        let updateData: string | string[];
        if (Array.isArray(existingFieldValue) && isArray) {
          // If the existing field value is an array, create a new array with all existing items plus the new file ID
          updateData = [...existingFieldValue, file.$id];
        } else if (existingFieldValue && !isArray) {
          // If there's an existing value but it's not an array, create a new array with the existing value and the new file ID
          updateData = file.$id;
        } else if (isArray) {
          // If the field is an array and there's no existing value, then that is the value of the array
          updateData = [file.$id];
        } else {
          // If there's no existing value, just use the new file ID
          updateData = file.$id;
        }

        await db.updateDocument(dbId, collId, docId, {
          [fieldName]: updateData,
        });

        // If the file was downloaded, delete it after uploading
        fs.unlinkSync(tempFilePath);
      } else {
        const files = fs.readdirSync(filePath);
        const fileFullName = files.find((file) => file.includes(fileName));
        if (!fileFullName) {
          console.error(
            `File starting with '${fileName}' not found in '${filePath}'`
          );
          return;
        }
        const pathToFile = path.join(filePath, fileFullName);
        const inputFile = InputFile.fromPath(pathToFile, fileName);
        const file = await storage.createFile(bucketId, ID.unique(), inputFile);

        const doc = await db.getDocument(dbId, collId, docId);
        const existingFieldValue = doc[fieldName as keyof typeof doc];

        let updateData: string | string[];
        if (Array.isArray(existingFieldValue)) {
          // If the existing field value is an array, create a new array with all existing items plus the new file ID
          updateData = [...existingFieldValue, file.$id];
        } else if (existingFieldValue) {
          // If there's an existing value but it's not an array, create a new array with the existing value and the new file ID
          updateData = [existingFieldValue, file.$id];
        } else if (isArray) {
          // If the field is an array and there's no existing value, then that is the value of the array
          updateData = [file.$id];
        } else {
          // If there's no existing value, just use the new file ID
          updateData = file.$id;
        }

        await db.updateDocument(dbId, collId, docId, {
          [fieldName]: updateData,
        });
      }
    } catch (error) {
      console.error("Error creating file and updating field: ", error);
    }
  },
};
