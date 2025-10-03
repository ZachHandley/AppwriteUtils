import {
  AppwriteException,
  ID,
  Query,
  type Databases,
  type Models,
  type Storage,
} from "node-appwrite";
import type {
  AppwriteConfig,
  ConfigCollection,
  ConfigDatabase,
  AttributeMappings,
} from "appwrite-utils";
import type { ImportDataActions } from "./importDataActions.js";
import { areCollectionNamesSame, tryAwaitWithRetry } from "../utils/index.js";
import type { SetupOptions } from "../utilsController.js";
import { resolveAndUpdateRelationships } from "./relationships.js";
import { UsersController } from "../users/methods.js";
import { logger } from "../shared/logging.js";
import { updateOperation } from "../shared/migrationHelpers.js";
import { LegacyAdapter } from "../adapters/LegacyAdapter.js";
import {
  BatchSchema,
  OperationCreateSchema,
  OperationSchema,
} from "../storage/schemas.js";
import { DataLoader, type CollectionImportData } from "./dataLoader.js";
import {
  transferDatabaseLocalToLocal,
  transferStorageLocalToLocal,
} from "./transfer.js";
import { MessageFormatter } from "../shared/messageFormatter.js";
import { ProgressManager } from "../shared/progressManager.js";

export class ImportController {
  private config: AppwriteConfig;
  private database: Databases;
  private storage: Storage;
  private appwriteFolderPath: string;
  private importDataActions: ImportDataActions;
  private setupOptions: SetupOptions;
  private documentCache: Map<string, any>;
  private batchLimit: number = 25; // Define batch size limit
  private hasImportedUsers = false;
  private postImportActionsQueue: {
    context: any;
    finalItem: any;
    attributeMappings: AttributeMappings;
  }[] = [];
  private databasesToRun: Models.Database[];

  constructor(
    config: AppwriteConfig,
    database: Databases,
    storage: Storage,
    appwriteFolderPath: string,
    importDataActions: ImportDataActions,
    setupOptions: SetupOptions,
    databasesToRun?: Models.Database[]
  ) {
    this.config = config;
    this.database = database;
    this.storage = storage;
    this.appwriteFolderPath = appwriteFolderPath;
    this.importDataActions = importDataActions;
    this.setupOptions = setupOptions;
    this.documentCache = new Map();
    this.databasesToRun = databasesToRun || [];
  }

  async run(specificCollections?: string[]) {
    let databasesToProcess: Models.Database[];

    if (this.databasesToRun.length > 0) {
      // Use the provided databases
      databasesToProcess = this.databasesToRun;
    } else {
      // If no databases are specified, fetch all databases
      const allDatabases = await this.database.list();
      databasesToProcess = allDatabases.databases;
    }

    let dataLoader: DataLoader | undefined;
    let databaseRan: Models.Database | undefined;

    for (let db of databasesToProcess) {
      MessageFormatter.banner(`Starting import data for database: ${db.name}`, "Database Import");

      if (!databaseRan) {
        databaseRan = db;
        dataLoader = new DataLoader(
          this.appwriteFolderPath,
          this.importDataActions,
          this.database,
          this.config,
          this.setupOptions.shouldWriteFile
        );
        await dataLoader.setupMaps(db.$id);
        await dataLoader.start(db.$id);
        await this.importCollections(db, dataLoader, specificCollections);
        await resolveAndUpdateRelationships(db.$id, this.database, this.config);
        await this.executePostImportActions(
          db.$id,
          dataLoader,
          specificCollections
        );
      } else if (databaseRan.$id !== db.$id) {
        await this.updateOthersToFinalData(databaseRan, db);
      }

      MessageFormatter.divider();
      MessageFormatter.success(`Finished import data for database: ${db.name}`, { prefix: "Import" });
      MessageFormatter.divider();
    }
  }

