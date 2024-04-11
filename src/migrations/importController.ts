import { ID, type Databases, type Storage } from "node-appwrite";
import type {
  AppwriteConfig,
  ConfigCollection,
  ConfigDatabase,
  ConfigDatabases,
  ImportDefs,
  ImportDef,
  AttributeMappings,
  ConfigCollections,
} from "./schema.js";
import type { ImportDataActions } from "./importDataActions.js";
import { checkForCollection } from "./collections.js";
import path from "path";
import fs from "fs";
import { convertObjectByAttributeMappings } from "./converters.js";
import _ from "lodash";
import { documentExists } from "./queue.js";

type CurrentImportDef = {
  importDefs: ImportDefs;
  context: any;
  items: any[];
  attributeMappings: AttributeMappings;
};

export class ImportController {
  private config: AppwriteConfig;
  private database: Databases;
  private storage: Storage;
  private appwriteFolderPath: string;
  private importDataActions: ImportDataActions;
  private curImportDef: CurrentImportDef | undefined;
  private afterImportActionsContexts: any[] = [];

  constructor(
    config: AppwriteConfig,
    database: Databases,
    storage: Storage,
    appwriteFolderPath: string,
    importDataActions: ImportDataActions
  ) {
    this.config = config;
    this.database = database;
    this.storage = storage;
    this.appwriteFolderPath = appwriteFolderPath;
    this.importDataActions = importDataActions;
  }

  async run() {
    if (!this.database || !this.storage || !this.config) {
      throw new Error("Database or storage not initialized");
    }
  }

  sortCollections = (configCollections: ConfigCollections) => {
    // Sort based on name for right now
    return configCollections.sort((a, b) => {
      if (a.name < b.name) {
        return -1;
      }
      if (a.name > b.name) {
        return 1;
      }
      return 0;
    });
  };

  async importCollections(db: ConfigDatabase) {
    const configCollections = this.sortCollections(this.config.collections);
    for (const collection of configCollections) {
      if (!collection.importDefs || collection.importDefs.length === 0) {
        console.warn(
          `No import definitions found for collection: ${collection.name}`
        );
        continue;
      }
      const collectionFound = await checkForCollection(
        this.database!,
        db.$id,
        collection
      );
      if (!collectionFound) {
        console.error(`Collection not found: ${collection.name}`);
        continue;
      }
      await this.importCollection(collection, db);
    }
  }

  async importCollection(collection: ConfigCollection, db: ConfigDatabase) {
    // Separate import definitions by type
    const creates = collection.importDefs.filter(
      (def) => !def.type || def.type === "create"
    );
    const updates = collection.importDefs.filter(
      (def) => def.type === "update"
    );

    // Initialize context sharing structure
    const sharedContext = {
      dbId: db.$id,
      dbName: db.name,
      collId: collection.$id,
      collName: collection.name,
      docId: "",
      createdDoc: {},
    };

    // Process creates
    for (const importDef of creates) {
      await this.runImportDef(importDef, sharedContext);
    }

    // Process updates with shared context
    for (const importDef of updates) {
      await this.runImportDef(importDef, sharedContext);
    }
  }

  async runImportDef(importDef: ImportDef, sharedContext: any) {
    const filePath = path.resolve(this.appwriteFolderPath, importDef.filePath);
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return;
    }
    const file = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(file);
    const dataToImport = importDef.basePath ? data[importDef.basePath] : data;
    if (!dataToImport) {
      console.error(`Base path not found: ${importDef.basePath}`);
      return;
    }
    if (importDef.type === "create") {
      await this.importDataForDatabase(dataToImport, sharedContext, importDef);
    } else if (importDef.type === "update") {
      await this.updateDataForDatabase(dataToImport, sharedContext, importDef);
    }
  }

  /**
   * This function creates new records from an importDef of
   * type create. It will also handle fileData attributes by
   * uploading files (scheduling) to Appwrite Storage.
   * @param data Data to import from file or placeholder
   * @param sharedContext Shared context for the import
   * @param importDef Import definition
   */
  async importDataForDatabase(
    data: any[],
    sharedContext: any,
    importDef: ImportDef
  ) {
    for (const item of data) {
      let context = { ...sharedContext, ...item };
      const convertedItem = convertObjectByAttributeMappings(
        item,
        sharedContext.attributeMappings
      );
      const finalItemDone = await this.importDataActions.runConverterFunctions(
        convertedItem,
        importDef.attributeMappings
      );
      const finalItem = _.cloneDeep(finalItemDone);
      const attributeMappings = this.getAttributeMappingsWithActions(
        importDef.attributeMappings,
        sharedContext,
        finalItem
      );

      const existenceCheck = await documentExists(
        this.database,
        sharedContext.dbId,
        sharedContext.collId,
        finalItem
      );
      if (existenceCheck) {
        console.log(`Document already exists in create, skipping...`);
        continue;
      }
      context = { ...context, ...finalItem };
      const isValid = await this.importDataActions.validateItem(
        finalItem,
        importDef.attributeMappings,
        sharedContext
      );
      if (!isValid) {
        console.log(`Document not valid: ${JSON.stringify(finalItem)}`);
        continue;
      }
      const createdDocument = await this.database.createDocument(
        context.dbId,
        context.collId,
        ID.unique(),
        finalItem
      );
      context.docId = createdDocument.$id;
      context.createdDoc = createdDocument;
      context = { ...context, ...createdDocument };
      this.afterImportActionsContexts.push(context);
    }
  }

  async updateDataForDatabase(
    data: any[],
    sharedContext: any,
    importDef: ImportDef
  ) {
    for (const item of data) {
      const context = { ...sharedContext, ...item };
    }
  }

  createImportContext(
    db: ConfigDatabase,
    collection: ConfigCollection,
    item: any
  ) {
    return {
      dbId: db.$id,
      dbName: db.name,
      collId: collection.$id,
      collName: collection.name,
      docId: "",
      createdDoc: {},
      ...item,
    };
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
        // Check if the path starts with "http" or "https" to avoid resolving it with the base path
        if (!mappingFilePath.toLowerCase().startsWith("http")) {
          console.log(
            `Resolving file path: ${mappingFilePath} mapping DOES NOT START WITH HTTP`
          );
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
        // Ensure postImportActions array exists and add the new action
        const postImportActions = mapping.postImportActions
          ? [...mapping.postImportActions, afterImportAction]
          : [afterImportAction];
        return { ...mapping, postImportActions }; // Correctly assign postImportActions
      }
      return mapping;
    });
  }
}
