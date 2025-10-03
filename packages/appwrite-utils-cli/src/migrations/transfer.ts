import { converterFunctions, tryAwaitWithRetry } from "appwrite-utils";
import {
  Client,
  Databases,
  IndexType,
  Query,
  Storage,
  Users,
  type Models,
} from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { getAppwriteClient } from "../utils/helperFunctions.js";
import {
  createOrUpdateAttribute,
  createUpdateCollectionAttributes,
  createUpdateCollectionAttributesWithStatusCheck,
} from "../collections/attributes.js";
import { parseAttribute } from "appwrite-utils";
import chalk from "chalk";
import { fetchAllCollections } from "../collections/methods.js";
import { MessageFormatter } from "../shared/messageFormatter.js";
import { ProgressManager } from "../shared/progressManager.js";
import {
  createOrUpdateIndex,
  createOrUpdateIndexes,
  createOrUpdateIndexesWithStatusCheck,
} from "../collections/indexes.js";
import { getClient } from "../utils/getClientFromConfig.js";

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
  transferUsers?: boolean;
}

export const transferStorageLocalToLocal = async (
  storage: Storage,
  fromBucketId: string,
  toBucketId: string
) => {
  MessageFormatter.info(
    `Transferring files from ${fromBucketId} to ${toBucketId}`,
    { prefix: "Transfer" }
  );
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
        MessageFormatter.error(
          `Error downloading file ${fileId}`,
          error instanceof Error ? error : new Error(String(error)),
          { prefix: "Transfer" }
        );
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
        MessageFormatter.error(
          `Error downloading file ${file.$id}`,
          undefined,
          { prefix: "Transfer" }
        );
        continue;
      }
      const fileToCreate = InputFile.fromBuffer(
        new Uint8Array(fileData),
        file.name
      );
      MessageFormatter.progress(`Creating file: ${file.name}`, {
        prefix: "Transfer",
      });
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
        MessageFormatter.error(
          `Error downloading file ${file.$id}`,
          undefined,
          { prefix: "Transfer" }
        );
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
        MessageFormatter.warning(
          `File ${file.$id} already exists, skipping...`,
          { prefix: "Transfer" }
        );
        continue;
      }
      numberOfFiles++;
    }
  }

  MessageFormatter.success(
    `Transferred ${numberOfFiles} files from ${fromBucketId} to ${toBucketId}`,
    { prefix: "Transfer" }
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
  MessageFormatter.info(
    `Transferring files from current storage ${fromBucketId} to ${endpoint} bucket ${toBucketId}`,
    { prefix: "Transfer" }
  );
  const client = getAppwriteClient(endpoint, projectId, apiKey);
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
      MessageFormatter.warning(`File ${file.$id} already exists, skipping...`, {
        prefix: "Transfer",
      });
      continue;
    }
    numberOfFiles++;
  }
  MessageFormatter.success(
    `Transferred ${numberOfFiles} files from ${fromBucketId} to ${toBucketId}`,
    { prefix: "Transfer" }
  );
};

// Document transfer functions moved to collections/methods.ts with enhanced UX

