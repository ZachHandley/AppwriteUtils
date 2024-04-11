import {
  Client,
  Databases,
  ID,
  Query,
  Storage,
  type Models,
} from "node-appwrite";
import { startSetup } from "./migrations/setupDatabase.js";
import {
  type AppwriteConfig,
  AppwriteConfigSchema,
  type CollectionCreate,
} from "./migrations/schema.js";
import path from "path";
import fs from "fs";
import { load } from "js-yaml";
import { ImportDataActions } from "./migrations/importDataActions.js";
import {
  converterFunctions,
  convertObjectByAttributeMappings,
  type ConverterFunctions,
} from "./migrations/converters.js";
import {
  areCollectionNamesSame,
  readFileSync,
} from "./utils/helperFunctions.js";
import { checkForCollection } from "./migrations/collections.js";
import { resolveAndUpdateRelationships } from "./migrations/relationships.js";
import { documentExists } from "./migrations/queue.js";
import {
  afterImportActions,
  type AfterImportActions,
} from "./migrations/afterImportActions.js";
import validationRules, {
  type ValidationRules,
} from "./migrations/validationRules.js";
import _ from "lodash";

async function loadConfig(configPath: string) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found at ${configPath}`);
  }
  const configModule = await load(readFileSync(configPath), {
    json: true,
  });
  return AppwriteConfigSchema.parse(configModule);
}

export interface SetupOptions {
  runProd: boolean;
  runStaging: boolean;
  runDev: boolean;
  doBackup: boolean;
  wipeDatabases: boolean;
  wipeDocumentStorage: boolean;
  generateSchemas: boolean;
  generateMockData: boolean;
  importData: boolean;
  checkDuplicates: boolean;
}

type CollectionConfig = AppwriteConfig["collections"];
type ImportDef = CollectionConfig[number]["importDefs"][number];
type AttributeMappings = ImportDef["attributeMappings"];
type AfterImportAction = AttributeMappings[number]["postImportActions"][number];
type ValidityRule = AttributeMappings[number]["validationActions"][number];

export class UtilsController {
  private appwriteFolderPath: string;
  private appwriteConfigPath: string;
  private config?: AppwriteConfig;
  private appwriteServer?: Client;
  private database?: Databases;
  private storage?: Storage;
  public converterDefinitions: ConverterFunctions = converterFunctions;
  public validityRuleDefinitions: ValidationRules = validationRules;
  public afterImportActionsDefinitions: AfterImportActions = afterImportActions;

  constructor() {
    const basePath = process.cwd(); // Gets the current working directory
    const appwriteFolderPath = path.join(basePath, "src", "appwrite");
    const appwriteConfigPath = path.join(
      appwriteFolderPath,
      "appwriteConfig.yaml"
    );
    this.appwriteFolderPath = appwriteFolderPath;
    this.appwriteConfigPath = appwriteConfigPath;
  }

  async loadCustomDefinitions(): Promise<void> {
    try {
      const customDefinitionsPath = path.join(
        this.appwriteFolderPath,
        "customDefinitions.ts"
      );
      if (fs.existsSync(customDefinitionsPath)) {
        // Dynamically import custom definitions
        const customDefinitions = (await import(
          customDefinitionsPath
        )) as typeof import("customDefinitions");
        this.converterDefinitions = {
          ...this.converterDefinitions,
          ...customDefinitions.converterDefinitions,
        };
        this.validityRuleDefinitions = {
          ...this.validityRuleDefinitions,
          ...customDefinitions.validityRuleDefinitions,
        };
        this.afterImportActionsDefinitions = {
          ...this.afterImportActionsDefinitions,
          ...customDefinitions.afterImportActionsDefinitions,
        };
      }
    } catch (error) {
      console.error("Failed to load custom definitions:", error);
    }
  }

  async init() {
    if (!this.config) {
      console.log("Initializing appwrite client & loading config...");
      this.config = await loadConfig(this.appwriteConfigPath);
      this.appwriteServer = new Client()
        .setEndpoint(this.config.appwriteEndpoint)
        .setProject(this.config.appwriteProject)
        .setKey(this.config.appwriteKey);
      this.database = new Databases(this.appwriteServer);
      this.storage = new Storage(this.appwriteServer);
      this.config.appwriteClient = this.appwriteServer;
      // await this.loadCustomDefinitions();
    }
  }

  async run(options: SetupOptions) {
    await this.init(); // Ensure initialization is done
    if (!this.database || !this.storage || !this.config) {
      throw new Error("Database or storage not initialized");
    }

    // Start the setup
    console.log(
      "Starting setup, this step sets up migrations, runs backup, wipes databases, and updates schemas..."
    );
    await startSetup(
      this.database,
      this.storage,
      this.config,
      options,
      this.appwriteFolderPath
    );
    console.log("Setup complete.");

    if (options.generateMockData) {
      // TODO: Figure out how to do this dynamically
      // await this.generateMockData();
    }

    console.log("Starting import data...");
    if (options.importData) {
      await this.importData(options);
    }
    console.log("Import data complete.");

    // if (options.checkDuplicates) {
    //   await this.checkDuplicates();
    // }
  }

  async importData(setupOptions: SetupOptions): Promise<void> {
    await this.init(); // Ensure initialization is done
    if (!this.database || !this.storage || !this.config) {
      throw new Error("Database or storage not initialized");
    }
    const importDataActions = new ImportDataActions(
      this.database,
      this.storage,
      this.config,
      this.converterDefinitions,
      this.validityRuleDefinitions,
      this.afterImportActionsDefinitions
    );

    const databasesToRun = this.config.databases
      .filter(
        (db) =>
          (areCollectionNamesSame(db.name, this.config!.databases[0].name) &&
            setupOptions.runProd) ||
          (areCollectionNamesSame(db.name, this.config!.databases[1].name) &&
            setupOptions.runStaging) ||
          (areCollectionNamesSame(db.name, this.config!.databases[2].name) &&
            setupOptions.runDev)
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

      await this.importDataForDatabase(db, importDataActions);
    }
  }

  async importDataForDatabase(
    db: AppwriteConfig["databases"][number],
    importDataActions: ImportDataActions
  ) {
    let afterImportActionsContexts = []; // Store contexts for later use

    for (const collectionConfig of this.config!.collections) {
      if (
        !collectionConfig.importDefs ||
        collectionConfig.importDefs.length === 0
      ) {
        console.warn(
          `No import definitions found for collection: ${collectionConfig.name}`
        );
        continue;
      }
      const collection = await checkForCollection(
        this.database!,
        db.$id,
        collectionConfig
      );
      if (!collection) {
        console.error(`Collection not found: ${collectionConfig.name}`);
        continue;
      }

      for (const importDef of collectionConfig.importDefs) {
        const filePath = path.resolve(
          this.appwriteFolderPath,
          importDef.filePath
        );
        if (!fs.existsSync(filePath)) {
          console.error(`File not found: ${filePath}`);
          continue;
        }

        const rawData = fs.readFileSync(filePath, "utf8");
        const data = JSON.parse(rawData);
        const dataToImport = importDef.basePath
          ? data[importDef.basePath]
          : data;

        for (const item of dataToImport) {
          let shouldCreate = true;
          let foundDocument: Models.Document | undefined;

          let context = {
            dbId: db.$id,
            dbName: db.name,
            collId: collection.$id,
            docId: "",
            createdDoc: {},
            ...importDef.attributeMappings,
            ...item,
          };

          const convertedItem = convertObjectByAttributeMappings(
            item,
            importDef.attributeMappings
          );
          const finalItemDone = await importDataActions.runConverterFunctions(
            convertedItem,
            importDef.attributeMappings
          );
          const finalItem = _.cloneDeep(finalItemDone);

          context = { ...context, ...finalItem };

          console.log(`Importing document: ${JSON.stringify(finalItem)}`);
          // Dynamically add after-import actions for fileData attributes
          const attributeMappingsWithActions = importDef.attributeMappings.map(
            (mapping) => {
              if (mapping.fileData) {
                console.log(
                  "Adding after-import action for fileData attribute"
                );
                let mappingFilePath = importDataActions.resolveTemplate(
                  mapping.fileData.path,
                  context,
                  finalItem
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
                    `${this.config!.documentBucketId}_${db.name
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
            }
          );

          if (
            importDef.type === "update" &&
            importDef.updateMapping &&
            finalItem
          ) {
            // Construct the query to find the existing document
            console.log("Target Field:", importDef.updateMapping.targetField);
            console.log(
              "Original ID Field:",
              importDef.updateMapping.originalIdField
            );
            console.log(
              "Value to match:",
              finalItem[importDef.updateMapping.targetField!],
              "finalItem: ",
              finalItem
            );
            const queries = [];
            const fieldToEqual = importDef.updateMapping.targetField;
            const targetFieldValue = finalItem[fieldToEqual];
            if (!targetFieldValue) {
              console.log(
                `No value found for field: ${fieldToEqual} in item: ${JSON.stringify(
                  finalItem
                )}`
              );
              continue;
            }
            queries.push(Query.equal(fieldToEqual, targetFieldValue));

            // Use the query to find the existing document
            const existingDocuments = await this.database!.listDocuments(
              db.$id,
              collection.$id,
              queries
            );

            if (existingDocuments.documents.length > 0) {
              // Document exists, so we update it
              foundDocument = existingDocuments.documents[0];
              console.log(
                `Found document to update in importData type update with ID: ${foundDocument.$id}`
              );
              shouldCreate = false;
            } else {
              // Document does not exist, handle according to your needs
              // For example, you might still want to create it, or log that it's missing
              console.log(
                "No existing document found for update. Considering creation or skipping."
              );
              shouldCreate = true; // or false, depending on your logic
            }
          }

          const existenceCheck = await documentExists(
            this.database!,
            db.$id,
            collection.$id,
            finalItem
          );
          if (existenceCheck && shouldCreate) {
            console.log("Item already exists, skipping");
            continue;
          }

          context = { ...context, ...finalItem };

          const isValid = await importDataActions.validateItem(
            finalItem,
            importDef.attributeMappings,
            context
          );
          if (!isValid) {
            console.error("Validation failed for item:", finalItem);
            continue;
          }

          let createdDocument: Models.Document | undefined;
          if (shouldCreate) {
            createdDocument = await this.database!.createDocument(
              context.dbId,
              context.collId,
              ID.unique(),
              finalItem
            );
          } else if (foundDocument && !shouldCreate) {
            createdDocument = await this.database!.updateDocument(
              context.dbId,
              context.collId,
              foundDocument.$id,
              finalItem
            );
          } else if (!shouldCreate && !foundDocument) {
            console.error(
              "No existing document found for update. Skipping update."
            );
            continue;
          }
          context.docId = createdDocument!.$id;
          context.createdDoc = createdDocument;
          context = { ...context, ...createdDocument };

          // Store the context for executing after-import actions later
          console.log("Final Item before push: ", finalItem);
          afterImportActionsContexts.push({
            finalItem,
            attributeMappings: attributeMappingsWithActions,
            context,
          });
        }
      }
    }

    await resolveAndUpdateRelationships(db.$id, this.database!, this.config!);

    // Now execute after-import actions for all documents
    for (const {
      finalItem,
      attributeMappings,
      context,
    } of afterImportActionsContexts) {
      console.log(
        `Executing after-import actions for document: ${context.docId}`
      );
      await importDataActions.executeAfterImportActions(
        finalItem,
        attributeMappings,
        context
      );
    }
  }
}
