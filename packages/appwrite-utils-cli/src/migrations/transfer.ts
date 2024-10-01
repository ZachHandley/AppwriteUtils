import { tryAwaitWithRetry } from "appwrite-utils";
import {
  Client,
  Databases,
  IndexType,
  Query,
  Storage,
  type Models,
} from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { getAppwriteClient } from "../utils/helperFunctions.js";
import { createOrUpdateAttribute } from "./attributes.js";
import { parseAttribute } from "appwrite-utils";

export interface TransferOptions {
  fromDb: Models.Database;
  targetDb: Models.Database;
  isRemote: boolean;
  collections?: string[];
  transferEndpoint?: string;
  transferProject?: string;
  transferKey?: string;
  sourceBucket?: Models.Bucket;
  targetBucket?: Models.Bucket;
}

export const transferStorageLocalToLocal = async (
  storage: Storage,
  fromBucketId: string,
  toBucketId: string
) => {
  console.log(`Transferring files from ${fromBucketId} to ${toBucketId}`);
  let lastFileId: string | undefined;
  let fromFiles = await tryAwaitWithRetry(
    async () => await storage.listFiles(fromBucketId, [Query.limit(100)])
  );
  const allFromFiles = fromFiles.files;
  let numberOfFiles = 0;

  const downloadFileWithRetry = async (bucketId: string, fileId: string) => {
    let attempts = 3;
    while (attempts > 0) {
      try {
        return await storage.getFileDownload(bucketId, fileId);
      } catch (error) {
        console.error(`Error downloading file ${fileId}: ${error}`);
        attempts--;
        if (attempts === 0) throw error;
      }
    }
  };

  if (fromFiles.files.length < 100) {
    for (const file of allFromFiles) {
      const fileData = await tryAwaitWithRetry(
        async () => await downloadFileWithRetry(file.bucketId, file.$id)
      );
      if (!fileData) {
        console.error(`Error downloading file ${file.$id}`);
        continue;
      }
      const fileToCreate = InputFile.fromBuffer(
        new Uint8Array(fileData),
        file.name
      );
      console.log(`Creating file: ${file.name}`);
      tryAwaitWithRetry(
        async () =>
          await storage.createFile(
            toBucketId,
            file.$id,
            fileToCreate,
            file.$permissions
          )
      );
      numberOfFiles++;
    }
  } else {
    lastFileId = fromFiles.files[fromFiles.files.length - 1].$id;
    while (lastFileId) {
      const files = await tryAwaitWithRetry(
        async () =>
          await storage.listFiles(fromBucketId, [
            Query.limit(100),
            Query.cursorAfter(lastFileId!),
          ])
      );
      allFromFiles.push(...files.files);
      if (files.files.length < 100) {
        lastFileId = undefined;
      } else {
        lastFileId = files.files[files.files.length - 1].$id;
      }
    }
    for (const file of allFromFiles) {
      const fileData = await tryAwaitWithRetry(
        async () => await downloadFileWithRetry(file.bucketId, file.$id)
      );
      if (!fileData) {
        console.error(`Error downloading file ${file.$id}`);
        continue;
      }
      const fileToCreate = InputFile.fromBuffer(
        new Uint8Array(fileData),
        file.name
      );
      await tryAwaitWithRetry(
        async () =>
          await storage.createFile(
            toBucketId,
            file.$id,
            fileToCreate,
            file.$permissions
          )
      );
      numberOfFiles++;
    }
  }

  console.log(
    `Transferred ${numberOfFiles} files from ${fromBucketId} to ${toBucketId}`
  );
};

