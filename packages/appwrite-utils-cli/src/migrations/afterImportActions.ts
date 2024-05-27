import {
  Databases,
  Storage,
  InputFile,
  Query,
  ID,
  type Models,
  Client,
} from "node-appwrite";
import path from "path";
import fs from "fs";
import os from "os";
import { logger } from "./logging.js";
import {
  tryAwaitWithRetry,
  type AfterImportActions,
  type AppwriteConfig,
} from "appwrite-utils";

export const getDatabaseFromConfig = (config: AppwriteConfig) => {
  if (!config.appwriteClient) {
    config.appwriteClient = new Client()
      .setEndpoint(config.appwriteEndpoint)
      .setProject(config.appwriteProject)
      .setKey(config.appwriteKey);
  }
  return new Databases(config.appwriteClient!);
};

export const getStorageFromConfig = (config: AppwriteConfig) => {
  if (!config.appwriteClient) {
    config.appwriteClient = new Client()
      .setEndpoint(config.appwriteEndpoint)
      .setProject(config.appwriteProject)
      .setKey(config.appwriteKey);
  }
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
      await tryAwaitWithRetry(
        async () => await db.updateDocument(dbId, collId, docId, data)
      );
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
      const doc = await tryAwaitWithRetry(
        async () => await db.getDocument(dbId, collId, docId)
      );
      if (doc[fieldName as keyof typeof doc] == oldFieldValue) {
        await tryAwaitWithRetry(
          async () =>
            await db.updateDocument(dbId, collId, docId, {
              [fieldName]: newFieldValue,
            })
        );
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
      const collectionsPulled = await tryAwaitWithRetry(
        async () =>
          await db.listCollections(dbId, [
            Query.limit(25),
            Query.equal("name", collectionIdentifier),
          ])
      );
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
        await tryAwaitWithRetry(
          async () =>
            await db.updateDocument(dbId, targetCollectionId, docId, {
              [fieldName]: valueToSet,
            })
        );
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
  /**
   * Updates a field in a document by setting it with document IDs from another collection
   * based on a matching field value.
   */
  setFieldFromOtherCollectionDocuments: async (
    config: AppwriteConfig,
    dbId: string,
    collIdOrName: string,
    docId: string,
    fieldName: string,
    otherCollIdOrName: string,
    matchingFieldName: string,
    matchingFieldValue: any,
    fieldToSet?: string
  ): Promise<void> => {
    const db = getDatabaseFromConfig(config);

    // Helper function to find a collection ID by name or return the ID if given
    const findCollectionId = async (collectionIdentifier: string) => {
      const collections = await tryAwaitWithRetry(
        async () =>
          await db.listCollections(dbId, [
            Query.equal("name", collectionIdentifier),
            Query.limit(1),
          ])
      );
      return collections.total > 0
        ? collections.collections[0].$id
        : collectionIdentifier;
    };

    // Function to check if the target field is an array
    const isTargetFieldArray = async (
      collectionId: string,
      fieldName: string
    ) => {
      const collection = await tryAwaitWithRetry(
        async () => await db.getCollection(dbId, collectionId)
      );
      const attribute = collection.attributes.find(
        (attr: any) => attr.key === fieldName
      );
      // @ts-ignore
      return attribute?.array === true;
    };

    try {
      const targetCollectionId = await findCollectionId(collIdOrName);
      const otherCollectionId = await findCollectionId(otherCollIdOrName);
      const targetFieldIsArray = await isTargetFieldArray(
        targetCollectionId,
        fieldName
      );

      // Function to recursively fetch all matching documents from the other collection
      const fetchAllMatchingDocuments = async (
        cursor?: string
      ): Promise<Models.Document[]> => {
        const docLimit = 100;
        const queries = targetFieldIsArray
          ? // @ts-ignore
            [Query.contains(matchingFieldName, [matchingFieldValue])]
          : [Query.equal(matchingFieldName, matchingFieldValue)];
        if (cursor) {
          queries.push(Query.cursorAfter(cursor));
        }
        queries.push(Query.limit(docLimit));
        const response = await tryAwaitWithRetry(
          async () => await db.listDocuments(dbId, otherCollectionId, queries)
        );
        const documents = response.documents;
        if (documents.length === 0 || documents.length < docLimit) {
          return documents;
        }
        const nextCursor = documents[documents.length - 1].$id;
        const nextBatch = await fetchAllMatchingDocuments(nextCursor);
        return documents.concat(nextBatch);
      };

      const matchingDocuments = await fetchAllMatchingDocuments();
      const documentIds = matchingDocuments.map((doc) => doc.$id);

      if (documentIds.length > 0) {
        const updatePayload = targetFieldIsArray
          ? { [fieldName]: documentIds }
          : { [fieldName]: documentIds[0] };
        await tryAwaitWithRetry(
          async () =>
            await db.updateDocument(
              dbId,
              targetCollectionId,
              docId,
              updatePayload
            )
        );

        console.log(
          `Field ${fieldName} updated successfully in document ${docId} with ${documentIds.length} document IDs.`
        );
      }
    } catch (error) {
      console.error(
        "Error setting field from other collection documents: ",
        error
      );
    }
  },
  setTargetFieldFromOtherCollectionDocumentsByMatchingField: async (
    config: AppwriteConfig,
    dbId: string,
    collIdOrName: string,
    docId: string,
    fieldName: string,
    otherCollIdOrName: string,
    matchingFieldName: string,
    matchingFieldValue: any,
    targetField: string
  ): Promise<void> => {
    const db = getDatabaseFromConfig(config);

    const findCollectionId = async (collectionIdentifier: string) => {
      const collections = await tryAwaitWithRetry(
        async () =>
          await db.listCollections(dbId, [
            Query.equal("name", collectionIdentifier),
            Query.limit(1),
          ])
      );
      return collections.total > 0
        ? collections.collections[0].$id
        : collectionIdentifier;
    };

    const isTargetFieldArray = async (
      collectionId: string,
      fieldName: string
    ) => {
      const collection = await db.getCollection(dbId, collectionId);
      const attribute = collection.attributes.find(
        (attr: any) => attr.key === fieldName
      );
      // @ts-ignore
      return attribute?.array === true;
    };

    try {
      const targetCollectionId = await findCollectionId(collIdOrName);
      const otherCollectionId = await findCollectionId(otherCollIdOrName);
      const targetFieldIsArray = await isTargetFieldArray(
        targetCollectionId,
        fieldName
      );

      const fetchAllMatchingDocuments = async (
        cursor?: string
      ): Promise<Models.Document[]> => {
        const docLimit = 100;
        const queries = [
          Query.equal(matchingFieldName, matchingFieldValue),
          Query.limit(docLimit),
        ];
        if (cursor) {
          queries.push(Query.cursorAfter(cursor));
        }
        const response = await tryAwaitWithRetry(
          async () => await db.listDocuments(dbId, otherCollectionId, queries)
        );
        const documents = response.documents;
        if (documents.length === 0 || documents.length < docLimit) {
          return documents;
        }
        const nextCursor = documents[documents.length - 1].$id;
        const nextBatch = await fetchAllMatchingDocuments(nextCursor);
        return documents.concat(nextBatch);
      };

      const matchingDocuments = await fetchAllMatchingDocuments();
      // Map the values from the targetField instead of the document IDs
      const targetFieldValues = matchingDocuments.map(
        (doc) => doc[targetField as keyof typeof doc]
      );

      if (targetFieldValues.length > 0) {
        const updatePayload = targetFieldIsArray
          ? { [fieldName]: targetFieldValues }
          : { [fieldName]: targetFieldValues[0] };
        await tryAwaitWithRetry(
          async () =>
            await db.updateDocument(
              dbId,
              targetCollectionId,
              docId,
              updatePayload
            )
        );

        console.log(
          `Field ${fieldName} updated successfully in document ${docId} with values from field ${targetField}.`
        );
      }
    } catch (error) {
      console.error(
        "Error setting field from other collection documents: ",
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
      const bucket = await tryAwaitWithRetry(
        async () => await storage.listBuckets([Query.equal("name", bucketName)])
      );
      if (bucket.buckets.length > 0) {
        return bucket.buckets[0];
      } else if (bucketId) {
        try {
          return await tryAwaitWithRetry(
            async () => await storage.getBucket(bucketId)
          );
        } catch (error) {
          return await tryAwaitWithRetry(
            async () =>
              await storage.createBucket(
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
              )
          );
        }
      } else {
        return await tryAwaitWithRetry(
          async () =>
            await storage.createBucket(
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
            )
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
      const collection = await tryAwaitWithRetry(
        async () => await db.getCollection(dbId, collId)
      );
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

      const doc = await tryAwaitWithRetry(
        async () => await db.getDocument(dbId, collId, docId)
      );
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
        const response = await tryAwaitWithRetry(
          async () => await fetch(filePath)
        );
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
        const file = await tryAwaitWithRetry(
          async () => await storage.createFile(bucketId, ID.unique(), inputFile)
        );

        console.log("Created file from URL: ", file.$id);

        // After uploading, adjust the updateData based on whether the field is an array or not
        if (isArray) {
          updateData = [...updateData, file.$id]; // Append the new file ID
        } else {
          updateData = file.$id; // Set the new file ID
        }
        await tryAwaitWithRetry(
          async () =>
            await db.updateDocument(dbId, collId, doc.$id, {
              [fieldName]: updateData,
            })
        );

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
        const file = await tryAwaitWithRetry(
          async () => await storage.createFile(bucketId, ID.unique(), inputFile)
        );

        if (isArray) {
          updateData = [...updateData, file.$id]; // Append the new file ID
        } else {
          updateData = file.$id; // Set the new file ID
        }
        tryAwaitWithRetry(
          async () =>
            await db.updateDocument(dbId, collId, doc.$id, {
              [fieldName]: updateData,
            })
        );
        console.log("Created file from path: ", file.$id);
      }
    } catch (error) {
      logger.error(
        `Error creating file and updating field, params were:\ndbId: ${dbId}, collId: ${collId}, docId: ${docId}, fieldName: ${fieldName}, filePath: ${filePath}, fileName: ${fileName}\n\nError: ${error}`
      );
      console.error("Error creating file and updating field: ", error);
      console.log(
        `Params were: dbId: ${dbId}, collId: ${collId}, docId: ${docId}, fieldName: ${fieldName}, filePath: ${filePath}, fileName: ${fileName}`
      );
    }
  },
};
