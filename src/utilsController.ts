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
import { readFileSync } from "./utils/helperFunctions";
import { checkForCollection } from "./migrations/collections";
import { resolveAndUpdateRelationships } from "./migrations/relationships";
import { documentExists } from "./migrations/queue";

async function loadConfig(configPath: string) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found at ${configPath}`);
  }
  const configModule = await load(readFileSync(configPath), {
    json: true,
  });
  console.log("Loaded config:", configModule);
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
type AfterImportAction = AttributeMappings[number]["postImportActions"][number];
type ValidityRule = AttributeMappings[number]["validationActions"][number];

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
    console.log(appwriteConfigPath);
    this.appwriteFolderPath = appwriteFolderPath;
    this.appwriteConfigPath = appwriteConfigPath;
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
      await this.importData();
    }
    console.log("Import data complete.");

    // if (options.checkDuplicates) {
    //   await this.checkDuplicates();
    // }
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

    for (let db of this.config.databases) {
      if (db.name.toLowerCase().trim().replace(" ", "") === "migrations") {
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
          let context = {
            dbId: db.$id,
            collId: collection.$id,
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

          // Execute any converters defined in attributeMappings
          const finalItem = await importDataActions.runConverterFunctions(
            convertedItem,
            importDef.attributeMappings
          );

          const existenceCheck = await documentExists(
            this.database!,
            db.$id,
            collection.$id,
            finalItem
          );
          if (existenceCheck) {
            console.log("Item already exists, skipping");
            continue;
          }

          console.log("Converted item:", finalItem);

          context = { ...context, ...finalItem };

          // Validate the converted item, also handled by ImportDataActions
          const isValid = await importDataActions.validateItem(
            finalItem,
            importDef.attributeMappings,
            context
          );
          if (!isValid) {
            console.error("Validation failed for item:", finalItem);
            continue; // Skip importing this item due to validation failure
          }

          // Import the validated item to the database
          const createdDocument = await this.database!.createDocument(
            context.dbId,
            context.collId,
            ID.unique(),
            finalItem
          );

          // Update the context with the newly created document's ID for after-import actions
          context.docId = createdDocument.$id;
          context.createdDoc = createdDocument;
          context = { ...context, ...createdDocument };

          // Execute any after-import actions defined in attributeMappings
          console.log(
            `Executing after-import actions for document: ${createdDocument.$id}`
          );
          await importDataActions.executeAfterImportActions(
            finalItem,
            importDef.attributeMappings,
            context
          );
        }
      }
    }
    await resolveAndUpdateRelationships(db.$id, this.database!, this.config!);
  }
}
