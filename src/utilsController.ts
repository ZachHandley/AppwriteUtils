import {
  Client,
  Databases,
  ID,
  Query,
  Storage,
  type Models,
} from "node-appwrite";
import { startSetup } from "./migrations/setupDatabase";
import {
  type AppwriteConfig,
  AppwriteConfigSchema,
  type CollectionCreate,
} from "./migrations/schema";
import path from "path";
import fs from "fs";
import { load } from "js-yaml";
import { ImportDataActions } from "./migrations/importDataActions";
import { convertObjectByAttributeMappings } from "./migrations/converters";

async function loadConfig(configPath: string) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found at ${configPath}`);
  }
  const configModule = await load(configPath, { json: true });
  return AppwriteConfigSchema.parse(configModule);
}

export interface SetupOptions {
  runProd: boolean;
  wipeDatabases: boolean;
  generateSchemas: boolean;
  generateMockData: boolean;
  importData: boolean;
  checkDuplicates: boolean;
}

type CollectionConfig = AppwriteConfig["collections"];
type ImportDef = CollectionConfig[number]["importDefs"][number];
type AttributeMappings = ImportDef["attributeMappings"];
type AfterImportAction = AttributeMappings[string]["postImportActions"][number];
type ValidityRule = AttributeMappings[string]["validationActions"][number];

export class UtilsController {
  private appwriteFolderPath: string;
  private appwriteConfigPath: string;
  private config?: AppwriteConfig;
  private appwriteServer?: Client;
  private database?: Databases;
  private storage?: Storage;
  private documentsWithRelationships = new Map<string, Models.Document[]>();

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

  async init() {
    if (!this.config) {
      this.config = await loadConfig(this.appwriteConfigPath);
      this.appwriteServer = new Client()
        .setEndpoint(this.config.appwriteEndpoint)
        .setProject(this.config.appwriteProject)
        .setKey(this.config.appwriteKey);
      this.database = new Databases(this.appwriteServer);
      this.storage = new Storage(this.appwriteServer);
      this.config.appwriteClient = this.appwriteServer;
    }
  }

  async importData(): Promise<void> {
    await this.init(); // Ensure initialization is done
    if (!this.database || !this.storage || !this.config) {
      throw new Error("Database or storage not initialized");
    }
    const importDataActions = new ImportDataActions(
      this.database,
      this.storage,
      this.config
    );

    for (const collectionConfig of this.config.collections) {
      if (
        !collectionConfig.importDefs ||
        collectionConfig.importDefs.length === 0
      ) {
        console.warn(
          `No import definitions found for collection: ${collectionConfig.name}`
        );
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
          let context = {
            dbId: collectionConfig.databaseId!,
            collId: collectionConfig.$id!,
            docId: "",
            createdDoc: {},
            ...importDef.attributeMappings,
            ...item,
          };

          // Convert item using attributeMappings
          const convertedItem = convertObjectByAttributeMappings(
            item,
            importDef.attributeMappings
          );

          context = { ...context, ...convertedItem };

          // Validate the converted item, also handled by ImportDataActions
          const isValid = await importDataActions.validateItem(
            convertedItem,
            importDef.attributeMappings,
            context
          );
          if (!isValid) {
            console.error("Validation failed for item:", convertedItem);
            continue; // Skip importing this item due to validation failure
          }

          // Import the validated item to the database
          const createdDocument = await this.database.createDocument(
            context.dbId,
            context.collId,
            ID.unique(),
            convertedItem
          );

          // Update the context with the newly created document's ID for after-import actions
          context.docId = createdDocument.$id;
          context = { ...context, ...createdDocument };

          // Execute any after-import actions defined in attributeMappings
          await importDataActions.executeAfterImportActions(
            convertedItem,
            importDef.attributeMappings,
            context
          );
        }
      }
    }
  }
}
