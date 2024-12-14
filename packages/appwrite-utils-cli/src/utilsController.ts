import {
  Client,
  Databases,
  Query,
  Storage,
  Users,
  type Models,
} from "node-appwrite";
import {
  type AppwriteConfig,
  type AppwriteFunction,
  type Specification,
} from "appwrite-utils";
import {
  loadConfig,
  findAppwriteConfig,
  findFunctionsDir,
} from "./utils/loadConfigs.js";
import { UsersController } from "./migrations/users.js";
import { AppwriteToX } from "./migrations/appwriteToX.js";
import { ImportController } from "./migrations/importController.js";
import { ImportDataActions } from "./migrations/importDataActions.js";
import {
  setupMigrationDatabase,
  ensureDatabasesExist,
  wipeOtherDatabases,
  ensureCollectionsExist,
} from "./migrations/setupDatabase.js";
import {
  createOrUpdateCollections,
  wipeDatabase,
  generateSchemas,
  fetchAllCollections,
  wipeCollection,
} from "./collections/methods.js";
import {
  backupDatabase,
  ensureDatabaseConfigBucketsExist,
  initOrGetBackupStorage,
  wipeDocumentStorage,
} from "./storage/methods.js";
import path from "path";
import {
  type AfterImportActions,
  type ConverterFunctions,
  converterFunctions,
  validationRules,
  type ValidationRules,
} from "appwrite-utils";
import { afterImportActions } from "./migrations/afterImportActions.js";
import {
  transferDatabaseLocalToLocal,
  transferDatabaseLocalToRemote,
  transferStorageLocalToLocal,
  transferStorageLocalToRemote,
  transferUsersLocalToRemote,
  type TransferOptions,
} from "./migrations/transfer.js";
import { getClient } from "./utils/getClientFromConfig.js";
import { fetchAllDatabases } from "./migrations/databases.js";
import {
  listFunctions,
  updateFunctionSpecifications,
} from "./functions/methods.js";
import chalk from "chalk";
import { deployLocalFunction } from "./functions/deployments.js";
import fs from "node:fs";

export interface SetupOptions {
  databases?: Models.Database[];
  collections?: string[];
  doBackup?: boolean;
  wipeDatabase?: boolean;
  wipeCollections?: boolean;
  wipeDocumentStorage?: boolean;
  wipeUsers?: boolean;
  transferUsers?: boolean;
  generateSchemas?: boolean;
  importData?: boolean;
  checkDuplicates?: boolean;
  shouldWriteFile?: boolean;
}

export class UtilsController {
  private appwriteFolderPath?: string;
  private appwriteConfigPath?: string;
  public config?: AppwriteConfig;
  public appwriteServer?: Client;
  public database?: Databases;
  public storage?: Storage;
  public converterDefinitions: ConverterFunctions = converterFunctions;
  public validityRuleDefinitions: ValidationRules = validationRules;
  public afterImportActionsDefinitions: AfterImportActions = afterImportActions;

  constructor(
    currentUserDir: string,
    directConfig?: {
      appwriteEndpoint?: string;
      appwriteProject?: string;
      appwriteKey?: string;
    }
  ) {
    const basePath = currentUserDir;

    if (directConfig) {
      let hasErrors = false;
      if (!directConfig.appwriteEndpoint) {
        console.log(chalk.red("Appwrite endpoint is required"));
        hasErrors = true;
      }
      if (!directConfig.appwriteProject) {
        console.log(chalk.red("Appwrite project is required"));
        hasErrors = true;
      }
      if (!directConfig.appwriteKey) {
        console.log(chalk.red("Appwrite key is required"));
        hasErrors = true;
      }
      if (!hasErrors) {
        // Only set config if we have all required fields
        this.appwriteFolderPath = basePath;
        this.config = {
          appwriteEndpoint: directConfig.appwriteEndpoint!,
          appwriteProject: directConfig.appwriteProject!,
          appwriteKey: directConfig.appwriteKey!,
          enableBackups: false,
          backupInterval: 0,
          backupRetention: 0,
          enableBackupCleanup: false,
          enableMockData: false,
          documentBucketId: "",
          usersCollectionName: "",
          databases: [],
          buckets: [],
          functions: [],
        };
      }
    } else {
      // Try to find config file
      const appwriteConfigFound = findAppwriteConfig(basePath);
      if (!appwriteConfigFound) {
        console.log(
          chalk.yellow(
            "No appwriteConfig.ts found and no direct configuration provided"
          )
        );
        return;
      }
      this.appwriteConfigPath = appwriteConfigFound;
      this.appwriteFolderPath = path.dirname(appwriteConfigFound);
    }
  }

