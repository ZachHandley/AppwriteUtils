import { Client, Databases, Storage } from "node-appwrite";
import { startSetup } from "./migrations/setupDatabase.js";
import path from "path";
import fs from "fs";
import { load } from "js-yaml";
import { ImportDataActions } from "./migrations/importDataActions.js";
import { numTimesFailedTotal } from "./utils/helperFunctions.js";
import { afterImportActions } from "./migrations/afterImportActions.js";
import {
  type AfterImportActions,
  type ConverterFunctions,
  converterFunctions,
  validationRules,
  type ValidationRules,
  type AppwriteConfig,
  AppwriteConfigSchema,
} from "appwrite-utils";
import { ImportController } from "./migrations/importController.js";
import _ from "lodash";
import { AppwriteToX } from "./migrations/appwriteToX.js";
import { loadConfig as loadTsConfig } from "./utils/loadConfigs.js";
import { findAppwriteConfig } from "./utils/loadConfigs.js";
import {
  transferDocumentsBetweenDbsLocalToLocal,
  transferDocumentsBetweenDbsLocalToRemote,
} from "./migrations/collections.js";
import { UsersController } from "./migrations/users.js";
import {
  transferDatabaseLocalToLocal,
  transferDatabaseLocalToRemote,
} from "./migrations/databases.js";
import {
  transferStorageLocalToLocal,
  transferStorageLocalToRemote,
} from "./migrations/storage.js";

// async function loadConfig(configPath: string) {
//   if (!fs.existsSync(configPath)) {
//     throw new Error(`Configuration file not found at ${configPath}`);
//   }
//   const configModule = await load(readFileSync(configPath), {
//     json: true,
//   });
//   return AppwriteConfigSchema.parse(configModule);
// }

