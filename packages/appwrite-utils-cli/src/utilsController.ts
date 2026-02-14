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
  findAppwriteConfig,
  findFunctionsDir,
} from "./utils/loadConfigs.js";
import { normalizeFunctionName, validateFunctionDirectory } from 'appwrite-utils-helpers';
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
  createOrUpdateCollectionsViaAdapter,
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
import { getClient, getClientWithAuth } from "appwrite-utils-helpers";
import { getAdapterFromConfig } from "appwrite-utils-helpers";
import type { DatabaseAdapter } from 'appwrite-utils-helpers';
import { hasSessionAuth, findSessionByEndpointAndProject, isValidSessionCookie, type SessionAuthInfo } from "appwrite-utils-helpers";
import { fetchAllDatabases } from "./databases/methods.js";
import {
  listFunctions,
  updateFunctionSpecifications,
} from "./functions/methods.js";
import chalk from "chalk";
import { deployLocalFunction } from "./functions/deployments.js";
import fs from "node:fs";
import {
  configureLogging,
  updateLogger,
  logger,
  MessageFormatter,
  Messages,
  SchemaGenerator,
  findYamlConfig,
  validateCollectionsTablesConfig,
  reportValidationResults,
  validateWithStrictMode,
  ConfigManager,
  type ValidationResult
} from "appwrite-utils-helpers";
import { createImportSchemas } from "./migrations/yaml/generateImportSchemas.js";
import { ClientFactory } from "appwrite-utils-helpers";
import type { DatabaseSelection, BucketSelection } from "./shared/selectionDialogs.js";
import { clearProcessingState, processQueue } from "./shared/operationQueue.js";

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

export interface ControllerInitOptions {
  validate?: boolean;
  strictMode?: boolean;
  useSession?: boolean;
  sessionCookie?: string;
  preferJson?: boolean;
  overrides?: {
    appwriteEndpoint?: string;
    appwriteProject?: string;
    appwriteKey?: string;
  };
}

export class UtilsController {
  // ──────────────────────────────────────────────────
  // SINGLETON PATTERN
  // ──────────────────────────────────────────────────
  private static instance: UtilsController | null = null;
  private isInitialized: boolean = false;

  /**
   * Get the UtilsController singleton instance
   */
  public static getInstance(
    currentUserDir: string,
    directConfig?: {
      appwriteEndpoint?: string;
      appwriteProject?: string;
      appwriteKey?: string;
    }
  ): UtilsController {
    // Clear instance if currentUserDir has changed
    if (UtilsController.instance &&
        UtilsController.instance.currentUserDir !== currentUserDir) {
      logger.debug(`Clearing singleton: currentUserDir changed from ${UtilsController.instance.currentUserDir} to ${currentUserDir}`, { prefix: "UtilsController" });
      UtilsController.clearInstance();
    }

    // Clear instance if directConfig endpoint or project has changed
    if (UtilsController.instance && directConfig) {
      const existingConfig = UtilsController.instance.config;
      if (existingConfig) {
        const endpointChanged = directConfig.appwriteEndpoint &&
          existingConfig.appwriteEndpoint !== directConfig.appwriteEndpoint;
        const projectChanged = directConfig.appwriteProject &&
          existingConfig.appwriteProject !== directConfig.appwriteProject;

        if (endpointChanged || projectChanged) {
          logger.debug("Clearing singleton: endpoint or project changed", { prefix: "UtilsController" });
          UtilsController.clearInstance();
        }
      }
    }

    if (!UtilsController.instance) {
      UtilsController.instance = new UtilsController(currentUserDir, directConfig);
    }

    return UtilsController.instance;
  }

  /**
   * Clear the singleton instance (useful for testing)
   */
  public static clearInstance(): void {
    UtilsController.instance = null;
  }

  // ──────────────────────────────────────────────────
  // INSTANCE FIELDS
  // ──────────────────────────────────────────────────
  private appwriteFolderPath?: string;
  private appwriteConfigPath?: string;
  private currentUserDir: string;
  public config?: AppwriteConfig;
  public appwriteServer?: Client;
  public database?: Databases;
  public storage?: Storage;
  public adapter?: DatabaseAdapter;
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
    this.currentUserDir = currentUserDir;
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