  async init() {
    if (!this.config) {
      if (this.appwriteFolderPath && this.appwriteConfigPath) {
        console.log("Loading config from file...");
        this.config = await loadConfig(this.appwriteFolderPath);
        if (!this.config) {
          console.log(chalk.red("Failed to load config from file"));
          return;
        }
      } else {
        console.log(chalk.red("No configuration available"));
        return;
      }
    }

    this.appwriteServer = new Client();
    this.appwriteServer
      .setEndpoint(this.config.appwriteEndpoint)
      .setProject(this.config.appwriteProject)
      .setKey(this.config.appwriteKey);

    this.database = new Databases(this.appwriteServer);
    this.storage = new Storage(this.appwriteServer);
    this.config.appwriteClient = this.appwriteServer;
  }

  async reloadConfig() {
    if (!this.appwriteFolderPath) {
      console.log(chalk.red("Failed to get appwriteFolderPath"));
      return;
    }
    this.config = await loadConfig(this.appwriteFolderPath);
    if (!this.config) {
      console.log(chalk.red("Failed to load config"));
      return;
    }
    this.appwriteServer = new Client();
    this.appwriteServer
      .setEndpoint(this.config.appwriteEndpoint)
      .setProject(this.config.appwriteProject)
      .setKey(this.config.appwriteKey);
    this.database = new Databases(this.appwriteServer);
    this.storage = new Storage(this.appwriteServer);
    this.config.appwriteClient = this.appwriteServer;
  }

  async setupMigrationDatabase() {
    await this.init();
    if (!this.config) {
      console.log(chalk.red("Config not initialized"));
      return;
    }
    await setupMigrationDatabase(this.config);
  }

  async ensureDatabaseConfigBucketsExist(databases: Models.Database[] = []) {
    await this.init();
    if (!this.storage) {
      console.log(chalk.red("Storage not initialized"));
      return;
    }
    if (!this.config) {
      console.log(chalk.red("Config not initialized"));
      return;
    }
    await ensureDatabaseConfigBucketsExist(
      this.storage,
      this.config,
      databases
    );
  }

  async ensureDatabasesExist(databases?: Models.Database[]) {
    await this.init();
    if (!this.config) {
      console.log(chalk.red("Config not initialized"));
      return;
    }
    await this.setupMigrationDatabase();
    await this.ensureDatabaseConfigBucketsExist(databases);
    await ensureDatabasesExist(this.config, databases);
  }

  async ensureCollectionsExist(
    database: Models.Database,
    collections?: Models.Collection[]
  ) {
    await this.init();
    if (!this.config) {
      console.log(chalk.red("Config not initialized"));
      return;
    }
    await ensureCollectionsExist(this.config, database, collections);
  }

  async getDatabasesByIds(ids: string[]) {
    await this.init();
    if (!this.database) {
      console.log(chalk.red("Database not initialized"));
      return;
    }
    if (ids.length === 0) return [];
    const dbs = await this.database.list([
      Query.limit(500),
      Query.equal("$id", ids),
    ]);
    return dbs.databases;
  }

  async wipeOtherDatabases(databasesToKeep: Models.Database[]) {
    await this.init();
    if (!this.database) {
      console.log(chalk.red("Database not initialized"));
      return;
    }
    await wipeOtherDatabases(this.database, databasesToKeep);
  }

