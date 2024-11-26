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
import {
  createOrUpdateAttribute,
  createUpdateCollectionAttributes,
} from "../collections/attributes.js";
import { parseAttribute } from "appwrite-utils";
import chalk from "chalk";
import { fetchAllCollections } from "../collections/methods.js";
import {
  createOrUpdateIndex,
  createOrUpdateIndexes,
} from "../collections/indexes.js";

export interface TransferOptions {
  fromDb: Models.Database | undefined;
  targetDb: Models.Database | undefined;
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
      try {
        await tryAwaitWithRetry(
          async () =>
            await storage.createFile(
              toBucketId,
              file.$id,
              fileToCreate,
              file.$permissions
            )
        );
      } catch (error: any) {
        // File already exists, so we can skip it
        continue;
      }
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
      try {
        await tryAwaitWithRetry(
          async () =>
            await storage.createFile(
              toBucketId,
              file.$id,
              fileToCreate,
              file.$permissions
            )
        );
      } catch (error: any) {
        // File already exists, so we can skip it
        console.log(
          chalk.yellow(`File ${file.$id} already exists, skipping...`)
        );
        continue;
      }
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
    try {
      await tryAwaitWithRetry(
        async () =>
          await remoteStorage.createFile(
            toBucketId,
            file.$id,
            fileToCreate,
            file.$permissions
          )
      );
    } catch (error: any) {
      // File already exists, so we can skip it
      console.log(chalk.yellow(`File ${file.$id} already exists, skipping...`));
      continue;
    }
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
  console.log(
    chalk.blue(`Starting database transfer from ${fromDbId} to ${targetDbId}`)
  );
  // Get all collections from source database
  const sourceCollections = await fetchAllCollections(fromDbId, localDb);
  console.log(
    chalk.blue(
      `Found ${sourceCollections.length} collections in source database`
    )
  );