export const transferStorageLocalToRemote = async (
  localStorage: Storage,
  endpoint: string,
  projectId: string,
  apiKey: string,
  fromBucketId: string,
  toBucketId: string
) => {
  console.log(
    `Transferring files from current storage ${fromBucketId} to ${endpoint} bucket ${toBucketId}`
  );
  const client = getAppwriteClient(endpoint, apiKey, projectId);
  const remoteStorage = new Storage(client);
  let numberOfFiles = 0;
  let lastFileId: string | undefined;
  let fromFiles = await tryAwaitWithRetry(
    async () => await localStorage.listFiles(fromBucketId, [Query.limit(100)])
  );
  const allFromFiles = fromFiles.files;
  if (fromFiles.files.length === 100) {
    lastFileId = fromFiles.files[fromFiles.files.length - 1].$id;
    while (lastFileId) {
      const files = await tryAwaitWithRetry(
        async () =>
          await localStorage.listFiles(fromBucketId, [
            Query.limit(100),
            Query.cursorAfter(lastFileId!),
          ])
      );
      allFromFiles.push(...files.files);
      if (files.files.length < 100) {
        break;
      }
      lastFileId = files.files[files.files.length - 1].$id;
    }
  }

  for (const file of allFromFiles) {
    const fileData = await tryAwaitWithRetry(
      async () => await localStorage.getFileDownload(file.bucketId, file.$id)
    );
    const fileToCreate = InputFile.fromBuffer(
      new Uint8Array(fileData),
      file.name
    );
    await tryAwaitWithRetry(
      async () =>
        await remoteStorage.createFile(
          toBucketId,
          file.$id,
          fileToCreate,
          file.$permissions
        )
    );
    numberOfFiles++;
  }
  console.log(
    `Transferred ${numberOfFiles} files from ${fromBucketId} to ${toBucketId}`
  );
};

/**
 * Transfers all documents from one collection to another in a different database
 * within the same Appwrite Project
 */
export const transferDocumentsBetweenDbsLocalToLocal = async (
  db: Databases,
  fromDbId: string,
  toDbId: string,
  fromCollId: string,
  toCollId: string
) => {
  let totalDocumentsTransferred = 0;
  let lastDocumentId: string | undefined;
  let hasMoreDocuments = true;

  while (hasMoreDocuments) {
    const queryParams = [Query.limit(50)];
    if (lastDocumentId) {
      queryParams.push(Query.cursorAfter(lastDocumentId));
    }

    const fromCollDocs = await tryAwaitWithRetry(async () =>
      db.listDocuments(fromDbId, fromCollId, queryParams)
    );

    if (fromCollDocs.documents.length === 0) {
      if (totalDocumentsTransferred === 0) {
        console.log(`No documents found in collection ${fromCollId}`);
      }
      break;
    }

    const allDocsToCreateCheck = await tryAwaitWithRetry(
      async () =>
        await db.listDocuments(toDbId, toCollId, [
          Query.equal(
            "$id",
            fromCollDocs.documents.map((doc) => doc.$id)
          ),
        ])
    );

    const docsToCreate = fromCollDocs.documents.filter(
      (doc) => !allDocsToCreateCheck.documents.some((d) => d.$id === doc.$id)
    );

    const batchedPromises = docsToCreate.map((doc) => {
      const toCreateObject: Partial<typeof doc> = {
        ...doc,
      };
      delete toCreateObject.$databaseId;
      delete toCreateObject.$collectionId;
      delete toCreateObject.$createdAt;
      delete toCreateObject.$updatedAt;
      delete toCreateObject.$id;
      delete toCreateObject.$permissions;
      return tryAwaitWithRetry(
        async () =>
          await db.createDocument(
            toDbId,
            toCollId,
            doc.$id,
            toCreateObject,
            doc.$permissions
          )
      );
    });

    await Promise.all(batchedPromises);
    totalDocumentsTransferred += docsToCreate.length;

    if (fromCollDocs.documents.length < 50) {
      hasMoreDocuments = false;
    } else {
      lastDocumentId =
        fromCollDocs.documents[fromCollDocs.documents.length - 1].$id;
    }
  }

  console.log(
    `Transferred ${totalDocumentsTransferred} documents from database ${fromDbId} to database ${toDbId} -- collection ${fromCollId} to collection ${toCollId}`
  );
};