  async init(options: ControllerInitOptions = {}) {
    const { validate = false, strictMode = false, preferJson = false, useSession, sessionCookie, overrides } = options;
    const configManager = ConfigManager.getInstance();

    // Load config if not already loaded
    if (!configManager.hasConfig()) {
      await configManager.loadConfig({
        configDir: this.currentUserDir,
        validate,
        strictMode,
        preferJson,
        useSession,
        explicitSessionCookie: sessionCookie,
        overrides,
      });
    }

    const config = configManager.getConfig();

    // Configure logging based on config
    if (config.logging) {
      configureLogging(config.logging);
      updateLogger();
    }

    // Create client and adapter (session already in config from ConfigManager)
    const { client, adapter } = await ClientFactory.createFromConfig(config);

    this.appwriteServer = client;
    this.adapter = adapter;
    this.config = config;

    // Update config.apiMode from adapter if it's auto or not set
    if (adapter && (!config.apiMode || config.apiMode === 'auto')) {
      this.config.apiMode = adapter.getApiMode();
      logger.debug(`Updated config.apiMode from adapter during init: ${this.config.apiMode}`, { prefix: "UtilsController" });
    }

    this.database = new Databases(this.appwriteServer);
    this.storage = new Storage(this.appwriteServer);
    this.config.appwriteClient = this.appwriteServer;

    // Log only on FIRST initialization to avoid spam
    if (!this.isInitialized) {
      const apiMode = adapter.getApiMode();
      const configApiMode = this.config.apiMode;
      MessageFormatter.info(`Database adapter initialized (apiMode: ${apiMode}, config.apiMode: ${configApiMode})`, { prefix: "Adapter" });
      this.isInitialized = true;
    } else {
      logger.debug("Adapter reused from cache", { prefix: "UtilsController" });
    }
  }