  async updateOthersToFinalData(
    updatedDb: Models.Database,
    targetDb: Models.Database
  ) {
    if (this.database) {
      await transferDatabaseLocalToLocal(
        this.database,
        updatedDb.$id,
        targetDb.$id
      );
    }

    if (this.storage) {
      // Find the corresponding database configs
      const updatedDbConfig = this.config.databases.find(
        (db) => db.$id === updatedDb.$id
      );
      const targetDbConfig = this.config.databases.find(
        (db) => db.$id === targetDb.$id
      );

      const allBuckets = await this.storage.listBuckets([Query.limit(1000)]);
      const bucketsWithDbIdInThem = allBuckets.buckets.filter((bucket) =>
        bucket.name.toLowerCase().includes(updatedDb.$id.toLowerCase())
      );
      const configuredUpdatedBucketId = `${
        this.config.documentBucketId
      }_${updatedDb.$id.toLowerCase().trim().replace(" ", "")}`;
      const configuredTargetBucketId = `${
        this.config.documentBucketId
      }_${targetDb.$id.toLowerCase().trim().replace(" ", "")}`;

      let sourceBucketId: string | undefined;
      let targetBucketId: string | undefined;

      if (
        bucketsWithDbIdInThem.find(
          (bucket) => bucket.$id === configuredUpdatedBucketId
        )
      ) {
        sourceBucketId = configuredUpdatedBucketId;
      } else if (
        bucketsWithDbIdInThem.find(
          (bucket) => bucket.$id === configuredTargetBucketId
        )
      ) {
        targetBucketId = configuredTargetBucketId;
      }

      if (!sourceBucketId) {
        sourceBucketId =
          updatedDbConfig?.bucket?.$id || bucketsWithDbIdInThem[0]?.$id;
      }

      if (!targetBucketId) {
        targetBucketId =
          targetDbConfig?.bucket?.$id || bucketsWithDbIdInThem[0]?.$id;
      }

      if (sourceBucketId && targetBucketId) {
        await transferStorageLocalToLocal(
          this.storage,
          sourceBucketId,
          targetBucketId
        );
      }
    }
  }

  async importCollections(
    db: ConfigDatabase,
    dataLoader: DataLoader,
    specificCollections?: string[]
  ) {
    const collectionsToImport =
      specificCollections ||
      (this.config.collections
        ? this.config.collections.map((c) => c.name)
        : []);

    for (const collection of this.config.collections || []) {
      if (collectionsToImport.includes(collection.name)) {
        let isUsersCollection =
          this.config.usersCollectionName &&
          dataLoader.getCollectionKey(this.config.usersCollectionName) ===
            dataLoader.getCollectionKey(collection.name);
        const importOperationId = dataLoader.collectionImportOperations.get(
          dataLoader.getCollectionKey(collection.name)
        );
        const createBatches = (finalData: CollectionImportData["data"]) => {
          let maxBatchLength = 50;
          const finalBatches: CollectionImportData["data"][] = [];
          for (let i = 0; i < finalData.length; i++) {
            if (i % maxBatchLength === 0) {
              finalBatches.push([]);
            }
            finalBatches[finalBatches.length - 1].push(finalData[i]);
          }
          return finalBatches;
        };

        if (isUsersCollection && !this.hasImportedUsers) {
          const usersDataMap = dataLoader.importMap.get(
            dataLoader.getCollectionKey("users")
          );
          const usersData = usersDataMap?.data;
          const usersController = new UsersController(
            this.config,
            this.database
          );
          if (usersData) {
            console.log("Found users data", usersData.length);
            const userDataBatches = createBatches(usersData);
            for (const batch of userDataBatches) {
              console.log("Importing users batch", batch.length);
              const userBatchPromises = batch
                .filter((item) => {
                  let itemId: string | undefined;
                  if (item.finalData.userId) {
                    itemId = item.finalData.userId;
                  } else if (item.finalData.docId) {
                    itemId = item.finalData.docId;
                  }
                  if (!itemId) {
                    return false;
                  }
                  return (
                    item &&
                    item.finalData &&
                    !dataLoader.userExistsMap.has(itemId)
                  );
                })
                .map((item) => {
                  dataLoader.userExistsMap.set(
                    item.finalData.userId ||
                      item.finalData.docId ||
                      item.context.userId ||
                      item.context.docId,
                    true
                  );
                  return usersController.createUserAndReturn(item.finalData);
                });
              const promiseResults = await Promise.allSettled(
                userBatchPromises
              );
              for (const item of batch) {
                if (item && item.finalData) {
                  dataLoader.userExistsMap.set(
                    item.finalData.userId ||
                      item.finalData.docId ||
                      item.context.userId ||
                      item.context.docId,
                    true
                  );
                }
              }
              MessageFormatter.success("Finished importing users batch", { prefix: "Import" });
            }
            this.hasImportedUsers = true;
            MessageFormatter.success("Finished importing users", { prefix: "Import" });
          }
        }

        if (!importOperationId) {
          // Skip further processing if no import operation is found
          continue;
        }

        let importOperation: any = null;
        importOperation = await this.database.getDocument(
          "migrations",
          "currentOperations",
          importOperationId
        );
        const adapter = new LegacyAdapter(this.database);
        await updateOperation(adapter, db.$id, importOperation.$id, {
          status: "in_progress",
        });
        
        const collectionData = dataLoader.importMap.get(
          dataLoader.getCollectionKey(collection.name)
        );
        MessageFormatter.processing(`Processing collection: ${collection.name}...`, { prefix: "Import" });
        if (!collectionData) {
          MessageFormatter.warning(`No collection data for ${collection.name}`, { prefix: "Import" });
          continue;
        }

        const dataSplit = createBatches(collectionData.data);
        let processedItems = 0;
        for (let i = 0; i < dataSplit.length; i++) {
          const batches = dataSplit[i];
          MessageFormatter.progress(`Processing batch ${i + 1} of ${dataSplit.length}`, { prefix: "Import" });

          const batchPromises = batches.map((item, index) => {
            try {
              const id =
                item.finalData.docId ||
                item.finalData.userId ||
                item.context.docId ||
                item.context.userId;

              if (item.finalData.hasOwnProperty("userId")) {
                delete item.finalData.userId;
              }
              if (item.finalData.hasOwnProperty("docId")) {
                delete item.finalData.docId;
              }
              if (!item.finalData) {
                return Promise.resolve();
              }
              return tryAwaitWithRetry(
                async () =>
                  await this.database.createDocument(
                    db.$id,
                    collection.$id!,
                    id,
                    item.finalData
                  )
              );
            } catch (error) {
              MessageFormatter.error(
                "Error creating document",
                error instanceof Error ? error : new Error(String(error)),
                { prefix: "Import" }
              );
              return Promise.resolve();
            }
          });

          // Wait for all promises in the current batch to resolve
          await Promise.all(batchPromises);
          MessageFormatter.success(`Completed batch ${i + 1} of ${dataSplit.length}`, { prefix: "Import" });
          if (importOperation) {
            const adapter = new LegacyAdapter(this.database);
            await updateOperation(adapter, db.$id, importOperation.$id, {
              progress: processedItems,
            });
          }
        }
        // After all batches are processed, update the operation status to completed
        if (importOperation) {
          const adapter = new LegacyAdapter(this.database);
          await updateOperation(adapter, db.$id, importOperation.$id, {
            status: "completed",
          });
        }
      }
    }
  }

