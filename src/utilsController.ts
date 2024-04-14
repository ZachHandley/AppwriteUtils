import { Client, Databases, Storage } from "node-appwrite";
import { startSetup } from "./migrations/setupDatabase.js";
import {
  type AppwriteConfig,
  AppwriteConfigSchema,
} from "./migrations/schema.js";
import path from "path";
import fs from "fs";
import { load } from "js-yaml";
import { ImportDataActions } from "./migrations/importDataActions.js";
import {
  converterFunctions,
  type ConverterFunctions,
} from "./migrations/converters.js";
import { readFileSync } from "./utils/helperFunctions.js";
import {
  afterImportActions,
  type AfterImportActions,
} from "./migrations/afterImportActions.js";
import validationRules, {
  type ValidationRules,
} from "./migrations/validationRules.js";
import { ImportController } from "./migrations/importController.js";
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
  wipeUsers: boolean;
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
      const importDataActions = new ImportDataActions(
        this.database,
        this.storage,
        this.config,
        this.converterDefinitions,
        this.validityRuleDefinitions,
        this.afterImportActionsDefinitions
      );
      const importController = new ImportController(
        this.config!,
        this.database!,
        this.storage!,
        this.appwriteFolderPath,
        importDataActions,
        options
      );
      await importController.run();
    }
    console.log("Import data complete.");

    // if (options.checkDuplicates) {
    //   await this.checkDuplicates();
    // }
  }
}
