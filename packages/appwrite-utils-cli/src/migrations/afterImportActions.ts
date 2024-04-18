import {
  Databases,
  Storage,
  InputFile,
  Query,
  ID,
  type Models,
  Client,
} from "node-appwrite";
import type { AppwriteConfig } from "./schema.js";
import path from "path";
import fs from "fs";
import os from "os";

const getDatabaseFromConfig = (config: AppwriteConfig) => {
  if (!config.appwriteClient) {
    config.appwriteClient = new Client()
      .setEndpoint(config.appwriteEndpoint)
      .setProject(config.appwriteProject)
      .setKey(config.appwriteKey);
  }
  return new Databases(config.appwriteClient!);
};

const getStorageFromConfig = (config: AppwriteConfig) => {
  if (!config.appwriteClient) {
    config.appwriteClient = new Client()
      .setEndpoint(config.appwriteEndpoint)
      .setProject(config.appwriteProject)
      .setKey(config.appwriteKey);
  }
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
      // console.log(
      //   `Processing field ${fieldName} in collection ${collId} for document ${docId} in database ${dbId} in bucket ${bucketId} with path ${filePath} and name ${fileName}...`
      // );
      let isArray = false;
      if (!attribute) {
        console.log(
          `Field ${fieldName} not found in collection ${collId}, weird, skipping...`
        );
        return;
      } else if (attribute.array === true) {
        isArray = true;
      }

      // Define a helper function to check if a value is a URL
      const isUrl = (value: any) =>
        typeof value === "string" &&
        (value.startsWith("http://") || value.startsWith("https://"));

      const doc = await db.getDocument(dbId, collId, docId);
      const existingFieldValue = doc[fieldName as keyof typeof doc];

      // Handle the case where the field is an array
      let updateData: string | string[] = isArray ? [] : "";
      if (isArray && Array.isArray(existingFieldValue)) {
        updateData = existingFieldValue.filter((val) => !isUrl(val)); // Remove URLs from the array
      }

      // Process file upload and update logic
      if (isUrl(filePath)) {
        // Create a temporary directory
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "appwrite_tmp"));
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

        console.log("Created file from URL: ", file.$id);

        // After uploading, adjust the updateData based on whether the field is an array or not
        if (isArray) {
          updateData = [...updateData, file.$id]; // Append the new file ID
        } else {
          updateData = file.$id; // Set the new file ID
        }
        // console.log(
        //   "Updating document with file: ",
        //   doc.$id,
        //   `${fieldName}: `,
        //   updateData
        // );

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

        if (isArray) {
          updateData = [...updateData, file.$id]; // Append the new file ID
        } else {
          updateData = file.$id; // Set the new file ID
        }
        await db.updateDocument(dbId, collId, doc.$id, {
          [fieldName]: updateData,
        });
        console.log("Created file from path: ", file.$id);
      }
    } catch (error) {
      console.error("Error creating file and updating field: ", error);
      console.log(
        `Params were: dbId: ${dbId}, collId: ${collId}, docId: ${docId}, fieldName: ${fieldName}, filePath: ${filePath}, fileName: ${fileName}`
      );
    }
  },
};
