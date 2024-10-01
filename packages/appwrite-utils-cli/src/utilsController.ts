import { Client, Databases, Query, Storage, type Models } from "node-appwrite";
import { type AppwriteConfig } from "appwrite-utils";
import { loadConfig, findAppwriteConfig } from "./utils/loadConfigs.js";
import { UsersController } from "./migrations/users.js";
import { AppwriteToX } from "./migrations/appwriteToX.js";
import { ImportController } from "./migrations/importController.js";
import { ImportDataActions } from "./migrations/importDataActions.js";
import {
  setupMigrationDatabase,
  ensureDatabasesExist,
  wipeOtherDatabases,
} from "./migrations/setupDatabase.js";
import {
  createOrUpdateCollections,
  wipeDatabase,
  generateSchemas,
  fetchAllCollections,
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
  type TransferOptions,
} from "./migrations/transfer.js";
import { getClient } from "./utils/getClientFromConfig.js";
import { fetchAllDatabases } from "./migrations/databases.js";

export interface SetupOptions {
  databases?: Models.Database[];
  collections?: string[];
  doBackup?: boolean;
  wipeDatabase?: boolean;
  wipeDocumentStorage?: boolean;
  wipeUsers?: boolean;
  generateSchemas?: boolean;
  importData?: boolean;
  checkDuplicates?: boolean;
  shouldWriteFile?: boolean;
}

export class UtilsController {
  private appwriteFolderPath: string;
  private appwriteConfigPath: string;
  public config?: AppwriteConfig;
  public appwriteServer?: Client;
  public database?: Databases;
  public storage?: Storage;
  public converterDefinitions: ConverterFunctions = converterFunctions;
  public validityRuleDefinitions: ValidationRules = validationRules;
  public afterImportActionsDefinitions: AfterImportActions = afterImportActions;