export const transferDocumentsBetweenDbsLocalToRemote = async (
  localDb: Databases,
  endpoint: string,
  projectId: string,
  apiKey: string,
  fromDbId: string,
  toDbId: string,
  fromCollId: string,
  toCollId: string
) => {
  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);
  let totalDocumentsTransferred = 0;
  const remoteDb = new Databases(client);
  let fromCollDocs = await tryAwaitWithRetry(async () =>
    localDb.listDocuments(fromDbId, fromCollId, [Query.limit(50)])
  );

  if (fromCollDocs.documents.length === 0) {
    console.log(`No documents found in collection ${fromCollId}`);
    return;
  } else if (fromCollDocs.documents.length < 50) {
    const allDocsToCreateCheck = await tryAwaitWithRetry(
      async () =>
        await remoteDb.listDocuments(toDbId, toCollId, [
          Query.equal(
            "$id",
            fromCollDocs.documents.map((doc) => doc.$id)
          ),
        ])
    );
    const docsToCreate = fromCollDocs.documents.filter(
      (doc) => !allDocsToCreateCheck.documents.some((d) => d.$id === doc.$id)
    );
    const batchedPromises = docsToCreate.map((doc) => {
      const toCreateObject: Partial<typeof doc> = {
        ...doc,
      };
      delete toCreateObject.$databaseId;
      delete toCreateObject.$collectionId;
      delete toCreateObject.$createdAt;
      delete toCreateObject.$updatedAt;
      delete toCreateObject.$id;
      delete toCreateObject.$permissions;
      return tryAwaitWithRetry(async () =>
        remoteDb.createDocument(
          toDbId,
          toCollId,
          doc.$id,
          toCreateObject,
          doc.$permissions
        )
      );
    });
    await Promise.all(batchedPromises);
    totalDocumentsTransferred += fromCollDocs.documents.length;
  } else {
    const allDocsToCreateCheck = await tryAwaitWithRetry(
      async () =>
        await remoteDb.listDocuments(toDbId, toCollId, [
          Query.equal(
            "$id",
            fromCollDocs.documents.map((doc) => doc.$id)
          ),
        ])
    );
    const docsToCreate = fromCollDocs.documents.filter(
      (doc) => !allDocsToCreateCheck.documents.some((d) => d.$id === doc.$id)
    );
    const batchedPromises = docsToCreate.map((doc) => {
      const toCreateObject: Partial<typeof doc> = {
        ...doc,
      };
      delete toCreateObject.$databaseId;
      delete toCreateObject.$collectionId;
      delete toCreateObject.$createdAt;
      delete toCreateObject.$updatedAt;
      delete toCreateObject.$id;
      delete toCreateObject.$permissions;
      return tryAwaitWithRetry(async () =>
        remoteDb.createDocument(
          toDbId,
          toCollId,
          doc.$id,
          toCreateObject,
          doc.$permissions
        )
      );
    });
    await Promise.all(batchedPromises);
    totalDocumentsTransferred += fromCollDocs.documents.length;
    while (fromCollDocs.documents.length === 50) {
      fromCollDocs = await tryAwaitWithRetry(async () =>
        localDb.listDocuments(fromDbId, fromCollId, [
          Query.limit(50),
          Query.cursorAfter(
            fromCollDocs.documents[fromCollDocs.documents.length - 1].$id
          ),
        ])
      );
      const batchedPromises = fromCollDocs.documents.map((doc) => {
        const toCreateObject: Partial<typeof doc> = {
          ...doc,
        };
        delete toCreateObject.$databaseId;
        delete toCreateObject.$collectionId;
        delete toCreateObject.$createdAt;
        delete toCreateObject.$updatedAt;
        delete toCreateObject.$id;
        delete toCreateObject.$permissions;
        return tryAwaitWithRetry(async () =>
          remoteDb.createDocument(
            toDbId,
            toCollId,
            doc.$id,
            toCreateObject,
            doc.$permissions
          )
        );
      });
      await Promise.all(batchedPromises);
      totalDocumentsTransferred += fromCollDocs.documents.length;
    }
  }
  console.log(
    `Total documents transferred from database ${fromDbId} to database ${toDbId} -- collection ${fromCollId} to collection ${toCollId}: ${totalDocumentsTransferred}`
  );
};