  async reloadConfig() {
    const configManager = ConfigManager.getInstance();

    // Session preservation is automatic in ConfigManager
    const config = await configManager.reloadConfig();

    // Configure logging based on updated config
    if (config.logging) {
      configureLogging(config.logging);
      updateLogger();
    }

    // Recreate client and adapter
    const { client, adapter } = await ClientFactory.createFromConfig(config);

    this.appwriteServer = client;
    this.adapter = adapter;
    this.config = config;
    this.database = new Databases(this.appwriteServer);
    this.storage = new Storage(this.appwriteServer);
    this.config.appwriteClient = this.appwriteServer;

    logger.debug("Config reloaded, adapter refreshed", { prefix: "UtilsController" });
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

  async fetchAllBuckets(): Promise<{ buckets: Models.Bucket[] }> {
    await this.init();
    if (!this.storage) {
      MessageFormatter.warning("Storage not initialized - buckets will be empty", { prefix: "Controller" });
      return { buckets: [] };
    }

    try {
      const result = await this.storage.listBuckets([
        Query.limit(1000) // Increase limit to get all buckets
      ]);

      MessageFormatter.success(`Found ${result.buckets.length} buckets`, { prefix: "Controller" });
      return result;
    } catch (error: any) {
      MessageFormatter.error(`Failed to fetch buckets: ${error.message || error}`, error instanceof Error ? error : undefined, { prefix: "Controller" });
      return { buckets: [] };
    }
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

        // Validate it's a function directory
        if (!validateFunctionDirectory(functionPath)) {
          continue; // Skip invalid directories
        }

        // Match with config functions using normalized names
        if (this.config?.functions) {
          const normalizedEntryName = normalizeFunctionName(entry.name);
          const matchingFunc = this.config.functions.find(
            (f) => normalizeFunctionName(f.name) === normalizedEntryName
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
      functionPath,
      this.appwriteFolderPath
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
      // Session is already in config from ConfigManager
      const { adapter, apiMode } = await getAdapterFromConfig(this.config, false);
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
      // Session is already in config from ConfigManager
      const { adapter, apiMode } = await getAdapterFromConfig(this.config, false);
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

    // Ensure apiMode is properly set from adapter
    if (this.adapter && (!this.config.apiMode || this.config.apiMode === 'auto')) {
      this.config.apiMode = this.adapter.getApiMode();
      logger.debug(`Updated config.apiMode from adapter: ${this.config.apiMode}`, { prefix: "UtilsController" });
    }

    // Ensure we don't carry state between databases in a multi-db push
    // This resets processed sets and name->id mapping per database
    try {
      clearProcessingState();
    } catch {}

    // Always prefer adapter path for unified behavior. LegacyAdapter internally translates when needed.
    if (this.adapter) {
      logger.debug("Using adapter for createOrUpdateCollections (unified path)", {
        prefix: "UtilsController",
        apiMode: this.adapter.getApiMode()
      });
      await createOrUpdateCollectionsViaAdapter(
        this.adapter,
        database.$id,
        this.config,
        deletedCollections,
        collections
      );
    } else {
      // Fallback if adapter is unavailable for some reason
      logger.debug("Adapter unavailable, falling back to legacy Databases path", { prefix: "UtilsController" });
      await createOrUpdateCollections(
        this.database,
        database.$id,
        this.config,
        deletedCollections,
        collections
      );
    }

    // Safety net: Process any remaining queued operations to complete relationship sync
    try {
      MessageFormatter.info(`🔄 Processing final operation queue for database ${database.$id}`, { prefix: "UtilsController" });
      await processQueue(this.adapter || this.database!, database.$id);
      MessageFormatter.info(`✅ Operation queue processing completed`, { prefix: "UtilsController" });
    } catch (error) {
      MessageFormatter.error(`Failed to process operation queue`, error instanceof Error ? error : new Error(String(error)), { prefix: 'UtilsController' });
    }
  }

  async generateSchemas() {
    // Schema generation doesn't need Appwrite connection, just config
    if (!this.config) {
      MessageFormatter.progress("Loading config from ConfigManager...", { prefix: "Config" });
      try {
        const configManager = ConfigManager.getInstance();

        // Load config if not already loaded
        if (!configManager.hasConfig()) {
          await configManager.loadConfig({
            configDir: this.currentUserDir,
            validate: false,
            strictMode: false,
          });
        }

        this.config = configManager.getConfig();
        MessageFormatter.info("Config loaded successfully from ConfigManager", { prefix: "Config" });
      } catch (error) {
        MessageFormatter.error("Failed to load config", error instanceof Error ? error : undefined, { prefix: "Config" });
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
    config?: AppwriteConfig,
    databaseSelections?: DatabaseSelection[],
    bucketSelections?: BucketSelection[]
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

    // If selections are provided, filter the databases accordingly
    let filteredDatabases = databases;
    if (databaseSelections && databaseSelections.length > 0) {
      // Convert selections to Models.Database format
      filteredDatabases = [];
      const allDatabases = databases ? databases : await fetchAllDatabases(this.database!);

      for (const selection of databaseSelections) {
        const database = allDatabases.find(db => db.$id === selection.databaseId);
        if (database) {
          filteredDatabases.push(database);
        } else {
          MessageFormatter.warning(`Database with ID ${selection.databaseId} not found`, { prefix: "Controller" });
        }
      }

      MessageFormatter.info(`Syncing ${filteredDatabases.length} selected databases out of ${allDatabases.length} available`, { prefix: "Controller" });
    }

    const appwriteToX = new AppwriteToX(
      configToUse,
      this.appwriteFolderPath,
      this.storage
    );
    await appwriteToX.toSchemas(filteredDatabases);

    // Update the controller's config with the synchronized collections
    this.config = appwriteToX.updatedConfig;

    // Write the updated config back to disk
    const generator = new SchemaGenerator(this.config, this.appwriteFolderPath);
    const yamlConfigPath = findYamlConfig(this.appwriteFolderPath);
    const isYamlProject = !!yamlConfigPath;
    await generator.updateConfig(this.config, isYamlProject);

    // Regenerate JSON schemas to reflect any table terminology fixes
    try {
      MessageFormatter.progress("Regenerating JSON schemas...", { prefix: "Sync" });
      await createImportSchemas(this.appwriteFolderPath);
      MessageFormatter.success("JSON schemas regenerated successfully", { prefix: "Sync" });
    } catch (error) {
      // Log error but don't fail the sync process
      const errorMessage = error instanceof Error ? error.message : String(error);
      MessageFormatter.warning(
        `Failed to regenerate JSON schemas, but sync completed: ${errorMessage}`,
        { prefix: "Sync" }
      );
      logger.warn("Schema regeneration failed during sync:", error);
    }
  }

  async selectivePull(
    databaseSelections: DatabaseSelection[],
    bucketSelections: BucketSelection[]
  ): Promise<void> {
    await this.init();
    if (!this.database) {
      MessageFormatter.error("Database not initialized", undefined, { prefix: "Controller" });
      return;
    }

    MessageFormatter.progress("Starting selective pull (Appwrite → local config)...", { prefix: "Controller" });

    // Convert database selections to Models.Database format
    const selectedDatabases: Models.Database[] = [];

    for (const dbSelection of databaseSelections) {
      // Get the full database object from the controller
      const databases = await fetchAllDatabases(this.database);
      const database = databases.find(db => db.$id === dbSelection.databaseId);

      if (database) {
        selectedDatabases.push(database);
        MessageFormatter.info(`Selected database: ${database.name} (${database.$id})`, { prefix: "Controller" });

        // Log selected tables for this database
        if (dbSelection.tableIds && dbSelection.tableIds.length > 0) {
          MessageFormatter.info(`  Tables: ${dbSelection.tableIds.join(', ')}`, { prefix: "Controller" });
        }
      } else {
        MessageFormatter.warning(`Database with ID ${dbSelection.databaseId} not found`, { prefix: "Controller" });
      }
    }

    if (selectedDatabases.length === 0) {
      MessageFormatter.warning("No valid databases selected for pull", { prefix: "Controller" });
      return;
    }

    // Log bucket selections if provided
    if (bucketSelections && bucketSelections.length > 0) {
      MessageFormatter.info(`Selected ${bucketSelections.length} buckets:`, { prefix: "Controller" });
      for (const bucketSelection of bucketSelections) {
        const dbInfo = bucketSelection.databaseId ? ` (DB: ${bucketSelection.databaseId})` : '';
        MessageFormatter.info(`  - ${bucketSelection.bucketName} (${bucketSelection.bucketId})${dbInfo}`, { prefix: "Controller" });
      }
    }

    // Perform selective sync using the enhanced synchronizeConfigurations method
    await this.synchronizeConfigurations(selectedDatabases, this.config, databaseSelections, bucketSelections);

    MessageFormatter.success("Selective pull completed successfully! Remote config pulled to local.", { prefix: "Controller" });
  }

  async selectivePush(
    databaseSelections: DatabaseSelection[],
    bucketSelections: BucketSelection[]
  ): Promise<void> {
    await this.init();
    if (!this.database) {
      MessageFormatter.error("Database not initialized", undefined, { prefix: "Controller" });
      return;
    }

    // Always reload config from disk so pushes use current local YAML/Ts definitions
    try {
      await this.reloadConfig();
      MessageFormatter.info("Reloaded config from disk for push", { prefix: "Controller" });
    } catch (e) {
      // Non-fatal; continue with existing config
      MessageFormatter.warning("Could not reload config; continuing with current in-memory config", { prefix: "Controller" });
    }

    MessageFormatter.progress("Starting selective push (local config → Appwrite)...", { prefix: "Controller" });

    // Convert database selections to Models.Database format
    const selectedDatabases: Models.Database[] = [];
    const serverDatabases = await fetchAllDatabases(this.database);
    const configuredDatabases = this.config?.databases || [];

    for (const dbSelection of databaseSelections) {
      // First try to find on server
      const serverDb = serverDatabases.find(db => db.$id === dbSelection.databaseId);

      if (serverDb) {
        selectedDatabases.push(serverDb);
        MessageFormatter.info(`Selected database: ${serverDb.name} (${serverDb.$id})`, { prefix: "Controller" });
      } else {
        // Database doesn't exist on server - check if it's in local config
        const configDb = configuredDatabases.find((db: any) => db.$id === dbSelection.databaseId);

        if (configDb) {
          // Create a pseudo-database object that ensureDatabasesExist will create
          const dbId = configDb.$id;
          selectedDatabases.push({
            $id: dbId,
            name: configDb.name || dbId,
            $createdAt: new Date().toISOString(),
            $updatedAt: new Date().toISOString(),
            enabled: true,
          } as Models.Database);
          MessageFormatter.info(`Selected database: ${configDb.name || dbId} (${dbId}) [will be created]`, { prefix: "Controller" });
        } else {
          MessageFormatter.warning(`Database with ID ${dbSelection.databaseId} not found in server or local config`, { prefix: "Controller" });
          continue;
        }
      }

      // Log selected tables for this database
      if (dbSelection.tableIds && dbSelection.tableIds.length > 0) {
        MessageFormatter.info(`  Tables: ${dbSelection.tableIds.join(', ')}`, { prefix: "Controller" });
      }
    }

    if (selectedDatabases.length === 0) {
      MessageFormatter.warning("No valid databases selected for push", { prefix: "Controller" });
      return;
    }

    // Log bucket selections if provided
    if (bucketSelections && bucketSelections.length > 0) {
      MessageFormatter.info(`Selected ${bucketSelections.length} buckets:`, { prefix: "Controller" });
      for (const bucketSelection of bucketSelections) {
        const dbInfo = bucketSelection.databaseId ? ` (DB: ${bucketSelection.databaseId})` : '';
        MessageFormatter.info(`  - ${bucketSelection.bucketName} (${bucketSelection.bucketId})${dbInfo}`, { prefix: "Controller" });
      }
    }

    // PUSH OPERATION: Push local configuration to Appwrite
    // Build database-specific collection mappings from databaseSelections
    const databaseCollectionsMap = new Map<string, any[]>();

    // Get all collections/tables from config (they're at the root level, not nested in databases)
    const allCollections = [
      ...(this.config?.collections || []),
      ...(this.config?.tables || [])
    ];

    // Create database-specific collection mapping to preserve relationships
    for (const dbSelection of databaseSelections) {
      const collectionsForDatabase: any[] = [];

      MessageFormatter.info(`Processing collections for database: ${dbSelection.databaseId}`, { prefix: "Controller" });

      // Filter collections that were selected for THIS specific database
      for (const collection of allCollections) {
        const collectionId = collection.$id || (collection as any).id;

        // Check if this collection was selected for THIS database
        if (dbSelection.tableIds.includes(collectionId)) {
          collectionsForDatabase.push(collection);
          const source = (collection as any)._isFromTablesDir ? 'tables/' : 'collections/';
          MessageFormatter.info(`  - Selected collection: ${collection.name || collectionId} for database ${dbSelection.databaseId} [source: ${source}]`, { prefix: "Controller" });
        }
      }

      databaseCollectionsMap.set(dbSelection.databaseId, collectionsForDatabase);
      MessageFormatter.info(`Database ${dbSelection.databaseId}: ${collectionsForDatabase.length} collections selected`, { prefix: "Controller" });
    }

    // Calculate total collections for logging
    const totalSelectedCollections = Array.from(databaseCollectionsMap.values())
      .reduce((total, collections) => total + collections.length, 0);

    MessageFormatter.info(`Pushing ${totalSelectedCollections} selected tables/collections to ${databaseCollectionsMap.size} databases`, { prefix: "Controller" });

    // Ensure databases exist
    await this.ensureDatabasesExist(selectedDatabases);
    await this.ensureDatabaseConfigBucketsExist(selectedDatabases);

    // Create/update collections with database-specific context
    for (const database of selectedDatabases) {
      const collectionsForThisDatabase = databaseCollectionsMap.get(database.$id) || [];
      if (collectionsForThisDatabase.length > 0) {
        MessageFormatter.info(`Pushing ${collectionsForThisDatabase.length} collections to database ${database.$id} (${database.name})`, { prefix: "Controller" });
        await this.createOrUpdateCollections(database, undefined, collectionsForThisDatabase);
      } else {
        MessageFormatter.info(`No collections selected for database ${database.$id} (${database.name})`, { prefix: "Controller" });
      }
    }

    MessageFormatter.success("Selective push completed successfully! Local config pushed to Appwrite.", { prefix: "Controller" });
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
          targetDb.$id,
          options.collections
        );
      } else {
        await transferDatabaseLocalToLocal(
          sourceClient,
          fromDb.$id,
          targetDb.$id,
          options.collections,
          this.adapter
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
   * Get current session information for debugging/logging purposes
   * Delegates to ConfigManager for session info
   */
  public async getSessionInfo(): Promise<{
    hasSession: boolean;
    authMethod?: string;
    email?: string;
    expiresAt?: string;
  }> {
    const configManager = ConfigManager.getInstance();

    try {
      const authStatus = await configManager.getAuthStatus();
      return {
        hasSession: authStatus.hasValidSession,
        authMethod: authStatus.authMethod,
        email: authStatus.sessionInfo?.email,
        expiresAt: authStatus.sessionInfo?.expiresAt
      };
    } catch (error) {
      // If config not loaded, return empty status
      return {
        hasSession: false
      };
    }
  }
}