  constructor(currentUserDir: string) {
    const basePath = currentUserDir;
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

  async init() {
    if (!this.config) {
      console.log("Initializing appwrite client & loading config...");
      this.config = await loadConfig(this.appwriteFolderPath);
      if (!this.config) {
        throw new Error("Failed to load config");
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
  }

  async setupMigrationDatabase() {
    await this.init();
    if (!this.config) throw new Error("Config not initialized");
    await setupMigrationDatabase(this.config);
  }

  async ensureDatabaseConfigBucketsExist(databases: Models.Database[] = []) {
    await this.init();
    if (!this.storage) throw new Error("Storage not initialized");
    if (!this.config) throw new Error("Config not initialized");
    await ensureDatabaseConfigBucketsExist(
      this.storage,
      this.config,
      databases
    );
  }

  async ensureDatabasesExist(databases?: Models.Database[]) {
    await this.init();
    if (!this.config) throw new Error("Config not initialized");
    await this.setupMigrationDatabase();
    await this.ensureDatabaseConfigBucketsExist(databases);
    await ensureDatabasesExist(this.config);
  }

  async getDatabasesByIds(ids: string[]) {
    await this.init();
    if (!this.database) throw new Error("Database not initialized");
    const dbs = await this.database.list([
      Query.limit(500),
      Query.equal("$id", ids),
    ]);
    return dbs.databases;
  }

  async wipeOtherDatabases(databasesToKeep: Models.Database[]) {
    await this.init();
    if (!this.database) throw new Error("Database not initialized");
    await wipeOtherDatabases(this.database, databasesToKeep);
  }

  async wipeUsers() {
    await this.init();
    if (!this.config || !this.database)
      throw new Error("Config or database not initialized");
    const usersController = new UsersController(this.config, this.database);
    await usersController.wipeUsers();
  }

  async backupDatabase(database: Models.Database) {
    await this.init();
    if (!this.database || !this.storage || !this.config)
      throw new Error("Database, storage, or config not initialized");
    await backupDatabase(
      this.config,
      this.database,
      database.$id,
      this.storage
    );
  }

  async wipeDatabase(database: Models.Database) {
    await this.init();
    if (!this.database) throw new Error("Database not initialized");
    return await wipeDatabase(this.database, database.$id);
  }

  async wipeDocumentStorage(bucketId: string) {
    await this.init();
    if (!this.storage) throw new Error("Storage not initialized");
    await wipeDocumentStorage(this.storage, bucketId);
  }

  async createOrUpdateCollectionsForDatabases(databases: Models.Database[]) {
    await this.init();
    if (!this.database || !this.config)
      throw new Error("Database or config not initialized");
    for (const database of databases) {
      if (database.$id === "migrations") continue;
      await this.createOrUpdateCollections(database);
    }
  }

  async createOrUpdateCollections(
    database: Models.Database,
    deletedCollections?: { collectionId: string; collectionName: string }[]
  ) {
    await this.init();
    if (!this.database || !this.config)
      throw new Error("Database or config not initialized");
    await createOrUpdateCollections(
      this.database,
      database.$id,
      this.config,
      deletedCollections
    );
  }

  async generateSchemas() {
    await this.init();
    if (!this.config) throw new Error("Config not initialized");
    await generateSchemas(this.config, this.appwriteFolderPath);
  }

  async importData(options: SetupOptions) {
    await this.init();
    if (!this.config || !this.database || !this.storage)
      throw new Error("Config, database, or storage not initialized");
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
      options
    );
    await importController.run();
  }

  async synchronizeConfigurations(
    databases?: Models.Database[],
    config?: AppwriteConfig
  ) {
    await this.init();
    if (!this.storage) throw new Error("Storage not initialized");
    const configToUse = config || this.config;
    if (!configToUse) throw new Error("Config not initialized");
    const appwriteToX = new AppwriteToX(
      configToUse,
      this.appwriteFolderPath,
      this.storage
    );
    await appwriteToX.toSchemas(databases);
  }

  async syncDb() {
    await this.init();
    if (!this.database) throw new Error("Database not initialized");
    const databases = await fetchAllDatabases(this.database);
    await this.ensureDatabasesExist(databases);
    await this.ensureDatabaseConfigBucketsExist(databases);
    await this.createOrUpdateCollectionsForDatabases(databases);
  }

  getAppwriteFolderPath() {
    return this.appwriteFolderPath;
  }

  async transferData(options: TransferOptions): Promise<void> {
    if (!this.database) {
      throw new Error(
        "Database is not initialized, is the config file correct & created?"
      );
    }

    let sourceClient = this.database;
    let targetClient: Databases;
    let sourceDatabases: Models.Database[];
    let targetDatabases: Models.Database[];

    if (options.isRemote) {
      if (
        !options.transferEndpoint ||
        !options.transferProject ||
        !options.transferKey
      ) {
        throw new Error("Remote transfer options are missing");
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

    // Validate that the provided databases exist in the fetched lists
    const fromDb = sourceDatabases.find((db) => db.$id === options.fromDb.$id);
    const targetDb = targetDatabases.find(
      (db) => db.$id === options.targetDb.$id
    );

    if (!fromDb || !targetDb) {
      throw new Error("Source or target database not found");
    }

    if (options.isRemote) {
      // Remote transfer
      await transferDatabaseLocalToRemote(
        sourceClient,
        options.transferEndpoint!,
        options.transferProject!,
        options.transferKey!,
        fromDb.$id,
        targetDb.$id
      );

      if (this.storage && options.sourceBucket && options.targetBucket) {
        await transferStorageLocalToRemote(
          this.storage,
          options.transferEndpoint!,
          options.transferProject!,
          options.transferKey!,
          options.sourceBucket.$id,
          options.targetBucket.$id
        );
      }
    } else {
      // Local transfer
      await transferDatabaseLocalToLocal(
        sourceClient,
        fromDb.$id,
        targetDb.$id
      );

      if (this.storage && options.sourceBucket && options.targetBucket) {
        await transferStorageLocalToLocal(
          this.storage,
          options.sourceBucket.$id,
          options.targetBucket.$id
        );
      }
    }

    console.log("Data transfer completed");
  }
}