/**
 * Transfers all collections and documents from one local database to another local database.
 *
 * @param {Databases} localDb - The local database instance.
 * @param {string} fromDbId - The ID of the source database.
 * @param {string} targetDbId - The ID of the target database.
 * @return {Promise<void>} A promise that resolves when the transfer is complete.
 */
export const transferDatabaseLocalToLocal = async (
  localDb: Databases,
  fromDbId: string,
  targetDbId: string
) => {
  let lastCollectionId: string | undefined;
  let fromCollections = await tryAwaitWithRetry(
    async () => await localDb.listCollections(fromDbId, [Query.limit(50)])
  );
  const allFromCollections = fromCollections.collections;
  if (fromCollections.collections.length < 50) {
    lastCollectionId = undefined;
  } else {
    lastCollectionId =
      fromCollections.collections[fromCollections.collections.length - 1].$id;
    while (lastCollectionId) {
      const collections = await localDb.listCollections(fromDbId, [
        Query.limit(50),
        Query.cursorAfter(lastCollectionId),
      ]);
      allFromCollections.push(...collections.collections);
      if (collections.collections.length < 50) {
        break;
      }
      lastCollectionId =
        collections.collections[collections.collections.length - 1].$id;
    }
  }
  lastCollectionId = undefined;
  let toCollections = await tryAwaitWithRetry(
    async () => await localDb.listCollections(targetDbId, [Query.limit(50)])
  );
  const allToCollections = toCollections.collections;
  if (toCollections.collections.length < 50) {
  } else {
    lastCollectionId =
      toCollections.collections[toCollections.collections.length - 1].$id;
    while (lastCollectionId) {
      const collections = await localDb.listCollections(targetDbId, [
        Query.limit(50),
        Query.cursorAfter(lastCollectionId),
      ]);
      allToCollections.push(...collections.collections);
      if (collections.collections.length < 50) {
        lastCollectionId = undefined;
      } else {
        lastCollectionId =
          collections.collections[collections.collections.length - 1].$id;
      }
    }
  }
  for (const collection of allFromCollections) {
    const toCollection = allToCollections.find((c) => c.$id === collection.$id);
    if (toCollection) {
      await transferDocumentsBetweenDbsLocalToLocal(
        localDb,
        fromDbId,
        targetDbId,
        collection.$id,
        toCollection.$id
      );
    } else {
      console.log(
        `Collection ${collection.name} not found in destination database, creating...`
      );
      const newCollection = await tryAwaitWithRetry(
        async () =>
          await localDb.createCollection(
            targetDbId,
            collection.$id,
            collection.name,
            collection.$permissions,
            collection.documentSecurity,
            collection.enabled
          )
      );
      console.log(`Collection ${newCollection.name} created`);
      for (const attribute of collection.attributes) {
        await tryAwaitWithRetry(
          async () =>
            await createOrUpdateAttribute(
              localDb,
              targetDbId,
              newCollection,
              parseAttribute(attribute as any)
            )
        );
      }
      for (const index of collection.indexes) {
        await tryAwaitWithRetry(
          async () =>
            await localDb.createIndex(
              targetDbId,
              newCollection.$id,
              index.key,
              index.type as IndexType,
              index.attributes,
              index.orders
            )
        );
      }
      await transferDocumentsBetweenDbsLocalToLocal(
        localDb,
        fromDbId,
        targetDbId,
        collection.$id,
        newCollection.$id
      );
    }
  }
};