// Remote document transfer functions moved to collections/methods.ts with enhanced UX

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
  MessageFormatter.info(
    `Starting database transfer from ${fromDbId} to ${targetDbId}`,
    { prefix: "Transfer" }
  );
  // Get all collections from source database
  const sourceCollections = await fetchAllCollections(fromDbId, localDb);
  MessageFormatter.info(
    `Found ${sourceCollections.length} collections in source database`,
    { prefix: "Transfer" }
  );

  // Process each collection
  for (const collection of sourceCollections) {
    MessageFormatter.processing(
      `Processing collection: ${collection.name} (${collection.$id})`,
      { prefix: "Transfer" }
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
        MessageFormatter.info(
          `Collection ${collection.name} exists in target database`,
          { prefix: "Transfer" }
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
          MessageFormatter.success(
            `Collection ${collection.name} updated`,
            { prefix: "Transfer" }
          );
        }
      } else {
        MessageFormatter.progress(
          `Creating collection ${collection.name} in target database...`,
          { prefix: "Transfer" }
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

      // Handle attributes with enhanced status checking
      MessageFormatter.info(
        `Creating attributes for collection ${collection.name} with enhanced monitoring...`,
        { prefix: "Transfer" }
      );

      const allAttributes = collection.attributes.map((attr) =>
        parseAttribute(attr as any)
      );
      const attributeSuccess =
        await createUpdateCollectionAttributesWithStatusCheck(
          localDb,
          targetDbId,
          targetCollection,
          allAttributes
        );

      if (!attributeSuccess) {
        MessageFormatter.error(
          `Failed to create all attributes for collection ${collection.name}, skipping to next collection`,
          undefined,
          { prefix: "Transfer" }
        );
        continue;
      }

      MessageFormatter.success(
        `All attributes created successfully for collection ${collection.name}`,
        { prefix: "Transfer" }
      );

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
          MessageFormatter.success(
            `Index ${index.key} created`,
            { prefix: "Transfer" }
          );
        } else {
          MessageFormatter.info(
            `Index ${index.key} exists, checking for updates...`,
            { prefix: "Transfer" }
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
      const { transferDocumentsBetweenDbsLocalToLocal } = await import(
        "../collections/methods.js"
      );
      await transferDocumentsBetweenDbsLocalToLocal(
        localDb,
        fromDbId,
        targetDbId,
        collection.$id,
        targetCollection.$id
      );
    } catch (error) {
      MessageFormatter.error(
        `Error processing collection ${collection.name}`,
        error instanceof Error ? error : new Error(String(error)),
        { prefix: "Transfer" }
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
  MessageFormatter.info(
    `Found ${sourceCollections.length} collections in source database`,
    { prefix: "Transfer" }
  );

  // Process each collection
  for (const collection of sourceCollections) {
    MessageFormatter.processing(
      `Processing collection: ${collection.name} (${collection.$id})`,
      { prefix: "Transfer" }
    );

    try {
      // Create or update collection in target
      let targetCollection: Models.Collection;
      const existingCollection = await tryAwaitWithRetry(async () =>
        remoteDb.listCollections(toDbId, [Query.equal("$id", collection.$id)])
      );

      if (existingCollection.collections.length > 0) {
        targetCollection = existingCollection.collections[0];
        MessageFormatter.info(
          `Collection ${collection.name} exists in remote database`,
          { prefix: "Transfer" }
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
          MessageFormatter.success(
            `Collection ${collection.name} updated`,
            { prefix: "Transfer" }
          );
        }
      } else {
        MessageFormatter.progress(
          `Creating collection ${collection.name} in remote database...`,
          { prefix: "Transfer" }
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

      // Handle attributes with enhanced status checking
      MessageFormatter.info(
        `Creating attributes for collection ${collection.name} with enhanced monitoring...`,
        { prefix: "Transfer" }
      );

      const attributesToCreate = collection.attributes.map((attr) =>
        parseAttribute(attr as any)
      );

      const attributesSuccess =
        await createUpdateCollectionAttributesWithStatusCheck(
          remoteDb,
          toDbId,
          targetCollection,
          attributesToCreate
        );

      if (!attributesSuccess) {
        MessageFormatter.warning(
          `Failed to create some attributes for collection ${collection.name}`,
          { prefix: "Transfer" }
        );
        // Continue with the transfer even if some attributes failed
      } else {
        MessageFormatter.success(
          `All attributes created successfully for collection ${collection.name}`,
          { prefix: "Transfer" }
        );
      }

      // Handle indexes with enhanced status checking
      MessageFormatter.info(
        `Creating indexes for collection ${collection.name} with enhanced monitoring...`,
        { prefix: "Transfer" }
      );

      const indexesSuccess = await createOrUpdateIndexesWithStatusCheck(
        toDbId,
        remoteDb,
        targetCollection.$id,
        targetCollection,
        collection.indexes as any
      );

      if (!indexesSuccess) {
        MessageFormatter.warning(
          `Failed to create some indexes for collection ${collection.name}`,
          { prefix: "Transfer" }
        );
        // Continue with the transfer even if some indexes failed
      } else {
        MessageFormatter.success(
          `All indexes created successfully for collection ${collection.name}`,
          { prefix: "Transfer" }
        );
      }

      // Transfer documents
      const { transferDocumentsBetweenDbsLocalToRemote } = await import(
        "../collections/methods.js"
      );
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
      MessageFormatter.error(
        `Error processing collection ${collection.name}`,
        error instanceof Error ? error : new Error(String(error)),
        { prefix: "Transfer" }
      );
    }
  }
};

export const transferUsersLocalToRemote = async (
  localUsers: Users,
  endpoint: string,
  projectId: string,
  apiKey: string
) => {
  MessageFormatter.info(
    "Starting user transfer to remote instance...",
    { prefix: "Transfer" }
  );

  const client = getClient(endpoint, projectId, apiKey);
  const remoteUsers = new Users(client);

  let totalTransferred = 0;
  let lastId: string | undefined;

  while (true) {
    const queries = [Query.limit(100)];
    if (lastId) {
      queries.push(Query.cursorAfter(lastId));
    }

    const usersList = await tryAwaitWithRetry(async () =>
      localUsers.list(queries)
    );

    if (usersList.users.length === 0) {
      break;
    }

    for (const user of usersList.users) {
      try {
        // Check if user already exists in remote
        let remoteUser: Models.User<Models.Preferences> | undefined;
        try {
          remoteUser = await tryAwaitWithRetry(async () =>
            remoteUsers.get(user.$id)
          );
          
          // If user exists, update only the differences
          if (remoteUser) {
            MessageFormatter.info(
              `User ${user.$id} exists, checking for updates...`,
              { prefix: "Transfer" }
            );
            let hasUpdates = false;

            // Update name if different
            if (remoteUser.name !== user.name) {
              await tryAwaitWithRetry(async () =>
                remoteUsers.updateName(user.$id, user.name)
              );
              MessageFormatter.success(
                `Updated name for user ${user.$id}`,
                { prefix: "Transfer" }
              );
              hasUpdates = true;
            }

            // Update email if different
            if (remoteUser.email !== user.email) {
              await tryAwaitWithRetry(async () =>
                remoteUsers.updateEmail(user.$id, user.email)
              );
              MessageFormatter.success(
                `Updated email for user ${user.$id}`,
                { prefix: "Transfer" }
              );
              hasUpdates = true;
            }

            // Update phone if different
            const normalizedLocalPhone = user.phone 
              ? converterFunctions.convertPhoneStringToUSInternational(user.phone)
              : undefined;
            if (remoteUser.phone !== normalizedLocalPhone) {
              if (normalizedLocalPhone) {
                await tryAwaitWithRetry(async () =>
                  remoteUsers.updatePhone(user.$id, normalizedLocalPhone)
                );
              }
              MessageFormatter.success(
                `Updated phone for user ${user.$id}`,
                { prefix: "Transfer" }
              );
              hasUpdates = true;
            }

            // Update preferences if different
            if (JSON.stringify(remoteUser.prefs) !== JSON.stringify(user.prefs)) {
              await tryAwaitWithRetry(async () =>
                remoteUsers.updatePrefs(user.$id, user.prefs)
              );
              MessageFormatter.success(
                `Updated preferences for user ${user.$id}`,
                { prefix: "Transfer" }
              );
              hasUpdates = true;
            }

            // Update labels if different
            if (JSON.stringify(remoteUser.labels) !== JSON.stringify(user.labels)) {
              await tryAwaitWithRetry(async () =>
                remoteUsers.updateLabels(user.$id, user.labels)
              );
              MessageFormatter.success(
                `Updated labels for user ${user.$id}`,
                { prefix: "Transfer" }
              );
              hasUpdates = true;
            }

            // Update email verification if different
            if (remoteUser.emailVerification !== user.emailVerification) {
              await tryAwaitWithRetry(async () =>
                remoteUsers.updateEmailVerification(user.$id, user.emailVerification)
              );
              MessageFormatter.success(
                `Updated email verification for user ${user.$id}`,
                { prefix: "Transfer" }
              );
              hasUpdates = true;
            }

            // Update phone verification if different
            if (remoteUser.phoneVerification !== user.phoneVerification) {
              await tryAwaitWithRetry(async () =>
                remoteUsers.updatePhoneVerification(user.$id, user.phoneVerification)
              );
              MessageFormatter.success(
                `Updated phone verification for user ${user.$id}`,
                { prefix: "Transfer" }
              );
              hasUpdates = true;
            }

            // Update status if different
            if (remoteUser.status !== user.status) {
              await tryAwaitWithRetry(async () =>
                remoteUsers.updateStatus(user.$id, user.status)
              );
              MessageFormatter.success(
                `Updated status for user ${user.$id}`,
                { prefix: "Transfer" }
              );
              hasUpdates = true;
            }

            if (!hasUpdates) {
              MessageFormatter.info(
                `User ${user.$id} is already up to date, skipping...`,
                { prefix: "Transfer" }
              );
            } else {
              totalTransferred++;
              MessageFormatter.success(
                `Updated user ${user.$id}`,
                { prefix: "Transfer" }
              );
            }
            continue;
          }
        } catch (error: any) {
          // User doesn't exist, proceed with creation
        }

        const phone = user.phone
          ? converterFunctions.convertPhoneStringToUSInternational(user.phone)
          : undefined;

        // Handle user creation based on hash type
        if (user.hash && user.password) {
          // User has a hashed password - recreate with proper hash method
          const hashType = user.hash.toLowerCase();
          const hashedPassword = user.password; // This is already hashed
          const hashOptions = (user.hashOptions as Record<string, any>) || {};

          try {
            switch (hashType) {
              case "argon2":
                await tryAwaitWithRetry(async () =>
                  remoteUsers.createArgon2User(
                    user.$id,
                    user.email,
                    hashedPassword,
                    user.name
                  )
                );
                break;

              case "bcrypt":
                await tryAwaitWithRetry(async () =>
                  remoteUsers.createBcryptUser(
                    user.$id,
                    user.email,
                    hashedPassword,
                    user.name
                  )
                );
                break;

              case "scrypt":
                // Scrypt requires additional parameters from hashOptions
                const salt =
                  typeof hashOptions.salt === "string" ? hashOptions.salt : "";
                const costCpu =
                  typeof hashOptions.costCpu === "number"
                    ? hashOptions.costCpu
                    : 32768;
                const costMemory =
                  typeof hashOptions.costMemory === "number"
                    ? hashOptions.costMemory
                    : 14;
                const costParallel =
                  typeof hashOptions.costParallel === "number"
                    ? hashOptions.costParallel
                    : 1;
                const length =
                  typeof hashOptions.length === "number"
                    ? hashOptions.length
                    : 64;

                // Warn if using default values due to missing hash options
                if (
                  !hashOptions.salt ||
                  typeof hashOptions.costCpu !== "number"
                ) {
                  MessageFormatter.warning(
                    `User ${user.$id}: Using default Scrypt parameters due to missing hashOptions`,
                    { prefix: "Transfer" }
                  );
                }

                await tryAwaitWithRetry(async () =>
                  remoteUsers.createScryptUser(
                    user.$id,
                    user.email,
                    hashedPassword,
                    salt,
                    costCpu,
                    costMemory,
                    costParallel,
                    length,
                    user.name
                  )
                );
                break;

              case "scryptmodified":
                // Scrypt Modified (Firebase) requires salt, separator, and signer key
                const modSalt =
                  typeof hashOptions.salt === "string" ? hashOptions.salt : "";
                const saltSeparator =
                  typeof hashOptions.saltSeparator === "string"
                    ? hashOptions.saltSeparator
                    : "";
                const signerKey =
                  typeof hashOptions.signerKey === "string"
                    ? hashOptions.signerKey
                    : "";

                // Warn if critical parameters are missing
                if (
                  !hashOptions.salt ||
                  !hashOptions.saltSeparator ||
                  !hashOptions.signerKey
                ) {
                  MessageFormatter.warning(
                    `User ${user.$id}: Missing critical Scrypt Modified parameters in hashOptions`,
                    { prefix: "Transfer" }
                  );
                }

                await tryAwaitWithRetry(async () =>
                  remoteUsers.createScryptModifiedUser(
                    user.$id,
                    user.email,
                    hashedPassword,
                    modSalt,
                    saltSeparator,
                    signerKey,
                    user.name
                  )
                );
                break;

              case "md5":
                await tryAwaitWithRetry(async () =>
                  remoteUsers.createMD5User(
                    user.$id,
                    user.email,
                    hashedPassword,
                    user.name
                  )
                );
                break;

              case "sha":
              case "sha1":
              case "sha256":
              case "sha512":
                // SHA variants - determine version from hash type
                const getPasswordHashVersion = (hash: string) => {
                  switch (hash.toLowerCase()) {
                    case "sha1":
                      return "sha1" as any;
                    case "sha256":
                      return "sha256" as any;
                    case "sha512":
                      return "sha512" as any;
                    default:
                      return "sha256" as any; // Default to SHA256
                  }
                };

                await tryAwaitWithRetry(async () =>
                  remoteUsers.createSHAUser(
                    user.$id,
                    user.email,
                    hashedPassword,
                    getPasswordHashVersion(hashType),
                    user.name
                  )
                );
                break;

              case "phpass":
                await tryAwaitWithRetry(async () =>
                  remoteUsers.createPHPassUser(
                    user.$id,
                    user.email,
                    hashedPassword,
                    user.name
                  )
                );
                break;

              default:
                MessageFormatter.warning(
                  `Unknown hash type '${hashType}' for user ${user.$id}, falling back to Argon2`,
                  { prefix: "Transfer" }
                );
                await tryAwaitWithRetry(async () =>
                  remoteUsers.createArgon2User(
                    user.$id,
                    user.email,
                    hashedPassword,
                    user.name
                  )
                );
                break;
            }

            MessageFormatter.success(
              `User ${user.$id} created with preserved ${hashType} password`,
              { prefix: "Transfer" }
            );
          } catch (error) {
            MessageFormatter.warning(
              `Failed to create user ${user.$id} with ${hashType} hash, trying with temporary password`,
              { prefix: "Transfer" }
            );

            // Fallback to creating user with temporary password
            await tryAwaitWithRetry(async () =>
              remoteUsers.create(
                user.$id,
                user.email,
                phone,
                `changeMe${user.email}`,
                user.name
              )
            );

            MessageFormatter.warning(
              `User ${user.$id} created with temporary password - password reset required`,
              { prefix: "Transfer" }
            );
          }
        } else {
          // No hash or password - create with temporary password
          const tempPassword = user.password || `changeMe${user.email}`;

          await tryAwaitWithRetry(async () =>
            remoteUsers.create(
              user.$id,
              user.email,
              phone,
              tempPassword,
              user.name
            )
          );

          if (!user.password) {
            MessageFormatter.warning(
              `User ${user.$id} created with temporary password - password reset required`,
              { prefix: "Transfer" }
            );
          }
        }

        // Update phone, labels, and other attributes for newly created users
        if (phone) {
          await tryAwaitWithRetry(async () =>
            remoteUsers.updatePhone(user.$id, phone)
          );
        }

        if (user.labels && user.labels.length > 0) {
          await tryAwaitWithRetry(async () =>
            remoteUsers.updateLabels(user.$id, user.labels)
          );
        }

        // Update user preferences and status for newly created users
        await tryAwaitWithRetry(async () =>
          remoteUsers.updatePrefs(user.$id, user.prefs)
        );

        if (user.emailVerification) {
          await tryAwaitWithRetry(async () =>
            remoteUsers.updateEmailVerification(user.$id, true)
          );
        } else {
          await tryAwaitWithRetry(async () =>
            remoteUsers.updateEmailVerification(user.$id, false)
          );
        }

        if (user.phoneVerification) {
          await tryAwaitWithRetry(async () =>
            remoteUsers.updatePhoneVerification(user.$id, true)
          );
        }

        if (user.status === false) {
          await tryAwaitWithRetry(async () =>
            remoteUsers.updateStatus(user.$id, false)
          );
        }

        totalTransferred++;
        MessageFormatter.success(
          `Transferred user ${user.$id}`,
          { prefix: "Transfer" }
        );
      } catch (error) {
        MessageFormatter.error(
          `Failed to transfer user ${user.$id}`,
          error instanceof Error ? error : new Error(String(error)),
          { prefix: "Transfer" }
        );
      }
    }

    if (usersList.users.length < 100) {
      break;
    }
    lastId = usersList.users[usersList.users.length - 1].$id;
  }

  MessageFormatter.success(
    `Successfully transferred ${totalTransferred} users`,
    { prefix: "Transfer" }
  );
};