export interface SetupOptions {
  sync: boolean;
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
  shouldWriteFile: boolean;
  endpoint?: string;
  project?: string;
  key?: string;
  transfer?: boolean;
  transferEndpoint?: string;
  transferProject?: string;
  transferKey?: string;
  fromDbId?: string;
  targetDbId?: string;
  fromCollection?: string;
  collection?: string;
  transferUsers?: boolean;
  fromBucket?: string;
  targetBucket?: string;
}

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

  constructor(currentUserDir: string) {
    const basePath = currentUserDir; // Gets the current working directory
    const appwriteConfigFound = findAppwriteConfig(basePath);
    if (!appwriteConfigFound) {
      throw new Error("Failed to find appwriteConfig.ts");
    }
    this.appwriteConfigPath = appwriteConfigFound;
    this.appwriteFolderPath = path.dirname(appwriteConfigFound);
    if (!this.appwriteFolderPath) {
      throw new Error("Failed to get appwriteFolderPath");
    }
  }

  // async loadCustomDefinitions(): Promise<void> {
  //   try {
  //     const customDefinitionsPath = path.join(
  //       this.appwriteFolderPath,
  //       "customDefinitions.ts"
  //     );
  //     if (fs.existsSync(customDefinitionsPath)) {
  //       // Dynamically import custom definitions
  //       const customDefinitions = (await import(
  //         customDefinitionsPath
  //       )) as typeof import("customDefinitions");
  //       this.converterDefinitions = {
  //         ...this.converterDefinitions,
  //         ...customDefinitions.converterDefinitions,
  //       };
  //       this.validityRuleDefinitions = {
  //         ...this.validityRuleDefinitions,
  //         ...customDefinitions.validityRuleDefinitions,
  //       };
  //       this.afterImportActionsDefinitions = {
  //         ...this.afterImportActionsDefinitions,
  //         ...customDefinitions.afterImportActionsDefinitions,
  //       };
  //     }
  //   } catch (error) {
  //     console.error("Failed to load custom definitions:", error);
  //   }
  // }

  async init(setupOptions: SetupOptions) {
    if (!this.config) {
      console.log("Initializing appwrite client & loading config...");
      this.config = await loadTsConfig(this.appwriteFolderPath);
      if (!this.config) {
        throw new Error("Failed to load config");
      }
      this.appwriteServer = new Client();
      if (setupOptions.endpoint) {
        if (!setupOptions.project || !setupOptions.key) {
          throw new Error(
            "Project ID and API key required when setting endpoint"
          );
        }
        this.appwriteServer
          .setEndpoint(setupOptions.endpoint)
          .setProject(setupOptions.project)
          .setKey(setupOptions.key);
      } else {
        this.appwriteServer
          .setEndpoint(this.config.appwriteEndpoint)
          .setProject(this.config.appwriteProject)
          .setKey(this.config.appwriteKey);
      }
      this.database = new Databases(this.appwriteServer);
      this.storage = new Storage(this.appwriteServer);
      this.config.appwriteClient = this.appwriteServer;
      // await this.loadCustomDefinitions();
    }
  }

  async run(options: SetupOptions) {
    await this.init(options); // Ensure initialization is done
    if (!this.database || !this.storage || !this.config) {
      throw new Error("Database or storage not initialized");
    }

    if (options.transfer) {
      if (options.fromCollection) {
        if (
          options.transferEndpoint &&
          options.transferProject &&
          options.transferKey
        ) {
          if (options.transferUsers) {
            console.log(
              `Transferring users from local database ${options.fromDbId} to remote database ${options.targetDbId} on endpoint ${options.transferEndpoint}...`
            );
            const usersController = new UsersController(
              this.config,
              this.database
            );
            await usersController.transferUsersBetweenDbsLocalToRemote(
              options.transferEndpoint,
              options.transferProject,
              options.transferKey
            );
          }
          console.log("Transferring documents to remote database...");
          await transferDocumentsBetweenDbsLocalToRemote(
            this.database,
            options.transferEndpoint,
            options.transferProject,
            options.transferKey,
            options.fromDbId!,
            options.targetDbId!,
            options.fromCollection!,
            options.collection!
          );
        } else {
          console.log("Transferring documents between local databases...");
          await transferDocumentsBetweenDbsLocalToLocal(
            this.database,
            options.fromDbId!,
            options.targetDbId!,
            options.fromCollection!,
            options.collection!
          );
        }
      } else if (options.fromDbId && options.targetDbId) {
        if (
          options.transferEndpoint &&
          options.transferProject &&
          options.transferKey
        ) {
          if (options.transferUsers) {
            console.log(
              `Transferring users from local database ${options.fromDbId} to remote database ${options.targetDbId} on endpoint ${options.transferEndpoint}...`
            );
            const usersController = new UsersController(
              this.config,
              this.database
            );
            await usersController.transferUsersBetweenDbsLocalToRemote(
              options.transferEndpoint,
              options.transferProject,
              options.transferKey
            );
          }
          console.log(
            `Transferring databases from local database ${options.fromDbId} to remote database ${options.targetDbId} on endpoint ${options.transferEndpoint}...`
          );
          await transferDatabaseLocalToRemote(
            this.database,
            options.transferEndpoint,
            options.transferProject,
            options.transferKey,
            options.fromDbId!,
            options.targetDbId!
          );
        } else {
          console.log(
            `Transferring databases from local database ${options.fromDbId} to local database ${options.targetDbId}`
          );
          await transferDatabaseLocalToLocal(
            this.database,
            options.fromDbId!,
            options.targetDbId!
          );
        }
      }
      if (options.fromBucket && options.targetBucket) {
        if (
          options.transferEndpoint &&
          options.transferProject &&
          options.transferKey
        ) {
          console.log(
            `Transferring files from bucket ${options.fromBucket} to bucket ${options.targetBucket} on endpoint ${options.transferEndpoint}...`
          );
          await transferStorageLocalToRemote(
            this.storage,
            options.transferEndpoint,
            options.transferProject,
            options.transferKey,
            options.fromBucket,
            options.targetBucket
          );
        } else {
          console.log(
            `Transferring files from bucket ${options.fromBucket} to bucket ${options.targetBucket}...`
          );
          await transferStorageLocalToLocal(
            this.storage,
            options.fromBucket,
            options.targetBucket
          );
        }
      }
      console.log("Transfer complete.");
      return;
    }

    if (options.sync) {
      console.log("Starting synchronization with server...");
      const appwriteToX = new AppwriteToX(this.config, this.appwriteFolderPath);
      await appwriteToX.toSchemas();
      console.log("Synchronization complete, YAML and Schemas updated");
    }

    // Start the setup
    console.log(
      "Starting setup, this step sets up migrations, runs backup, wipes databases, and updates schemas (depending on your options)..."
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

    if (options.importData) {
      console.log("Starting import data...");
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
      console.log("Import data complete.");
    }

    console.log("Total number of times Fetch failed: ", numTimesFailedTotal);

    // if (options.checkDuplicates) {
    //   await this.checkDuplicates();
    // }
  }
}