export const transferDatabaseLocalToRemote = async (
  localDb: Databases,
  endpoint: string,
  projectId: string,
  apiKey: string,
  fromDbId: string,
  toDbId: string
) => {
  const client = getAppwriteClient(endpoint, projectId, apiKey);
  const remoteDb = new Databases(client);

  let lastCollectionId: string | undefined;
  let fromCollections = await tryAwaitWithRetry(
    async () => await localDb.listCollections(fromDbId, [Query.limit(50)])
  );
  const allFromCollections = fromCollections.collections;
  if (fromCollections.collections.length >= 50) {
    lastCollectionId =
      fromCollections.collections[fromCollections.collections.length - 1].$id;
    while (lastCollectionId) {
      const collections = await tryAwaitWithRetry(
        async () =>
          await localDb.listCollections(fromDbId, [
            Query.limit(50),
            Query.cursorAfter(lastCollectionId!),
          ])
      );
      allFromCollections.push(...collections.collections);
      if (collections.collections.length < 50) {
        break;
      }
      lastCollectionId =
        collections.collections[collections.collections.length - 1].$id;
    }
  }

  for (const collection of allFromCollections) {
    let toCollection: Models.Collection;
    const toCollectionExists = await tryAwaitWithRetry(
      async () =>
        await remoteDb.listCollections(toDbId, [
          Query.equal("$id", collection.$id),
        ])
    );

    if (toCollectionExists.collections.length > 0) {
      console.log(`Collection ${collection.name} already exists. Updating...`);
      toCollection = toCollectionExists.collections[0];
      // Update collection if needed
      if (
        toCollection.name !== collection.name ||
        toCollection.$permissions !== collection.$permissions ||
        toCollection.documentSecurity !== collection.documentSecurity ||
        toCollection.enabled !== collection.enabled
      ) {
        toCollection = await tryAwaitWithRetry(
          async () =>
            await remoteDb.updateCollection(
              toDbId,
              collection.$id,
              collection.name,
              collection.$permissions,
              collection.documentSecurity,
              collection.enabled
            )
        );
        console.log(`Collection ${toCollection.name} updated`);
      }
    } else {
      toCollection = await tryAwaitWithRetry(
        async () =>
          await remoteDb.createCollection(
            toDbId,
            collection.$id,
            collection.name,
            collection.$permissions,
            collection.documentSecurity,
            collection.enabled
          )
      );
      console.log(`Collection ${toCollection.name} created`);
    }

    // Check and update attributes
    const existingAttributes = await tryAwaitWithRetry(
      async () => await remoteDb.listAttributes(toDbId, toCollection.$id)
    );
    for (const attribute of collection.attributes) {
      const parsedAttribute = parseAttribute(attribute as any);
      const existingAttribute = existingAttributes.attributes.find(
        // @ts-expect-error
        (attr) => attr.key === parsedAttribute.key
      );
      if (!existingAttribute) {
        await tryAwaitWithRetry(
          async () =>
            await createOrUpdateAttribute(
              remoteDb,
              toDbId,
              toCollection,
              parsedAttribute
            )
        );
        console.log(`Attribute ${parsedAttribute.key} created`);
      } else {
        // Check if attribute needs updating
        // Note: Appwrite doesn't allow updating most attribute properties
        // You might need to delete and recreate the attribute if significant changes are needed
        console.log(`Attribute ${parsedAttribute.key} already exists`);
      }
    }

    // Check and update indexes
    const existingIndexes = await tryAwaitWithRetry(
      async () => await remoteDb.listIndexes(toDbId, toCollection.$id)
    );
    for (const index of collection.indexes) {
      const existingIndex = existingIndexes.indexes.find(
        (idx) => idx.key === index.key
      );
      if (!existingIndex) {
        await tryAwaitWithRetry(
          async () =>
            await remoteDb.createIndex(
              toDbId,
              toCollection.$id,
              index.key,
              index.type as IndexType,
              index.attributes,
              index.orders
            )
        );
        console.log(`Index ${index.key} created`);
      } else {
        // Check if index needs updating
        // Note: Appwrite doesn't allow updating indexes
        // You might need to delete and recreate the index if changes are needed
        console.log(`Index ${index.key} already exists`);
      }
    }

    await transferDocumentsBetweenDbsLocalToRemote(
      localDb,
      endpoint,
      projectId,
      apiKey,
      fromDbId,
      toDbId,
      collection.$id,
      toCollection.$id
    );
  }
};
