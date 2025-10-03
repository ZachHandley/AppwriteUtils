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
  loadConfigWithPath,
  findAppwriteConfig,
  findFunctionsDir,
} from "./utils/loadConfigs.js";
import { UsersController } from "./users/methods.js";
import { AppwriteToX } from "./migrations/appwriteToX.js";
import { ImportController } from "./migrations/importController.js";
import { ImportDataActions } from "./migrations/importDataActions.js";
import {
  ensureDatabasesExist,
  wipeOtherDatabases,
  ensureCollectionsExist,
} from "./databases/setup.js";
import {
  createOrUpdateCollections,
  wipeDatabase,
  generateSchemas,
  fetchAllCollections,
  wipeCollection,
} from "./collections/methods.js";
import { wipeAllTables, wipeTableRows } from "./collections/methods.js";
import {
  backupDatabase,
  ensureDatabaseConfigBucketsExist,
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
import { getClient, getClientWithAuth } from "./utils/getClientFromConfig.js";
import { getAdapterFromConfig } from "./utils/getClientFromConfig.js";
import type { DatabaseAdapter } from './adapters/DatabaseAdapter.js';
import { hasSessionAuth, findSessionByEndpointAndProject, isValidSessionCookie, type SessionAuthInfo } from "./utils/sessionAuth.js";
import { createSessionPreservation, type SessionPreservationOptions } from "./utils/loadConfigs.js";
import { fetchAllDatabases } from "./databases/methods.js";
import {
  listFunctions,
  updateFunctionSpecifications,
} from "./functions/methods.js";
import chalk from "chalk";
import { deployLocalFunction } from "./functions/deployments.js";
import fs from "node:fs";
import { configureLogging, updateLogger } from "./shared/logging.js";
import { MessageFormatter, Messages } from "./shared/messageFormatter.js";
import { SchemaGenerator } from "./shared/schemaGenerator.js";
import { findYamlConfig } from "./config/yamlConfig.js";
import {
  validateCollectionsTablesConfig,
  reportValidationResults,
  validateWithStrictMode,
  type ValidationResult
} from "./config/configValidation.js";

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
  public adapter?: DatabaseAdapter;
  public converterDefinitions: ConverterFunctions = converterFunctions;
  public validityRuleDefinitions: ValidationRules = validationRules;
  public afterImportActionsDefinitions: AfterImportActions = afterImportActions;

  // Session preservation fields
  private sessionCookie?: string;
  private authMethod?: "session" | "apikey" | "auto";
  private sessionMetadata?: {
    email?: string;
    expiresAt?: string;
  };

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
        MessageFormatter.error("Appwrite endpoint is required", undefined, { prefix: "Config" });
        hasErrors = true;
      }
      if (!directConfig.appwriteProject) {
        MessageFormatter.error("Appwrite project is required", undefined, { prefix: "Config" });
        hasErrors = true;
      }
      // Check authentication: either API key or session auth is required
      const hasValidSession = directConfig.appwriteEndpoint && directConfig.appwriteProject &&
        hasSessionAuth(directConfig.appwriteEndpoint, directConfig.appwriteProject);

      if (!directConfig.appwriteKey && !hasValidSession) {
        MessageFormatter.error(
          "Authentication required: provide an API key or login with 'appwrite login'",
          undefined,
          { prefix: "Config" }
        );
        hasErrors = true;
      } else if (!directConfig.appwriteKey && hasValidSession) {
        MessageFormatter.info("Using session authentication (no API key required)", { prefix: "Auth" });
      } else if (directConfig.appwriteKey && hasValidSession) {
        MessageFormatter.info("API key provided, session authentication also available", { prefix: "Auth" });
      }
      if (!hasErrors) {
        // Only set config if we have all required fields
        this.appwriteFolderPath = basePath;
        this.config = {
          appwriteEndpoint: directConfig.appwriteEndpoint!,
          appwriteProject: directConfig.appwriteProject!,
          appwriteKey: directConfig.appwriteKey || "",
          appwriteClient: null,
          apiMode: "auto", // Default to auto-detect for dual API support
          authMethod: "auto", // Default to auto-detect authentication method
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
          logging: {
            enabled: false,
            level: "info",
            console: false,
          },
        };
      }
    } else {
      // Try to find config file
      const appwriteConfigFound = findAppwriteConfig(basePath);
      if (!appwriteConfigFound) {
        MessageFormatter.warning(
          "No appwriteConfig.ts found and no direct configuration provided",
          { prefix: "Config" }
        );
        return;
      }
      this.appwriteConfigPath = appwriteConfigFound;
      this.appwriteFolderPath = appwriteConfigFound; // For YAML configs, findAppwriteConfig already returns the correct directory
    }
  }

  async init(options: { validate?: boolean; strictMode?: boolean; useSession?: boolean; sessionCookie?: string } = {}) {
    const { validate = false, strictMode = false, useSession = false, sessionCookie } = options;

    if (!this.config) {
      if (this.appwriteFolderPath && this.appwriteConfigPath) {
        MessageFormatter.progress("Loading config from file...", { prefix: "Config" });
        try {
          const { config, actualConfigPath, validation } = await loadConfigWithPath(
            this.appwriteFolderPath,
            { validate, strictMode, reportValidation: false }
          );
          this.config = config;
          MessageFormatter.info(`Loaded config from: ${actualConfigPath}`, { prefix: "Config" });

          // Report validation results if validation was requested
          if (validation && validate) {
            reportValidationResults(validation, { verbose: false });

            // In strict mode, throw if validation fails
            if (strictMode && !validation.isValid) {
              throw new Error(`Configuration validation failed in strict mode. Found ${validation.errors.length} validation errors.`);
            }
          }
        } catch (error) {
          MessageFormatter.error("Failed to load config from file", error instanceof Error ? error : undefined, { prefix: "Config" });
          return;
        }
      } else {
        MessageFormatter.error("No configuration available", undefined, { prefix: "Config" });
        return;
      }
    }

    // Configure logging based on config
    if (this.config.logging) {
      configureLogging(this.config.logging);
      updateLogger();
    }

    // Use enhanced client with session authentication support
    // Pass session cookie from options if provided
    const clientSessionCookie = sessionCookie || this.sessionCookie;
    this.appwriteServer = getClientWithAuth(
      this.config.appwriteEndpoint,
      this.config.appwriteProject,
      this.config.appwriteKey || undefined,
      clientSessionCookie
    );

    this.database = new Databases(this.appwriteServer);
    this.storage = new Storage(this.appwriteServer);
    this.config.appwriteClient = this.appwriteServer;

    // Initialize adapter with version detection
    try {
      const { adapter, apiMode } = await getAdapterFromConfig(
        this.config,
        false,
        clientSessionCookie
      );
      this.adapter = adapter;

      MessageFormatter.info(`Database adapter initialized (apiMode: ${apiMode})`, {
        prefix: "Adapter"
      });
    } catch (error) {
      MessageFormatter.warning(
        'Database adapter initialization failed - some features may not work',
        { prefix: "Adapter" }
      );
    }

    // Extract and store session information after successful authentication
    this.extractSessionInfo();
  }

  async reloadConfig() {
    if (!this.appwriteFolderPath) {
      MessageFormatter.error("Failed to get appwriteFolderPath", undefined, { prefix: "Controller" });
      return;
    }

    // Preserve session authentication during config reload
    const preserveAuth = this.createSessionPreservationOptions();

    this.config = await loadConfig(this.appwriteFolderPath, {
      preserveAuth
    });
    if (!this.config) {
      MessageFormatter.error("Failed to load config", undefined, { prefix: "Controller" });
      return;
    }

    // Configure logging based on updated config
    if (this.config.logging) {
      configureLogging(this.config.logging);
      updateLogger();
    }

    // Use enhanced client with session authentication support, passing preserved session
    this.appwriteServer = getClientWithAuth(
      this.config.appwriteEndpoint,
      this.config.appwriteProject,
      this.config.appwriteKey || undefined,
      this.sessionCookie
    );
    this.database = new Databases(this.appwriteServer);
    this.storage = new Storage(this.appwriteServer);
    this.config.appwriteClient = this.appwriteServer;

    // Re-initialize adapter with version detection after config reload
    try {
      const { adapter, apiMode } = await getAdapterFromConfig(
        this.config,
        false,
        this.sessionCookie
      );
      this.adapter = adapter;

      MessageFormatter.info(`Database adapter re-initialized (apiMode: ${apiMode})`, {
        prefix: "Adapter"
      });
    } catch (error) {
      MessageFormatter.warning(
        'Database adapter re-initialization failed - some features may not work',
        { prefix: "Adapter" }
      );
    }

    // Re-extract session information after reload
    this.extractSessionInfo();
  }


  async ensureDatabaseConfigBucketsExist(databases: Models.Database[] = []) {
    await this.init();
    if (!this.storage) {
      MessageFormatter.error("Storage not initialized", undefined, { prefix: "Controller" });
      return;
    }
    if (!this.config) {
      MessageFormatter.error("Config not initialized", undefined, { prefix: "Controller" });
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
      MessageFormatter.error("Config not initialized", undefined, { prefix: "Controller" });
      return;
    }
    await this.ensureDatabaseConfigBucketsExist(databases);
    await ensureDatabasesExist(this.config, databases);
  }

  async ensureCollectionsExist(
    database: Models.Database,
    collections?: Models.Collection[]
  ) {
    await this.init();
    if (!this.config) {
      MessageFormatter.error("Config not initialized", undefined, { prefix: "Controller" });
      return;
    }
    await ensureCollectionsExist(this.config, database, collections);
  }

  async getDatabasesByIds(ids: string[]) {
    await this.init();
    if (!this.database) {
      MessageFormatter.error("Database not initialized", undefined, { prefix: "Controller" });
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
      MessageFormatter.error("Database not initialized", undefined, { prefix: "Controller" });
      return;
    }
    await wipeOtherDatabases(this.database, databasesToKeep);
  }

  async wipeUsers() {
    await this.init();
    if (!this.config || !this.database) {
      MessageFormatter.error("Config or database not initialized", undefined, { prefix: "Controller" });
      return;
    }
    const usersController = new UsersController(this.config, this.database);
    await usersController.wipeUsers();
  }

  async backupDatabase(database: Models.Database, format: 'json' | 'zip' = 'json') {
    await this.init();
    if (!this.database || !this.storage || !this.config) {
      MessageFormatter.error("Database, storage, or config not initialized", undefined, { prefix: "Controller" });
      return;
    }
    await backupDatabase(
      this.config,
      this.database,
      database.$id,
      this.storage,
      format
    );
  }

  async listAllFunctions() {
    await this.init();
    if (!this.appwriteServer) {
      MessageFormatter.error("Appwrite server not initialized", undefined, { prefix: "Controller" });
      return [];
    }
    const { functions } = await listFunctions(this.appwriteServer, [
      Query.limit(1000),
    ]);
    return functions;
  }

  async findFunctionDirectories() {
    if (!this.appwriteFolderPath) {
      MessageFormatter.error("Failed to get appwriteFolderPath", undefined, { prefix: "Controller" });
      return new Map();
    }
    const functionsDir = findFunctionsDir(this.appwriteFolderPath);
    if (!functionsDir) {
      MessageFormatter.error("Failed to find functions directory", undefined, { prefix: "Controller" });
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
      MessageFormatter.error("Appwrite server not initialized", undefined, { prefix: "Controller" });
      return;
    }

    if (!functionConfig) {
      functionConfig = this.config?.functions?.find(
        (f) => f.name === functionName
      );
    }
    if (!functionConfig) {
      MessageFormatter.error(`Function ${functionName} not found in config`, undefined, { prefix: "Controller" });
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
      MessageFormatter.error("Appwrite server not initialized", undefined, { prefix: "Controller" });
      return;
    }

    const localFunctions = this.config?.functions || [];
    const remoteFunctions = await listFunctions(this.appwriteServer, [
      Query.limit(1000),
    ]);

    for (const localFunction of localFunctions) {
      MessageFormatter.progress(`Syncing function ${localFunction.name}...`, { prefix: "Functions" });
      await this.deployFunction(localFunction.name);
    }

    MessageFormatter.success("All functions synchronized successfully!", { prefix: "Functions" });
  }

  async wipeDatabase(database: Models.Database, wipeBucket: boolean = false) {
    await this.init();
    if (!this.database || !this.config) throw new Error("Database not initialized");
    try {
      const { adapter, apiMode } = await getAdapterFromConfig(this.config, false, this.sessionCookie);
      if (apiMode === 'tablesdb') {
        await wipeAllTables(adapter, database.$id);
      } else {
        await wipeDatabase(this.database, database.$id);
      }
    } catch {
      await wipeDatabase(this.database, database.$id);
    }
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
    if (!this.database || !this.config) throw new Error("Database not initialized");
    try {
      const { adapter, apiMode } = await getAdapterFromConfig(this.config, false, this.sessionCookie);
      if (apiMode === 'tablesdb') {
        await wipeTableRows(adapter, database.$id, collection.$id);
      } else {
        await wipeCollection(this.database, database.$id, collection.$id);
      }
    } catch {
      await wipeCollection(this.database, database.$id, collection.$id);
    }
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
    // Schema generation doesn't need Appwrite connection, just config
    if (!this.config) {
      if (this.appwriteFolderPath && this.appwriteConfigPath) {
        MessageFormatter.progress("Loading config from file...", { prefix: "Config" });
        try {
          const { config, actualConfigPath } = await loadConfigWithPath(
            this.appwriteFolderPath,
            { validate: false, strictMode: false, reportValidation: false }
          );
          this.config = config;
          MessageFormatter.info(`Loaded config from: ${actualConfigPath}`, { prefix: "Config" });
        } catch (error) {
          MessageFormatter.error("Failed to load config from file", error instanceof Error ? error : undefined, { prefix: "Config" });
          return;
        }
      } else {
        MessageFormatter.error("No configuration available", undefined, { prefix: "Controller" });
        return;
      }
    }
    if (!this.appwriteFolderPath) {
      MessageFormatter.error("Failed to get appwriteFolderPath", undefined, { prefix: "Controller" });
      return;
    }
    await generateSchemas(this.config, this.appwriteFolderPath);
  }

  async importData(options: SetupOptions = {}) {
    await this.init();
    if (!this.database) {
      MessageFormatter.error("Database not initialized", undefined, { prefix: "Controller" });
      return;
    }
    if (!this.storage) {
      MessageFormatter.error("Storage not initialized", undefined, { prefix: "Controller" });
      return;
    }
    if (!this.config) {
      MessageFormatter.error("Config not initialized", undefined, { prefix: "Controller" });
      return;
    }
    if (!this.appwriteFolderPath) {
      MessageFormatter.error("Failed to get appwriteFolderPath", undefined, { prefix: "Controller" });
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
      MessageFormatter.error("Storage not initialized", undefined, { prefix: "Controller" });
      return;
    }
    const configToUse = config || this.config;
    if (!configToUse) {
      MessageFormatter.error("Config not initialized", undefined, { prefix: "Controller" });
      return;
    }
    if (!this.appwriteFolderPath) {
      MessageFormatter.error("Failed to get appwriteFolderPath", undefined, { prefix: "Controller" });
      return;
    }
    const appwriteToX = new AppwriteToX(
      configToUse,
      this.appwriteFolderPath,
      this.storage
    );
    await appwriteToX.toSchemas(databases);
    
    // Update the controller's config with the synchronized collections
    this.config = appwriteToX.updatedConfig;
    
    // Write the updated config back to disk
    const generator = new SchemaGenerator(this.config, this.appwriteFolderPath);
    const yamlConfigPath = findYamlConfig(this.appwriteFolderPath);
    const isYamlProject = !!yamlConfigPath;
    await generator.updateConfig(this.config, isYamlProject);
  }

  async syncDb(
    databases: Models.Database[] = [],
    collections: Models.Collection[] = []
  ) {
    await this.init();
    if (!this.database) {
      MessageFormatter.error("Database not initialized", undefined, { prefix: "Controller" });
      return;
    }
    if (databases.length === 0) {
      const allDatabases = await fetchAllDatabases(this.database);
      databases = allDatabases;
    }
    // Ensure DBs exist
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
      MessageFormatter.error("Source database not initialized", undefined, { prefix: "Controller" });
      return;
    }

    if (options.isRemote) {
      if (
        !options.transferEndpoint ||
        !options.transferProject ||
        !options.transferKey
      ) {
        MessageFormatter.error("Remote transfer options are missing", undefined, { prefix: "Controller" });
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
        MessageFormatter.error("Source or target database not found", undefined, { prefix: "Controller" });
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
        MessageFormatter.warning(
          "User transfer is only supported for remote transfers. Skipping...",
          { prefix: "Controller" }
        );
      } else if (!this.appwriteServer) {
        MessageFormatter.error("Appwrite server not initialized", undefined, { prefix: "Controller" });
        return;
      } else {
        MessageFormatter.progress("Starting user transfer...", { prefix: "Transfer" });
        const localUsers = new Users(this.appwriteServer);
        await transferUsersLocalToRemote(
          localUsers,
          options.transferEndpoint!,
          options.transferProject!,
          options.transferKey!
        );
        MessageFormatter.success("User transfer completed", { prefix: "Transfer" });
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
        MessageFormatter.progress(
          `Starting storage transfer from ${sourceBucketId} to ${targetBucketId}`,
          { prefix: "Transfer" }
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

    MessageFormatter.success("Transfer completed", { prefix: "Transfer" });
  }

  async updateFunctionSpecifications(
    functionId: string,
    specification: Specification
  ) {
    await this.init();
    if (!this.appwriteServer)
      throw new Error("Appwrite server not initialized");
    MessageFormatter.progress(
      `Updating function specifications for ${functionId} to ${specification}`,
      { prefix: "Functions" }
    );
    await updateFunctionSpecifications(
      this.appwriteServer,
      functionId,
      specification
    );
    MessageFormatter.success(
      `Successfully updated function specifications for ${functionId} to ${specification}`,
      { prefix: "Functions" }
    );
  }

  /**
   * Validates the current configuration for collections/tables conflicts
   */
  async validateConfiguration(strictMode: boolean = false): Promise<ValidationResult> {
    await this.init();
    if (!this.config) {
      throw new Error("Configuration not loaded");
    }

    MessageFormatter.progress("Validating configuration...", { prefix: "Validation" });

    const validation = strictMode
      ? validateWithStrictMode(this.config, strictMode)
      : validateCollectionsTablesConfig(this.config);

    reportValidationResults(validation, { verbose: true });

    if (validation.isValid) {
      MessageFormatter.success("Configuration validation passed", { prefix: "Validation" });
    } else {
      MessageFormatter.error(`Configuration validation failed with ${validation.errors.length} errors`, undefined, { prefix: "Validation" });
    }

    return validation;
  }

  /**
   * Extract session information from the current authenticated client
   * This preserves session context for use across config reloads and adapter operations
   */
  private extractSessionInfo(): void {
    if (!this.config) {
      return;
    }

    // Try to extract session from current config first
    if (this.config.sessionCookie && isValidSessionCookie(this.config.sessionCookie)) {
      this.sessionCookie = this.config.sessionCookie;
      this.authMethod = "session";
      this.sessionMetadata = this.config.sessionMetadata;
      MessageFormatter.debug("Extracted session from config", { prefix: "Session" });
      return;
    }

    // Fall back to finding session from Appwrite CLI preferences
    const sessionAuth = findSessionByEndpointAndProject(
      this.config.appwriteEndpoint,
      this.config.appwriteProject
    );

    if (sessionAuth && isValidSessionCookie(sessionAuth.sessionCookie)) {
      this.sessionCookie = sessionAuth.sessionCookie;
      this.authMethod = "session";
      this.sessionMetadata = {
        email: sessionAuth.email
      };
      MessageFormatter.debug(
        `Extracted session from CLI preferences for ${sessionAuth.email || 'unknown user'}`,
        { prefix: "Session" }
      );
      return;
    }

    // No session found, using API key authentication
    if (this.config.appwriteKey) {
      this.authMethod = "apikey";
      this.sessionCookie = undefined;
      this.sessionMetadata = undefined;
      MessageFormatter.debug("Using API key authentication", { prefix: "Session" });
    }
  }

  /**
   * Create session preservation options for passing to loadConfig
   * Returns current session state to maintain authentication across config reloads
   */
  private createSessionPreservationOptions(): SessionPreservationOptions | undefined {
    if (!this.sessionCookie || !isValidSessionCookie(this.sessionCookie)) {
      return undefined;
    }

    return createSessionPreservation(
      this.sessionCookie,
      this.sessionMetadata?.email,
      this.sessionMetadata?.expiresAt
    );
  }

  /**
   * Get current session information for debugging/logging purposes
   */
  public getSessionInfo(): {
    hasSession: boolean;
    authMethod?: string;
    email?: string;
    expiresAt?: string;
  } {
    return {
      hasSession: !!this.sessionCookie && isValidSessionCookie(this.sessionCookie),
      authMethod: this.authMethod,
      email: this.sessionMetadata?.email,
      expiresAt: this.sessionMetadata?.expiresAt
    };
  }
}
