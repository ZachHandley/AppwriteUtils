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
  ImportDef,
  AttributeMappings,
} from "./schema.js";
import type { ImportDataActions } from "./importDataActions.js";
import { checkForCollection } from "./collections.js";
import path from "path";
import fs from "fs";
import { convertObjectByAttributeMappings } from "./converters.js";
import _ from "lodash";
import { documentExists } from "./collections.js";
import { areCollectionNamesSame } from "../utils/index.js";
import type { SetupOptions } from "../utilsController.js";
import { resolveAndUpdateRelationships } from "./relationships.js";
import { AuthUserCreateSchema } from "../main.js";
import { UsersController } from "./users.js";

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
      await this.importCollections(db);
      await resolveAndUpdateRelationships(db.$id, this.database!, this.config!);

      console.log(`---------------------------------`);
      console.log(`Finished import data for database: ${db.name}`);
      console.log(`---------------------------------`);
    }
  }

  async importCollections(db: ConfigDatabase) {
    for (const collection of this.config.collections) {
      let isMembersCollection = false;
      if (
        this.config.usersCollectionName.toLowerCase().replace(" ", "") ===
        collection.name.toLowerCase().replace(" ", "")
      ) {
        isMembersCollection = true;
      }
      const collectionExists = await checkForCollection(
        this.database,
        db.$id,
        collection
      );
      if (!collectionExists) {
        console.warn(`No collection found for ${collection.name}`);
        continue;
      }

      const updatedCollection = { ...collection, $id: collectionExists.$id };
      await this.processImportDefinitions(
        db,
        updatedCollection,
        isMembersCollection
      );
      await this.executePostImportActions();
    }
  }

  async processImportDefinitions(
    db: ConfigDatabase,
    collection: ConfigCollection,
    isMembersCollection: boolean = false
  ) {
    this.documentCache.clear();
    const updateDefs = collection.importDefs.filter(
      (def) => def.type === "update"
    );
    const createDefs = collection.importDefs.filter(
      (def) => def.type === "create" || !def.type
    );

    // Process create import definitions first
    for (const importDef of createDefs) {
      const dataToImport = await this.loadData(importDef);
      if (!dataToImport) continue;

      console.log(
        `Processing create definitions for collection ID: ${collection.$id}`
      );
      await this.processBatch(
        db,
        collection,
        importDef,
        dataToImport,
        updateDefs,
        isMembersCollection
      );
    }

    // Process update import definitions
    for (const importDef of updateDefs) {
      const dataToImport = await this.loadData(importDef);
      if (!dataToImport) continue;

      console.log(
        `Processing update definitions for collection ID: ${collection.$id}`
      );
      await this.processBatch(db, collection, importDef, dataToImport);
    }
  }

  async loadData(importDef: ImportDef): Promise<any[]> {
    const filePath = path.resolve(this.appwriteFolderPath, importDef.filePath);
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return [];
    }

    const rawData = fs.readFileSync(filePath, "utf8");
    return importDef.basePath
      ? JSON.parse(rawData)[importDef.basePath]
      : JSON.parse(rawData);
  }

  createContext(db: ConfigDatabase, collection: ConfigCollection, item: any) {
    return {
      ...item, // Spread the item data for easy access to its properties
      dbId: db.$id,
      dbName: db.name,
      collId: collection.$id,
      collName: collection.name,
      docId: "", // Initially empty, will be filled once the document is created or identified
      createdDoc: {}, // Initially null, to be updated when the document is created
    };
  }

  async transformData(
    item: any,
    attributeMappings: AttributeMappings
  ): Promise<any> {
    const convertedItem = convertObjectByAttributeMappings(
      item,
      attributeMappings
    );
    return this.importDataActions.runConverterFunctions(
      convertedItem,
      attributeMappings
    );
  }

  async processBatch(
    db: ConfigDatabase,
    collection: ConfigCollection,
    importDef: ImportDef,
    dataToImport: any[],
    updateDefs: ImportDef[] = [],
    isMembersCollection: boolean = false
  ) {
    for (let i = 0; i < dataToImport.length; i += this.batchLimit) {
      const batch = dataToImport.slice(i, i + this.batchLimit);
      for (const item of batch) {
        let context = this.createContext(db, collection, item);
        let finalItem = await this.transformData(
          item,
          importDef.attributeMappings
        );
        let createIdToUse: string | undefined = undefined;
        let associatedDoc: Models.Document | undefined;
        if (isMembersCollection && finalItem.hasOwnProperty("email")) {
          console.log("Found members collection, creating user...");
          const usersController = new UsersController(
            this.config,
            this.database
          );
          const userToCreate = AuthUserCreateSchema.safeParse({
            ...finalItem,
          });
          if (!userToCreate.success) {
            console.error(userToCreate.error);
            continue;
          }
          const user = await usersController.createUserAndReturn(
            userToCreate.data
          );
          createIdToUse = user.$id;
          context = { ...context, ...user };
          console.log(
            "Created user, deleting keys in finalItem that exist in user..."
          );
          const associatedDocFound = await this.database.listDocuments(
            db.$id,
            collection.$id,
            [Query.equal("email", finalItem.email)]
          );
          if (associatedDocFound.documents.length > 0) {
            associatedDoc = associatedDocFound.documents[0];
          }
          // Delete keys in finalItem that also exist in user
          let deletedKeys: string[] = [];
          Object.keys(finalItem).forEach((key) => {
            if (user.hasOwnProperty(key)) {
              delete finalItem[key];
              deletedKeys.push(key);
            }
          });
          console.log(
            `Set createIdToUse to ${createIdToUse}. Deleted keys: ${deletedKeys.join(
              ", "
            )}.`
          );
        } else if (isMembersCollection) {
          console.log(
            `Skipping user creation for ${item} due to lack of email...`
          );
        }

        context = { ...context, ...finalItem };

        const attributeMappingsWithActions =
          this.getAttributeMappingsWithActions(
            importDef.attributeMappings,
            context,
            finalItem
          );

        if (
          !(await this.importDataActions.validateItem(
            finalItem,
            importDef.attributeMappings,
            context
          ))
        ) {
          console.error("Validation failed for item:", finalItem);
          continue;
        }

        let afterContext;
        if (
          (importDef.type === "create" || !importDef.type) &&
          !associatedDoc
        ) {
          const createdContext = await this.handleCreate(
            context,
            finalItem,
            updateDefs,
            createIdToUse
          );
          if (createdContext) {
            afterContext = createdContext;
          }
        } else {
          const updatedContext = await this.handleUpdate(
            context,
            finalItem,
            importDef
          );
          if (updatedContext) {
            afterContext = updatedContext;
          }
        }
        if (afterContext) {
          context = { ...context, ...afterContext };
        }
        const afterImportActionContext = structuredClone(context);
        if (attributeMappingsWithActions.some((m) => m.postImportActions)) {
          this.postImportActionsQueue.push({
            context: afterImportActionContext,
            finalItem: finalItem,
            attributeMappings: attributeMappingsWithActions,
          });
        }
      }
    }
  }

  async handleCreate(
    context: any,
    finalItem: any,
    updateDefs?: ImportDef[],
    id?: string
  ) {
    const existing = await documentExists(
      this.database,
      context.dbId,
      context.collId,
      finalItem
    );
    if (!existing) {
      if (id) {
        console.log(`Creating document with provided ID (member): ${id}`);
      }
      const createdDoc = await this.database.createDocument(
        context.dbId,
        context.collId,
        id || ID.unique(),
        finalItem
      );
      context.docId = createdDoc.$id;
      context.createdDoc = createdDoc;
      context = { ...context, ...createdDoc };

      // Populate document cache for updates
      if (updateDefs) {
        updateDefs.forEach((def) => {
          if (def.updateMapping) {
            this.documentCache.set(
              `${finalItem[def.updateMapping.targetField]}`,
              context
            );
          }
        });
      }

      console.log(`Created document ID: ${createdDoc.$id}`);
      return context;
    } else {
      console.log("Document already exists, skipping creation.");
      return;
    }
  }

  async handleUpdate(context: any, finalItem: any, importDef: ImportDef) {
    const updateMapping = importDef.updateMapping;
    if (updateMapping) {
      const keyToMatch = updateMapping.originalIdField;
      const origId = context[keyToMatch];
      const targetId = finalItem[updateMapping.targetField];
      const cachedContext = this.documentCache.get(`${origId}`);
      context = { ...context, ...cachedContext };

      if (cachedContext) {
        const updatedDoc = await this.database.updateDocument(
          context.dbId,
          context.collId,
          context.docId,
          finalItem
        );
        context = { ...context, ...updatedDoc };
        console.log(`Updated document ID: ${updatedDoc.$id}`);
        return context;
      } else {
        console.error(
          `Document to update not found in cache targeting ${keyToMatch}:${origId}`
        );
        return;
      }
    }
  }

  getAttributeMappingsWithActions(
    attributeMappings: AttributeMappings,
    context: any,
    item: any
  ) {
    return attributeMappings.map((mapping) => {
      if (mapping.fileData) {
        console.log("Adding after-import action for fileData attribute");
        let mappingFilePath = this.importDataActions.resolveTemplate(
          mapping.fileData.path,
          context,
          item
        );
        if (!mappingFilePath.toLowerCase().startsWith("http")) {
          console.log(`Resolving file path: ${mappingFilePath}`);
          mappingFilePath = path.resolve(
            this.appwriteFolderPath,
            mappingFilePath
          );
        }
        const afterImportAction = {
          action: "createFileAndUpdateField",
          params: [
            "{dbId}",
            "{collId}",
            "{docId}",
            mapping.targetKey,
            `${this.config!.documentBucketId}_${context.dbName
              .toLowerCase()
              .replace(" ", "")}`, // Assuming 'images' is your bucket ID
            mappingFilePath,
            mapping.fileData.name,
          ],
        };
        const postImportActions = mapping.postImportActions
          ? [...mapping.postImportActions, afterImportAction]
          : [afterImportAction];
        return { ...mapping, postImportActions };
      }
      return mapping;
    });
  }

  async executePostImportActions() {
    for (const action of this.postImportActionsQueue) {
      const { context, finalItem, attributeMappings } = action;
      console.log(
        `Executing post-import actions for document: ${context.docId}`
      );
      await this.importDataActions.executeAfterImportActions(
        finalItem,
        attributeMappings,
        context
      );
    }
    this.postImportActionsQueue = [];
  }
}