  // Process each collection
  for (const collection of sourceCollections) {
    console.log(
      chalk.yellow(
        `Processing collection: ${collection.name} (${collection.$id})`
      )
    );

    try {
      // Create or update collection in target
      let targetCollection: Models.Collection;
      const existingCollection = await tryAwaitWithRetry(async () =>
        localDb.listCollections(targetDbId, [
          Query.equal("$id", collection.$id),
        ])
      );

      if (existingCollection.collections.length > 0) {
        targetCollection = existingCollection.collections[0];
        console.log(
          chalk.green(`Collection ${collection.name} exists in target database`)
        );

        // Update collection if needed
        if (
          targetCollection.name !== collection.name ||
          targetCollection.$permissions !== collection.$permissions ||
          targetCollection.documentSecurity !== collection.documentSecurity ||
          targetCollection.enabled !== collection.enabled
        ) {
          targetCollection = await tryAwaitWithRetry(async () =>
            localDb.updateCollection(
              targetDbId,
              collection.$id,
              collection.name,
              collection.$permissions,
              collection.documentSecurity,
              collection.enabled
            )
          );
          console.log(chalk.green(`Collection ${collection.name} updated`));
        }
      } else {
        console.log(
          chalk.yellow(
            `Creating collection ${collection.name} in target database...`
          )
        );
        targetCollection = await tryAwaitWithRetry(async () =>
          localDb.createCollection(
            targetDbId,
            collection.$id,
            collection.name,
            collection.$permissions,
            collection.documentSecurity,
            collection.enabled
          )
        );
      }

      // Handle attributes
      const existingAttributes = await tryAwaitWithRetry(
        async () =>
          await localDb.listAttributes(targetDbId, targetCollection.$id)
      );

      for (const attribute of collection.attributes) {
        const parsedAttribute = parseAttribute(attribute as any);
        const existingAttribute = existingAttributes.attributes.find(
          (attr: any) => attr.key === parsedAttribute.key
        );

        if (!existingAttribute) {
          await tryAwaitWithRetry(async () =>
            createOrUpdateAttribute(
              localDb,
              targetDbId,
              targetCollection,
              parsedAttribute
            )
          );
          console.log(chalk.green(`Attribute ${parsedAttribute.key} created`));
        } else {
          console.log(
            chalk.blue(
              `Attribute ${parsedAttribute.key} exists, checking for updates...`
            )
          );
          await tryAwaitWithRetry(async () =>
            createOrUpdateAttribute(
              localDb,
              targetDbId,
              targetCollection,
              parsedAttribute
            )
          );
        }
      }

      // Handle indexes
      const existingIndexes = await tryAwaitWithRetry(
        async () => await localDb.listIndexes(targetDbId, targetCollection.$id)
      );

      for (const index of collection.indexes) {
        const existingIndex = existingIndexes.indexes.find(
          (idx) => idx.key === index.key
        );

        if (!existingIndex) {
          await tryAwaitWithRetry(async () =>
            createOrUpdateIndex(
              targetDbId,
              localDb,
              targetCollection.$id,
              index as any
            )
          );
          console.log(chalk.green(`Index ${index.key} created`));
        } else {
          console.log(
            chalk.blue(`Index ${index.key} exists, checking for updates...`)
          );
          await tryAwaitWithRetry(async () =>
            createOrUpdateIndex(
              targetDbId,
              localDb,
              targetCollection.$id,
              index as any
            )
          );
        }
      }

      // Transfer documents
      await transferDocumentsBetweenDbsLocalToLocal(
        localDb,
        fromDbId,
        targetDbId,
        collection.$id,
        targetCollection.$id
      );
    } catch (error) {
      console.error(
        chalk.red(`Error processing collection ${collection.name}:`),
        error
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

  // Get all collections from source database
  const sourceCollections = await fetchAllCollections(fromDbId, localDb);
  console.log(
    chalk.blue(
      `Found ${sourceCollections.length} collections in source database`
    )
  );

  // Process each collection
  for (const collection of sourceCollections) {
    console.log(
      chalk.yellow(
        `Processing collection: ${collection.name} (${collection.$id})`
      )
    );

    try {
      // Create or update collection in target
      let targetCollection: Models.Collection;
      const existingCollection = await tryAwaitWithRetry(async () =>
        remoteDb.listCollections(toDbId, [Query.equal("$id", collection.$id)])
      );

      if (existingCollection.collections.length > 0) {
        targetCollection = existingCollection.collections[0];
        console.log(
          chalk.green(`Collection ${collection.name} exists in remote database`)
        );

        // Update collection if needed
        if (
          targetCollection.name !== collection.name ||
          targetCollection.$permissions !== collection.$permissions ||
          targetCollection.documentSecurity !== collection.documentSecurity ||
          targetCollection.enabled !== collection.enabled
        ) {
          targetCollection = await tryAwaitWithRetry(async () =>
            remoteDb.updateCollection(
              toDbId,
              collection.$id,
              collection.name,
              collection.$permissions,
              collection.documentSecurity,
              collection.enabled
            )
          );
          console.log(chalk.green(`Collection ${collection.name} updated`));
        }
      } else {
        console.log(
          chalk.yellow(
            `Creating collection ${collection.name} in remote database...`
          )
        );
        targetCollection = await tryAwaitWithRetry(async () =>
          remoteDb.createCollection(
            toDbId,
            collection.$id,
            collection.name,
            collection.$permissions,
            collection.documentSecurity,
            collection.enabled
          )
        );
      }

      // Handle attributes
      const existingAttributes = await tryAwaitWithRetry(
        async () => await remoteDb.listAttributes(toDbId, targetCollection.$id)
      );

      for (const attribute of collection.attributes) {
        const parsedAttribute = parseAttribute(attribute as any);
        const existingAttribute = existingAttributes.attributes.find(
          (attr: any) => attr.key === parsedAttribute.key
        );

        if (!existingAttribute) {
          await tryAwaitWithRetry(async () =>
            createOrUpdateAttribute(
              remoteDb,
              toDbId,
              targetCollection,
              parsedAttribute
            )
          );
          console.log(chalk.green(`Attribute ${parsedAttribute.key} created`));
        } else {
          console.log(
            chalk.blue(
              `Attribute ${parsedAttribute.key} exists, checking for updates...`
            )
          );
          await tryAwaitWithRetry(async () =>
            createOrUpdateAttribute(
              remoteDb,
              toDbId,
              targetCollection,
              parsedAttribute
            )
          );
        }
      }

      // Handle indexes
      const existingIndexes = await tryAwaitWithRetry(
        async () => await remoteDb.listIndexes(toDbId, targetCollection.$id)
      );

      for (const index of collection.indexes) {
        const existingIndex = existingIndexes.indexes.find(
          (idx) => idx.key === index.key
        );

        if (!existingIndex) {
          await createOrUpdateIndex(
            toDbId,
            remoteDb,
            targetCollection.$id,
            index as any
          );
          console.log(chalk.green(`Index ${index.key} created`));
        } else {
          console.log(
            chalk.blue(`Index ${index.key} exists, checking for updates...`)
          );
          await createOrUpdateIndex(
            toDbId,
            remoteDb,
            targetCollection.$id,
            index as any
          );
        }
      }

      // Transfer documents
      await transferDocumentsBetweenDbsLocalToRemote(
        localDb,
        endpoint,
        projectId,
        apiKey,
        fromDbId,
        toDbId,
        collection.$id,
        targetCollection.$id
      );
    } catch (error) {
      console.error(
        chalk.red(`Error processing collection ${collection.name}:`),
        error
      );
    }
  }
};