  async wipeUsers() {
    await this.init();
    if (!this.config || !this.database) {
      console.log(chalk.red("Config or database not initialized"));
      return;
    }
    const usersController = new UsersController(this.config, this.database);
    await usersController.wipeUsers();
  }

  async backupDatabase(database: Models.Database) {
    await this.init();
    if (!this.database || !this.storage || !this.config) {
      console.log(chalk.red("Database, storage, or config not initialized"));
      return;
    }
    await backupDatabase(
      this.config,
      this.database,
      database.$id,
      this.storage
    );
  }

  async listAllFunctions() {
    await this.init();
    if (!this.appwriteServer) {
      console.log(chalk.red("Appwrite server not initialized"));
      return [];
    }
    const { functions } = await listFunctions(this.appwriteServer, [
      Query.limit(1000),
    ]);
    return functions;
  }

  async findFunctionDirectories() {
    if (!this.appwriteFolderPath) {
      console.log(chalk.red("Failed to get appwriteFolderPath"));
      return new Map();
    }
    const functionsDir = findFunctionsDir(this.appwriteFolderPath);
    if (!functionsDir) {
      console.log(chalk.red("Failed to find functions directory"));
      return new Map();
    }

    const functionDirMap = new Map<string, string>();
    const entries = fs.readdirSync(functionsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const functionPath = path.join(functionsDir, entry.name);
        // Match with config functions by name
        if (this.config?.functions) {
          const matchingFunc = this.config.functions.find(
            (f) => f.name.toLowerCase() === entry.name.toLowerCase()
          );
          if (matchingFunc) {
            functionDirMap.set(matchingFunc.name, functionPath);
          }
        }
      }
    }
    return functionDirMap;
  }

  async deployFunction(
    functionName: string,
    functionPath?: string,
    functionConfig?: AppwriteFunction
  ) {
    await this.init();
    if (!this.appwriteServer) {
      console.log(chalk.red("Appwrite server not initialized"));
      return;
    }

    if (!functionConfig) {
      functionConfig = this.config?.functions?.find(
        (f) => f.name === functionName
      );
    }
    if (!functionConfig) {
      console.log(chalk.red(`Function ${functionName} not found in config`));
      return;
    }

    await deployLocalFunction(
      this.appwriteServer,
      functionName,
      functionConfig,
      functionPath
    );
  }

  async syncFunctions() {
    await this.init();
    if (!this.appwriteServer) {
      console.log(chalk.red("Appwrite server not initialized"));
      return;
    }

    const localFunctions = this.config?.functions || [];
    const remoteFunctions = await listFunctions(this.appwriteServer, [
      Query.limit(1000),
    ]);

    for (const localFunction of localFunctions) {
      console.log(chalk.blue(`Syncing function ${localFunction.name}...`));
      await this.deployFunction(localFunction.name);
    }

    console.log(chalk.green("✨ All functions synchronized successfully!"));
  }

  async wipeDatabase(database: Models.Database, wipeBucket: boolean = false) {
    await this.init();
    if (!this.database) throw new Error("Database not initialized");
    await wipeDatabase(this.database, database.$id);
    if (wipeBucket) {
      await this.wipeBucketFromDatabase(database);
    }
  }

  async wipeBucketFromDatabase(database: Models.Database) {
    // Check configured bucket in database config
    const configuredBucket = this.config?.databases?.find(
      (db) => db.$id === database.$id
    )?.bucket;
    if (configuredBucket?.$id) {
      await this.wipeDocumentStorage(configuredBucket.$id);
    }

    // Also check for document bucket ID pattern
    if (this.config?.documentBucketId) {
      const documentBucketId = `${this.config.documentBucketId}_${database.$id
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "")}`;
      try {
        await this.wipeDocumentStorage(documentBucketId);
      } catch (error: any) {
        // Ignore if bucket doesn't exist
        if (error?.type !== "storage_bucket_not_found") {
          throw error;
        }
      }
    }
  }

  async wipeCollection(
    database: Models.Database,
    collection: Models.Collection
  ) {
    await this.init();
    if (!this.database) throw new Error("Database not initialized");
    await wipeCollection(this.database, database.$id, collection.$id);
  }

  async wipeDocumentStorage(bucketId: string) {
    await this.init();
    if (!this.storage) throw new Error("Storage not initialized");
    await wipeDocumentStorage(this.storage, bucketId);
  }

  async createOrUpdateCollectionsForDatabases(
    databases: Models.Database[],
    collections: Models.Collection[] = []
  ) {
    await this.init();
    if (!this.database || !this.config)
      throw new Error("Database or config not initialized");
    for (const database of databases) {
      if (database.$id === "migrations") continue;
      await this.createOrUpdateCollections(database, undefined, collections);
    }
  }

  async createOrUpdateCollections(
    database: Models.Database,
    deletedCollections?: { collectionId: string; collectionName: string }[],
    collections: Models.Collection[] = []
  ) {
    await this.init();
    if (!this.database || !this.config)
      throw new Error("Database or config not initialized");
    await createOrUpdateCollections(
      this.database,
      database.$id,
      this.config,
      deletedCollections,
      collections
    );
  }

  async generateSchemas() {
    await this.init();
    if (!this.config) {
      console.log(chalk.red("Config not initialized"));
      return;
    }
    if (!this.appwriteFolderPath) {
      console.log(chalk.red("Failed to get appwriteFolderPath"));
      return;
    }
    await generateSchemas(this.config, this.appwriteFolderPath);
  }

  async importData(options: SetupOptions = {}) {
    await this.init();
    if (!this.database) {
      console.log(chalk.red("Database not initialized"));
      return;
    }
    if (!this.storage) {
      console.log(chalk.red("Storage not initialized"));
      return;
    }
    if (!this.config) {
      console.log(chalk.red("Config not initialized"));
      return;
    }
    if (!this.appwriteFolderPath) {
      console.log(chalk.red("Failed to get appwriteFolderPath"));
      return;
    }

    const importDataActions = new ImportDataActions(
      this.database,
      this.storage,
      this.config,
      this.converterDefinitions,
      this.validityRuleDefinitions,
      this.afterImportActionsDefinitions
    );

    const importController = new ImportController(
      this.config,
      this.database,
      this.storage,
      this.appwriteFolderPath,
      importDataActions,
      options,
      options.databases
    );
    await importController.run(options.collections);
  }

  async synchronizeConfigurations(
    databases?: Models.Database[],
    config?: AppwriteConfig
  ) {
    await this.init();
    if (!this.storage) {
      console.log(chalk.red("Storage not initialized"));
      return;
    }
    const configToUse = config || this.config;
    if (!configToUse) {
      console.log(chalk.red("Config not initialized"));
      return;
    }
    if (!this.appwriteFolderPath) {
      console.log(chalk.red("Failed to get appwriteFolderPath"));
      return;
    }
    const appwriteToX = new AppwriteToX(
      configToUse,
      this.appwriteFolderPath,
      this.storage
    );
    await appwriteToX.toSchemas(databases);
  }

  async syncDb(
    databases: Models.Database[] = [],
    collections: Models.Collection[] = []
  ) {
    await this.init();
    if (!this.database) {
      console.log(chalk.red("Database not initialized"));
      return;
    }
    if (databases.length === 0) {
      const allDatabases = await fetchAllDatabases(this.database);
      databases = allDatabases;
    }
    await this.ensureDatabasesExist(databases);
    await this.ensureDatabaseConfigBucketsExist(databases);
    await this.createOrUpdateCollectionsForDatabases(databases, collections);
  }

  getAppwriteFolderPath() {
    return this.appwriteFolderPath;
  }

  async transferData(options: TransferOptions): Promise<void> {
    let sourceClient = this.database;
    let targetClient: Databases | undefined;
    let sourceDatabases: Models.Database[] = [];
    let targetDatabases: Models.Database[] = [];

    if (!sourceClient) {
      console.log(chalk.red("Source database not initialized"));
      return;
    }

    if (options.isRemote) {
      if (
        !options.transferEndpoint ||
        !options.transferProject ||
        !options.transferKey
      ) {
        console.log(chalk.red("Remote transfer options are missing"));
        return;
      }

      const remoteClient = getClient(
        options.transferEndpoint,
        options.transferProject,
        options.transferKey
      );

      targetClient = new Databases(remoteClient);
      sourceDatabases = await fetchAllDatabases(sourceClient);
      targetDatabases = await fetchAllDatabases(targetClient);
    } else {
      targetClient = sourceClient;
      sourceDatabases = targetDatabases = await fetchAllDatabases(sourceClient);
    }

    // Always perform database transfer if databases are specified
    if (options.fromDb && options.targetDb) {
      const fromDb = sourceDatabases.find(
        (db) => db.$id === options.fromDb!.$id
      );
      const targetDb = targetDatabases.find(
        (db) => db.$id === options.targetDb!.$id
      );

      if (!fromDb || !targetDb) {
        console.log(chalk.red("Source or target database not found"));
        return;
      }

      if (options.isRemote && targetClient) {
        await transferDatabaseLocalToRemote(
          sourceClient,
          options.transferEndpoint!,
          options.transferProject!,
          options.transferKey!,
          fromDb.$id,
          targetDb.$id
        );
      } else {
        await transferDatabaseLocalToLocal(
          sourceClient,
          fromDb.$id,
          targetDb.$id
        );
      }
    }

    if (options.transferUsers) {
      if (!options.isRemote) {
        console.log(
          chalk.yellow(
            "User transfer is only supported for remote transfers. Skipping..."
          )
        );
      } else if (!this.appwriteServer) {
        console.log(chalk.red("Appwrite server not initialized"));
        return;
      } else {
        console.log(chalk.blue("Starting user transfer..."));
        const localUsers = new Users(this.appwriteServer);
        await transferUsersLocalToRemote(
          localUsers,
          options.transferEndpoint!,
          options.transferProject!,
          options.transferKey!
        );
        console.log(chalk.green("User transfer completed"));
      }
    }

    // Handle storage transfer
    if (this.storage && (options.sourceBucket || options.fromDb)) {
      const sourceBucketId =
        options.sourceBucket?.$id ||
        (options.fromDb &&
          this.config?.documentBucketId &&
          `${this.config.documentBucketId}_${options.fromDb.$id
            .toLowerCase()
            .trim()
            .replace(/\s+/g, "")}`);

      const targetBucketId =
        options.targetBucket?.$id ||
        (options.targetDb &&
          this.config?.documentBucketId &&
          `${this.config.documentBucketId}_${options.targetDb.$id
            .toLowerCase()
            .trim()
            .replace(/\s+/g, "")}`);

      if (sourceBucketId && targetBucketId) {
        console.log(
          chalk.blue(
            `Starting storage transfer from ${sourceBucketId} to ${targetBucketId}`
          )
        );

        if (options.isRemote) {
          await transferStorageLocalToRemote(
            this.storage,
            options.transferEndpoint!,
            options.transferProject!,
            options.transferKey!,
            sourceBucketId,
            targetBucketId
          );
        } else {
          await transferStorageLocalToLocal(
            this.storage,
            sourceBucketId,
            targetBucketId
          );
        }
      }
    }

    console.log(chalk.green("Transfer completed"));
  }

  async updateFunctionSpecifications(
    functionId: string,
    specification: Specification
  ) {
    await this.init();
    if (!this.appwriteServer)
      throw new Error("Appwrite server not initialized");
    console.log(
      chalk.green(
        `Updating function specifications for ${functionId} to ${specification}`
      )
    );
    await updateFunctionSpecifications(
      this.appwriteServer,
      functionId,
      specification
    );
    console.log(
      chalk.green(
        `Successfully updated function specifications for ${functionId} to ${specification}`
      )
    );
  }
}