  async executePostImportActions(
    dbId: string,
    dataLoader: DataLoader,
    specificCollections?: string[]
  ) {
    MessageFormatter.info("Executing post-import actions...", { prefix: "Import" });
    const collectionsToProcess =
      specificCollections && specificCollections.length > 0
        ? specificCollections
        : this.config.collections
        ? this.config.collections.map((c) => c.name)
        : Array.from(dataLoader.importMap.keys());
    MessageFormatter.info(`Collections to process: ${collectionsToProcess.join(", ")}`, { prefix: "Import" });
    // Iterate over each collection in the importMap
    for (const [
      collectionKey,
      collectionData,
    ] of dataLoader.importMap.entries()) {
      const allCollectionKeys = collectionsToProcess.map((c) =>
        dataLoader.getCollectionKey(c)
      );
      if (allCollectionKeys.includes(collectionKey)) {
        MessageFormatter.processing(
          `Processing post-import actions for collection: ${collectionKey}`,
          { prefix: "Import" }
        );

        // Iterate over each item in the collectionData.data
        for (const item of collectionData.data) {
          // Assuming each item has attributeMappings that contain actions to be executed
          if (item.importDef && item.importDef.attributeMappings) {
            // Use item.context as the context for action execution
            const context = item.context; // Directly use item.context as the context for action execution
            // Iterate through attributeMappings to execute actions
            try {
              // Execute post-import actions for the current attributeMapping
              // Pass item.finalData as the data to be processed along with the context
              await this.importDataActions.executeAfterImportActions(
                item.finalData,
                item.importDef.attributeMappings,
                context
              );
            } catch (error) {
              MessageFormatter.error(
                `Failed to execute post-import actions for item in collection ${collectionKey}`,
                error instanceof Error ? error : new Error(String(error)),
                { prefix: "Import" }
              );
            }
          }
        }
      } else {
        MessageFormatter.info(
          `Skipping collection: ${collectionKey} because it's not valid for post-import actions`,
          { prefix: "Import" }
        );
      }
    }
  }
}
