import {
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
import _ from "lodash";
import { areCollectionNamesSame } from "../utils/index.js";
import type { SetupOptions } from "../utilsController.js";
import { resolveAndUpdateRelationships } from "./relationships.js";
import { UsersController } from "./users.js";
import { logger } from "./logging.js";
import { updateOperation } from "./migrationHelper.js";
import {
  BatchSchema,
  OperationCreateSchema,
  OperationSchema,
} from "./backup.js";
import { DataLoader, type CollectionImportData } from "./dataLoader.js";

export class ImportController {
  private config: AppwriteConfig;
  private database: Databases;
  private storage: Storage;
  private appwriteFolderPath: string;
  private importDataActions: ImportDataActions;
  private setupOptions: SetupOptions;
  private documentCache: Map<string, any>;
  private batchLimit: number = 25; // Define batch size limit
  private postImportActionsQueue: {
    context: any;
    finalItem: any;
    attributeMappings: AttributeMappings;
  }[] = [];

  constructor(
    config: AppwriteConfig,
    database: Databases,
    storage: Storage,
    appwriteFolderPath: string,
    importDataActions: ImportDataActions,
    setupOptions: SetupOptions
  ) {
    this.config = config;
    this.database = database;
    this.storage = storage;
    this.appwriteFolderPath = appwriteFolderPath;
    this.importDataActions = importDataActions;
    this.setupOptions = setupOptions;
    this.documentCache = new Map();
  }

  async run() {
    const databasesToRun = this.config.databases
      .filter(
        (db) =>
          (areCollectionNamesSame(db.name, this.config!.databases[0].name) &&
            this.setupOptions.runProd) ||
          (areCollectionNamesSame(db.name, this.config!.databases[1].name) &&
            this.setupOptions.runStaging) ||
          (areCollectionNamesSame(db.name, this.config!.databases[2].name) &&
            this.setupOptions.runDev)
      )
      .map((db) => db.name);

    for (let db of this.config.databases) {
      if (
        db.name.toLowerCase().trim().replace(" ", "") === "migrations" ||
        !databasesToRun.includes(db.name)
      ) {
        continue;
      }
      if (!db.$id) {
        const databases = await this.database!.list([
          Query.equal("name", db.name),
        ]);
        if (databases.databases.length > 0) {
          db.$id = databases.databases[0].$id;
        }
      }
      console.log(`---------------------------------`);
      console.log(`Starting import data for database: ${db.name}`);
      console.log(`---------------------------------`);
      // await this.importCollections(db);
      const dataLoader = new DataLoader(
        this.appwriteFolderPath,
        this.importDataActions,
        this.database,
        this.config,
        this.setupOptions.shouldWriteFile
      );
      await dataLoader.start(db.$id);
      await this.importCollections(db, dataLoader);
      await resolveAndUpdateRelationships(db.$id, this.database, this.config);
      await this.executePostImportActions(db.$id, dataLoader);
      console.log(`---------------------------------`);
      console.log(`Finished import data for database: ${db.name}`);
      console.log(`---------------------------------`);
    }
  }

  async importCollections(db: ConfigDatabase, dataLoader: DataLoader) {
    if (!this.config.collections) {
      return;
    }
    for (const collection of this.config.collections) {
      let isUsersCollection =
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

      if (isUsersCollection) {
        const usersDataMap = dataLoader.importMap.get(
          dataLoader.getCollectionKey("users")
        );
        const usersData = usersDataMap?.data;
        const usersController = new UsersController(this.config, this.database);
        if (usersData) {
          console.log("Found users data");
          const userBatchesAll = createBatches(usersData);
          console.log(`${userBatchesAll.length} user batches`);
          for (let i = 0; i < userBatchesAll.length; i++) {
            const userBatches = userBatchesAll[i];
            console.log(
              `Processing user batch ${i + 1} of ${userBatchesAll.length}`
            );
            const userBatchPromises = userBatches
              .map((userBatch) => {
                if (userBatch.finalData && userBatch.finalData.length > 0) {
                  const userId = userBatch.finalData.userId;
                  if (dataLoader.userExistsMap.has(userId)) {
                    // We only are storing the existing user ID's as true, so we need to check for that
                    if (!(dataLoader.userExistsMap.get(userId) === true)) {
                      const userId =
                        userBatch.finalData.userId ||
                        userBatch.context.userId ||
                        userBatch.context.docId;
                      if (!userBatch.finalData.userId) {
                        userBatch.finalData.userId = userId;
                      }
                      return usersController
                        .createUserAndReturn(userBatch.finalData)
                        .then(() => console.log("Created user"))
                        .catch((error) => {
                          logger.error(
                            "Error creating user:",
                            error,
                            "\nUser data is ",
                            userBatch.finalData
                          );
                        });
                    } else {
                      console.log("Skipped existing user: ", userId);
                      return Promise.resolve();
                    }
                  }
                }
              })
              .flat();
            // Wait for all promises in the current user batch to resolve
            await Promise.allSettled(userBatchPromises);
            console.log(
              `Completed user batch ${i + 1} of ${userBatchesAll.length}`
            );
          }
          console.log("Finished importing users");
        }
      }

      if (!importOperationId) {
        // Skip further processing if no import operation is found
        continue;
      }

      const importOperation = await this.database.getDocument(
        "migrations",
        "currentOperations",
        importOperationId
      );
      await updateOperation(this.database, importOperation.$id, {
        status: "in_progress",
      });
      const collectionData = dataLoader.importMap.get(
        dataLoader.getCollectionKey(collection.name)
      );
      if (!collectionData) {
        console.log("No collection data for ", collection.name);
        continue;
      }

      const dataSplit = createBatches(collectionData.data);
      let processedItems = 0;
      for (let i = 0; i < dataSplit.length; i++) {
        const batches = dataSplit[i];
        console.log(`Processing batch ${i + 1} of ${dataSplit.length}`);
        const batchPromises = batches.map((item) => {
          const id =
            item.context.docId ||
            item.context.userId ||
            item.finalData.docId ||
            item.finalData.userId;
          if (item.finalData.hasOwnProperty("userId")) {
            delete item.finalData.userId;
          }
          if (item.finalData.hasOwnProperty("docId")) {
            delete item.finalData.docId;
          }
          if (!item.finalData) {
            return Promise.resolve();
          }
          return this.database
            .createDocument(db.$id, collection.$id, id, item.finalData)
            .then(() => {
              processedItems++;
              console.log("Created item");
            })
            .catch((error) => {
              console.error(
                `Error creating item in ${collection.name}:`,
                error,
                "\nItem data is ",
                item.finalData
              );
              throw error;
              // Optionally, log the failed item for retry or review
            });
        });
        // Wait for all promises in the current batch to resolve
        await Promise.allSettled(batchPromises);
        console.log(`Completed batch ${i + 1} of ${dataSplit.length}`);
        await updateOperation(this.database, importOperation.$id, {
          progress: processedItems,
        });
      }
      // After all batches are processed, update the operation status to completed
      await updateOperation(this.database, importOperation.$id, {
        status: "completed",
      });
    }
  }

  async executePostImportActions(dbId: string, dataLoader: DataLoader) {
    // Iterate over each collection in the importMap
    for (const [
      collectionKey,
      collectionData,
    ] of dataLoader.importMap.entries()) {
      console.log(
        `Processing post-import actions for collection: ${collectionKey}`
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
            console.error(
              `Failed to execute post-import actions for item in collection ${collectionKey}:`,
              error
            );
            // Handle error (e.g., log, retry, continue with next action)
          }
        }
      }
    }
  }

  // async executeActionsInParallel(dbId: string, collection: ConfigCollection) {
  //   const collectionExists = await checkForCollection(
  //     this.database,
  //     dbId,
  //     collection
  //   );
  //   if (!collectionExists) {
  //     logger.error(`No collection found for ${collection.name}`);
  //     return; // Skip this iteration
  //   }
  //   const operations = await getAfterImportOperations(
  //     this.database,
  //     collectionExists.$id
  //   );

  //   for (const operation of operations) {
  //     if (!operation.batches) {
  //       continue;
  //     }
  //     const batches = operation.batches;
  //     const promises = [];
  //     for (const batch of batches) {
  //       const batchId = batch;
  //       promises.push(
  //         this.database.getDocument("migrations", "batches", batchId)
  //       );
  //     }
  //     const results = await Promise.allSettled(promises);
  //     results.forEach((result) => {
  //       if (result.status === "rejected") {
  //         logger.error("A process batch promise was rejected:", result.reason);
  //       }
  //     });
  //     const resultsData = results
  //       .map((result) => (result.status === "fulfilled" ? result.value : null))
  //       .filter((result: any) => result !== null && !result.processed)
  //       .map((result) => BatchSchema.parse(result));
  //     for (const batch of resultsData) {
  //       const actionOperation = ContextObject.parse(JSON.parse(batch.data));
  //       const { context, finalItem, attributeMappings } = actionOperation;
  //       if (finalItem.$id && !context.docId) {
  //         context.docId =
  //           finalItem.$id || context.createdDoc.$id || context.$id || undefined;
  //         logger.info(
  //           `Setting docId to ${
  //             finalItem.$id
  //           } because docId not found in context, batch ${
  //             batch.$id
  //           }, context is ${JSON.stringify(context)}`
  //         );
  //       }
  //       try {
  //         await this.importDataActions.executeAfterImportActions(
  //           finalItem,
  //           attributeMappings,
  //           context
  //         );
  //         // Mark batch as processed
  //         await this.database.deleteDocument(
  //           "migrations",
  //           "batches",
  //           batch.$id
  //         );
  //       } catch (error) {
  //         logger.error(
  //           `Failed to execute batch ${batch.$id}:`,
  //           error,
  //           "Context is :",
  //           context
  //         );
  //         await this.database.deleteDocument(
  //           "migrations",
  //           "batches",
  //           batch.$id
  //         );
  //       }
  //     }

  //     // After processing all batches, update the operation status
  //     await updateOperation(this.database, operation.$id, {
  //       status: "completed", // Or determine based on batch success/failure
  //     });
  //   }
  // }
}
