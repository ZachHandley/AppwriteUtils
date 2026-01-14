import inquirer from "inquirer";
import { UtilsController } from "./utilsController.js";
import { fetchAllCollections } from "./collections/methods.js";
import { listBuckets, createBucket } from "./storage/methods.js";
import {
  Databases,
  Storage,
  Client,
  type Models,
  Compression,
  Query,
  Functions,
  DatabaseType,
} from "node-appwrite";
import {
  PermissionToAppwritePermission,
  RuntimeSchema,
  permissionSchema,
  type AppwriteConfig,
  type AppwriteFunction,
  type ConfigDatabases,
  type Runtime,
  type Specification,
  type FunctionScope,
} from "appwrite-utils";
import { ulid } from "ulidx";
import chalk from "chalk";
import { DateTime } from "luxon";
import {
  getFunction,
  downloadLatestFunctionDeployment,
  listFunctions,
} from "./functions/methods.js";
import { join } from "node:path";
import path from "path";
import fs from "node:fs";
import os from "node:os";
import { MessageFormatter, findYamlConfig } from "appwrite-utils-helpers";
import { findAppwriteConfig } from "./utils/loadConfigs.js";

// Import command modules
import { configCommands } from "./cli/commands/configCommands.js";
import { databaseCommands } from "./cli/commands/databaseCommands.js";
import { functionCommands } from "./cli/commands/functionCommands.js";
import { storageCommands } from "./cli/commands/storageCommands.js";
import { transferCommands } from "./cli/commands/transferCommands.js";
import { schemaCommands } from "./cli/commands/schemaCommands.js";

enum CHOICES {
  MIGRATE_CONFIG = "🔄 Migrate TypeScript config to YAML (.appwrite structure)",
  VALIDATE_CONFIG = "✅ Validate configuration (collections/tables conflicts)",
  MIGRATE_COLLECTIONS_TO_TABLES = "🔀 Migrate collections to tables format",
  CREATE_COLLECTION_CONFIG = "📄 Create collection config file",
  CREATE_FUNCTION = "⚡ Create a new function, from scratch or using a template",
  DEPLOY_FUNCTION = "🚀 Deploy function(s)",
  DELETE_FUNCTION = "🗑️ Delete function",
  SETUP_DIRS_FILES = "📁 Setup directories and files",
  SETUP_DIRS_FILES_WITH_EXAMPLE_DATA = "📁✨ Setup directories and files with example data",
  SYNC_DB = "⬆️ Push local config to Appwrite",
  SYNCHRONIZE_CONFIGURATIONS = "🔄 Synchronize configurations - Pull from Appwrite and write to local config",
  TRANSFER_DATA = "📦 Transfer data",
  COMPREHENSIVE_TRANSFER = "🚀 Comprehensive transfer (users → databases → buckets → functions)",
  BACKUP_DATABASE = "💾 Backup database",
  WIPE_DATABASE = "🧹 Wipe database",
  WIPE_COLLECTIONS = "🧹 Wipe collections",
  GENERATE_SCHEMAS = "🏗️ Generate schemas",
  GENERATE_CONSTANTS = "📋 Generate cross-language constants (TypeScript, Python, PHP, Dart, etc.)",
  IMPORT_DATA = "📥 Import data",
  RELOAD_CONFIG = "🔄 Reload configuration files",
  UPDATE_FUNCTION_SPEC = "⚙️ Update function specifications",
  MANAGE_BUCKETS = "🪣 Manage storage buckets",
  EXIT = "👋 Exit",
}

export interface InteractiveCLIOptions {
  useSession?: boolean;
  sessionCookie?: string;
}

export class InteractiveCLI {
  private controller: UtilsController | undefined;
  private isUsingTypeScriptConfig: boolean = false;
  private lastSelectedCollectionIds: string[] = [];
  private options: InteractiveCLIOptions;

  constructor(private currentDir: string, options: InteractiveCLIOptions = {}) {
    this.options = options;
  }

  async run(): Promise<void> {
    MessageFormatter.banner(
      "Appwrite Utils CLI",
      "Welcome to Appwrite Utils CLI Tool by Zach Handley"
    );
    MessageFormatter.info(
      "For more information, visit https://github.com/zachhandley/AppwriteUtils"
    );

    // Detect configuration type
    try {
      await this.detectConfigurationType();
    } catch (error) {
      // Continue if detection fails
      this.isUsingTypeScriptConfig = false;
    }

    while (true) {
      // Build choices array dynamically based on config type
      const choices = this.buildChoicesList();
      
      const { action } = await inquirer.prompt([
        {
          type: "list",
          name: "action",
          message: chalk.yellow("What would you like to do?"),
          choices,
        },
      ]);

      switch (action) {
        case CHOICES.MIGRATE_CONFIG:
          await configCommands.migrateTypeScriptConfig(this);
          break;
        case CHOICES.VALIDATE_CONFIG:
          await configCommands.validateConfiguration(this);
          break;
        case CHOICES.MIGRATE_COLLECTIONS_TO_TABLES:
          await configCommands.migrateCollectionsToTables(this);
          break;
        case CHOICES.CREATE_COLLECTION_CONFIG:
          await configCommands.createCollectionConfig(this);
          break;
        case CHOICES.CREATE_FUNCTION:
          await this.initControllerIfNeeded();
          await functionCommands.createFunction(this);
          break;
        case CHOICES.DEPLOY_FUNCTION:
          await this.initControllerIfNeeded();
          await functionCommands.deployFunction(this);
          break;
        case CHOICES.DELETE_FUNCTION:
          await this.initControllerIfNeeded();
          await functionCommands.deleteFunction(this);
          break;
        case CHOICES.SETUP_DIRS_FILES:
          await schemaCommands.setupDirsFiles(this, false);
          break;
        case CHOICES.SETUP_DIRS_FILES_WITH_EXAMPLE_DATA:
          await schemaCommands.setupDirsFiles(this, true);
          break;
        case CHOICES.SYNCHRONIZE_CONFIGURATIONS:
          await this.initControllerIfNeeded();
          await databaseCommands.synchronizeConfigurations(this);
          break;
        case CHOICES.SYNC_DB:
          await this.initControllerIfNeeded();
          await databaseCommands.syncDb(this);
          break;
        case CHOICES.TRANSFER_DATA:
          await this.initControllerIfNeeded();
          await transferCommands.transferData(this);
          break;
        case CHOICES.COMPREHENSIVE_TRANSFER:
          await transferCommands.comprehensiveTransfer(this);
          break;
        case CHOICES.BACKUP_DATABASE:
          await this.initControllerIfNeeded();
          await databaseCommands.backupDatabase(this);
          break;
        case CHOICES.WIPE_DATABASE:
          await this.initControllerIfNeeded();
          await databaseCommands.wipeDatabase(this);
          break;
        case CHOICES.WIPE_COLLECTIONS:
          await this.initControllerIfNeeded();
          await databaseCommands.wipeCollections(this);
          break;
        case CHOICES.GENERATE_SCHEMAS:
          await this.initControllerIfNeeded();
          await schemaCommands.generateSchemas(this);
          break;
        case CHOICES.GENERATE_CONSTANTS:
          await this.initControllerIfNeeded();
          await schemaCommands.generateConstants(this);
          break;
        case CHOICES.IMPORT_DATA:
          await this.initControllerIfNeeded();
          await schemaCommands.importData(this);
          break;
        case CHOICES.RELOAD_CONFIG:
          await configCommands.reloadConfigWithSessionPreservation(this);
          break;
        case CHOICES.UPDATE_FUNCTION_SPEC:
          await this.initControllerIfNeeded();
          await functionCommands.updateFunctionSpec(this);
          break;
        case CHOICES.MANAGE_BUCKETS:
          await this.manageBuckets();
          break;
        case CHOICES.EXIT:
          MessageFormatter.success("Goodbye!");
          process.exit(0);
      }
    }
  }

  private async initControllerIfNeeded(directConfig?: {
    appwriteEndpoint: string;
    appwriteProject: string;
    appwriteKey: string;
  }): Promise<void> {
    if (!this.controller) {
      this.controller = UtilsController.getInstance(this.currentDir, directConfig);
      await this.controller.init({
        useSession: this.options.useSession,
        sessionCookie: this.options.sessionCookie
      });
    } else {
      // Extract session info from existing controller before reinitializing
      const sessionInfo = await this.controller.getSessionInfo();
      if (sessionInfo.hasSession && directConfig) {
        // Create enhanced directConfig with session preservation
        const enhancedDirectConfig = {
          ...directConfig,
          sessionCookie: (this.controller as any).sessionCookie,
          sessionMetadata: (this.controller as any).sessionMetadata
        };

        // Reinitialize with session preservation
        UtilsController.clearInstance();
        this.controller = UtilsController.getInstance(this.currentDir, enhancedDirectConfig);
        await this.controller.init({
          useSession: this.options.useSession,
          sessionCookie: this.options.sessionCookie
        });
      } else if (directConfig) {
        // Standard reinitialize without session
        UtilsController.clearInstance();
        this.controller = UtilsController.getInstance(this.currentDir, directConfig);
        await this.controller.init({
          useSession: this.options.useSession,
          sessionCookie: this.options.sessionCookie
        });
      }
      // If no directConfig provided, keep existing controller
    }
  }

  private async manageBuckets(): Promise<void> {
    await this.initControllerIfNeeded();
    while (true) {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: chalk.blue('Bucket management'),
          choices: [
            { name: 'Create bucket', value: 'create' },
            { name: 'Delete buckets', value: 'delete' },
            { name: 'Back', value: 'back' },
          ],
        },
      ]);

      if (action === 'back') break;
      if (action === 'create') {
        await storageCommands.createBucket(this);
      } else if (action === 'delete') {
        await storageCommands.deleteBuckets(this);
      }
    }
  }

  private async selectDatabases(
    databases: Models.Database[],
    message: string,
    multiSelect = true
  ): Promise<Models.Database[]> {
    await this.initControllerIfNeeded();
    const configDatabases = this.getLocalDatabases();
    const allDatabases = [...databases, ...configDatabases]
      .reduce((acc, db) => {
        // Local config takes precedence - if a database with same name or ID exists, use local version
        const existingIndex = acc.findIndex((d) => d.name === db.name || d.$id === db.$id);
        if (existingIndex >= 0) {
          if (configDatabases.some((cdb) => cdb.name === db.name || cdb.$id === db.$id)) {
            acc[existingIndex] = db; // Replace with local version
          }
        } else {
          acc.push(db);
        }
        return acc;
      }, [] as Models.Database[]);

    const hasLocalAndRemote =
      allDatabases.some((db) =>
        configDatabases.some((c) => c.name === db.name || c.$id === db.$id)
      ) &&
      allDatabases.some(
        (db) => !configDatabases.some((c) => c.name === db.name || c.$id === db.$id)
      );

    const choices = allDatabases
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((db) => ({
        name:
          db.name +
          (hasLocalAndRemote
            ? configDatabases.some((c) => c.name === db.name || c.$id === db.$id)
              ? " (Local)"
              : " (Remote)"
            : ""),
        value: db,
      }));

    const { selectedDatabases } = await inquirer.prompt([
      {
        type: multiSelect ? "checkbox" : "list",
        name: "selectedDatabases",
        message: chalk.blue(message),
        choices,
        loop: true,
        pageSize: 10,
      },
    ]);

    return selectedDatabases;
  }

  private async selectCollections(
    database: Models.Database,
    databasesClient: Databases,
    message: string,
    multiSelect = true,
    preferLocal = false,
    shouldFilterByDatabase = false
  ): Promise<Models.Collection[]> {
    await this.initControllerIfNeeded();

    const configCollections = this.getLocalCollections();
    let remoteCollections: Models.Collection[] = [];

    const dbExists = await databasesClient.list([
      Query.equal("name", database.name),
    ]);
    if (dbExists.total === 0) {
      MessageFormatter.warning(
        `Database "${database.name}" does not exist, using only local collection/table options`,
        { prefix: "Database" }
      );
      shouldFilterByDatabase = false;
    } else {
      remoteCollections = await fetchAllCollections(
        database.$id,
        databasesClient
      );
    }

    let allCollections = preferLocal
      ? remoteCollections.reduce(
          (acc, remoteCollection) => {
            if (!acc.some((c) => c.name === remoteCollection.name || c.$id === remoteCollection.$id)) {
              acc.push(remoteCollection);
            }
            return acc;
          },
          [...configCollections]
        )
      : [
          ...remoteCollections,
          ...configCollections.filter(
            (c) => !remoteCollections.some((rc) => rc.name === c.name || rc.$id === c.$id)
          ),
        ];

    if (shouldFilterByDatabase) {
      // Show collections that EITHER exist in the remote database OR have matching local databaseId metadata
      allCollections = allCollections.filter((c: any) => {
        // Include if it exists remotely in this database
        const existsInRemoteDb = remoteCollections.some((rc) => rc.name === c.name || rc.$id === c.$id);

        // Include if local metadata claims it belongs to this database
        const hasMatchingLocalMetadata = c.databaseId === database.$id;

        return existsInRemoteDb || hasMatchingLocalMetadata;
      });
    }

    // Filter out system tables (those starting with underscore)
    allCollections = allCollections.filter(
      (collection) => !collection.$id.startsWith('_')
    );

    const hasLocalAndRemote =
      allCollections.some((coll) =>
        configCollections.some((c) => c.name === coll.name || c.$id === coll.$id)
      ) &&
      allCollections.some(
        (coll) => !configCollections.some((c) => c.name === coll.name || c.$id === coll.$id)
      );

    const getCollectionId = (collection: Models.Collection) => collection.$id || collection.name;
    const localCollectionIds = new Set(configCollections.map((c) => c.$id || c.name));
    const localCollections = allCollections.filter((collection) =>
      localCollectionIds.has(getCollectionId(collection))
    );

    // Enhanced choice display with type indicators
    const choices = allCollections
      .sort((a, b) => {
        // Sort by type first (collections before tables), then by name
        const aIsTable = (a as any)._isFromTablesDir || false;
        const bIsTable = (b as any)._isFromTablesDir || false;

        if (aIsTable !== bIsTable) {
          return aIsTable ? 1 : -1; // Collections first, then tables
        }

        return a.name.localeCompare(b.name);
      })
      .map((collection) => {
        const localCollection = configCollections.find((c) => c.name === collection.name || c.$id === collection.$id);
        const isLocal = !!localCollection;
        const isTable = localCollection?._isFromTablesDir || (collection as any)._isFromTablesDir || false;
        const sourceFolder = localCollection?._sourceFolder || (collection as any)._sourceFolder || 'collections';

        let typeIndicator = '';
        let locationIndicator = '';

        // Type indicator
        if (isTable) {
          typeIndicator = chalk.cyan('[Table]');
        } else {
          typeIndicator = chalk.green('[Collection]');
        }

        // Location indicator
        if (hasLocalAndRemote) {
          if (isLocal) {
            locationIndicator = chalk.gray(`(Local/${sourceFolder})`);
          } else {
            locationIndicator = chalk.gray('(Remote)');
          }
        } else if (isLocal) {
          locationIndicator = chalk.gray(`(${sourceFolder}/)`);
        }

        // Database indicator for tables with explicit databaseId
        let dbIndicator = '';
        if (isTable && collection.databaseId && shouldFilterByDatabase) {
          const matchesCurrentDb = collection.databaseId === database.$id;
          if (!matchesCurrentDb) {
            dbIndicator = chalk.yellow(` [DB: ${collection.databaseId}]`);
          }
        }

        return {
          name: `${typeIndicator} ${collection.name} ${locationIndicator}${dbIndicator}`,
          value: collection,
        };
      });

    if (multiSelect && localCollections.length > 1) {
      choices.unshift({
        name: chalk.green.bold(`📋 Select All Local Items (${localCollections.length})`),
        value: "__SELECT_ALL_LOCAL__"
      });
    }

    if (multiSelect && allCollections.length > 1) {
      choices.unshift({
        name: chalk.green.bold(`📋 Select All Shown (${allCollections.length})`),
        value: "__SELECT_ALL__"
      });
    }

    const { selectedCollections } = await inquirer.prompt([
      {
        type: multiSelect ? "checkbox" : "list",
        name: "selectedCollections",
        message: chalk.blue(message),
        choices,
        loop: true,
        pageSize: 15, // Increased page size to accommodate additional info
        validate: (input: any[]) => {
          if (!multiSelect) return true;
          if (input.includes("__SELECT_ALL__") && input.length > 1) {
            return "Cannot select 'Select All' with individual items.";
          }
          if (input.includes("__SELECT_ALL_LOCAL__") && input.length > 1) {
            return "Cannot select 'Select All Local' with individual items.";
          }
          return true;
        }
      },
    ]);

    if (multiSelect && Array.isArray(selectedCollections)) {
      if (selectedCollections.includes("__SELECT_ALL__")) {
        return allCollections;
      }
      if (selectedCollections.includes("__SELECT_ALL_LOCAL__")) {
        return localCollections;
      }
    }

    return selectedCollections;
  }

  /**
   * Enhanced collection/table selection with better guidance for mixed scenarios
   */
  private async selectCollectionsAndTables(
    database: Models.Database,
    databasesClient: Databases,
    message: string,
    multiSelect = true,
    preferLocal = false,
    shouldFilterByDatabase = false
  ): Promise<Models.Collection[]> {
    const configCollections = this.getLocalCollections();
    const collectionsCount = configCollections.filter(c => !c._isFromTablesDir).length;
    const tablesCount = configCollections.filter(c => c._isFromTablesDir).length;
    const totalCount = collectionsCount + tablesCount;

    // Provide context about what's available
    if (collectionsCount > 0 && tablesCount > 0) {
      MessageFormatter.info(`\n📋 ${totalCount} total items available:`, { prefix: "Collections" });
      MessageFormatter.info(`   Collections: ${collectionsCount} (from collections/ folder)`, { prefix: "Collections" });
      MessageFormatter.info(`   Tables: ${tablesCount} (from tables/ folder)`, { prefix: "Collections" });
    } else if (collectionsCount > 0) {
      MessageFormatter.info(`📁 ${collectionsCount} collections available from collections/ folder`, { prefix: "Collections" });
    } else if (tablesCount > 0) {
      MessageFormatter.info(`📊 ${tablesCount} tables available from tables/ folder`, { prefix: "Collections" });
    }

    // Show current database context clearly before view mode selection
    MessageFormatter.info(`DB: ${database.name}`, { prefix: "Collections" });

    // Ask user if they want to filter by database, show all, or reuse previous selection
    const choices: { name: string; value: string }[] = [
      {
        name: `Show all available collections/tables (${totalCount} total) - You can push any collection to any database`,
        value: "all"
      },
      {
        name: `Filter by database "${database.name}" - Show only related collections/tables`,
        value: "filter"
      }
    ];
    if (this.lastSelectedCollectionIds && this.lastSelectedCollectionIds.length > 0) {
      choices.unshift({
        name: `Use same selection as before (${this.lastSelectedCollectionIds.length} items)`,
        value: "same"
      });
    }

    const { filterChoice } = await inquirer.prompt([
      {
        type: "list",
        name: "filterChoice",
        message: chalk.blue("How would you like to view collections/tables?"),
        choices,
        default: choices[0]?.value || "all"
      }
    ]);

    // If user wants to reuse the previous selection, map IDs to current config and return
    if (filterChoice === "same") {
      const map = new Map<string, Models.Collection>(
        this.getLocalCollections().map((c: any) => [c.$id || c.id, c as Models.Collection])
      );
      const selected = this.lastSelectedCollectionIds
        .map((id) => map.get(id))
        .filter((c): c is Models.Collection => !!c);
      MessageFormatter.info(`Using same selection as previous: ${selected.length} item(s)`, { prefix: "Collections" });
      return selected;
    }

    // User's choice overrides the parameter
    const userWantsFiltering = filterChoice === "filter";

    // Show appropriate informational message
    if (userWantsFiltering) {
      MessageFormatter.info(`ℹ️  Showing collections/tables related to database "${database.name}"`, { prefix: "Collections" });
      if (tablesCount > 0) {
        const filteredTables = configCollections.filter(c =>
          c._isFromTablesDir && (!c.databaseId || c.databaseId === database.$id)
        ).length;
        if (filteredTables !== tablesCount) {
          MessageFormatter.info(`   ${filteredTables}/${tablesCount} tables match this database`, { prefix: "Collections" });
        }
      }
    } else {
      MessageFormatter.info(`ℹ️  Showing all available collections/tables - you can push any collection to any database\n`, { prefix: "Collections" });
    }

    const result = await this.selectCollections(
      database,
      databasesClient,
      message,
      multiSelect,
      preferLocal,
      userWantsFiltering
    );
    // Remember this selection for subsequent databases
    this.lastSelectedCollectionIds = (result || []).map((c: any) => c.$id || c.id);
    return result;
  }

  private getTemplateDefaults(template: string) {
    const defaults = {
      "typescript-node": {
        runtime: "node-21.0" as Runtime,
        entrypoint: "src/index.ts",
        commands: "npm install && npm run build",
        specification: "s-0.5vcpu-512mb" as Specification,
      },
      "hono-typescript": {
        runtime: "node-21.0" as Runtime,
        entrypoint: "src/index.ts",
        commands: "npm install && npm run build",
        specification: "s-0.5vcpu-512mb" as Specification,
      },
      "uv": {
        runtime: "python-3.12" as Runtime,
        entrypoint: "src/index.py",
        commands: "uv sync && uv build",
        specification: "s-0.5vcpu-512mb" as Specification,
      },
      "count-docs-in-collection": {
        runtime: "node-21.0" as Runtime,
        entrypoint: "src/main.ts",
        commands: "npm install && npm run build",
        specification: "s-1vcpu-512mb" as Specification,
      },
    };
    
    return defaults[template as keyof typeof defaults] || {
      runtime: "node-21.0" as Runtime,
      entrypoint: "",
      commands: "",
      specification: "s-0.5vcpu-512mb" as Specification,
    };
  }


  private async findFunctionInSubdirectories(
    basePaths: string[],
    functionName: string
  ): Promise<string | null> {
    // Common locations to check first
    const commonPaths = basePaths.flatMap((basePath) => [
      join(basePath, "functions", functionName),
      join(basePath, functionName),
      join(basePath, functionName.toLowerCase()),
      join(basePath, functionName.toLowerCase().replace(/\s+/g, "")),
    ]);

    // Create different variations of the function name for comparison
    const functionNameVariations = new Set([
      functionName.toLowerCase(),
      functionName.toLowerCase().replace(/\s+/g, ""),
      functionName.toLowerCase().replace(/[^a-z0-9]/g, ""),
      functionName.toLowerCase().replace(/[-_\s]+/g, ""),
    ]);

    // Check common locations first
    for (const path of commonPaths) {
      try {
        const stats = await fs.promises.stat(path);
        if (stats.isDirectory()) {
          MessageFormatter.success(`Found function at common location: ${path}`, { prefix: "Functions" });
          return path;
        }
      } catch (error) {
        // Path doesn't exist, continue to next
      }
    }

    // If not found in common locations, do recursive search
    MessageFormatter.info("Function not found in common locations, searching subdirectories...", { prefix: "Functions" });

    const queue = [...basePaths];
    const searched = new Set<string>();

    while (queue.length > 0) {
      const currentPath = queue.shift()!;

      if (searched.has(currentPath)) continue;
      searched.add(currentPath);

      try {
        const entries = await fs.promises.readdir(currentPath, {
          withFileTypes: true,
        });

        for (const entry of entries) {
          const fullPath = join(currentPath, entry.name);

          // Skip node_modules and hidden directories
          if (
            entry.isDirectory() &&
            !entry.name.startsWith(".") &&
            entry.name !== "node_modules"
          ) {
            const entryNameVariations = new Set([
              entry.name.toLowerCase(),
              entry.name.toLowerCase().replace(/\s+/g, ""),
              entry.name.toLowerCase().replace(/[^a-z0-9]/g, ""),
              entry.name.toLowerCase().replace(/[-_\s]+/g, ""),
            ]);

            // Check if any variation of the entry name matches any variation of the function name
            const hasMatch = [...functionNameVariations].some((fnVar) =>
              [...entryNameVariations].includes(fnVar)
            );

            if (hasMatch) {
              MessageFormatter.success(`Found function at: ${fullPath}`, { prefix: "Functions" });
              return fullPath;
            }

            queue.push(fullPath);
          }
        }
      } catch (error) {
        MessageFormatter.warning(`Error reading directory ${currentPath}: ${error}`, { prefix: "Functions" });
      }
    }

    return null;
  }


  private async selectFunctions(
    message: string,
    multiple: boolean = true,
    includeRemote: boolean = false
  ): Promise<AppwriteFunction[]> {
    const remoteFunctions = includeRemote
      ? await listFunctions(this.controller!.appwriteServer!, [
          Query.limit(1000),
        ])
      : { functions: [] };
    const localFunctions = this.getLocalFunctions();

    // Combine functions, preferring local ones
    const allFunctions = [
      ...localFunctions,
      ...remoteFunctions.functions.filter(
        (rf: any) => !localFunctions.some((lf) => lf.name === rf.name || lf.$id === rf.$id)
      ),
    ];

    const { selectedFunctions } = await inquirer.prompt([
      {
        type: multiple ? "checkbox" : "list",
        name: "selectedFunctions",
        message,
        choices: allFunctions.map((f) => ({
          name: `${f.name} (${f.$id})${
            localFunctions.some((lf) => lf.name === f.name || lf.$id === f.$id)
              ? " (Local)"
              : " (Remote)"
          }`,
          value: f,
        })),
        loop: true,
      },
    ]);

    return multiple ? selectedFunctions : [selectedFunctions];
  }

  private getLocalFunctions(): AppwriteFunction[] {
    const configFunctions = this.controller!.config?.functions || [];
    return configFunctions.map((f) => ({
      $id: f.$id || ulid(),
      $createdAt: DateTime.now().toISO(),
      $updatedAt: DateTime.now().toISO(),
      name: f.name,
      runtime: f.runtime,
      execute: f.execute || ["any"],
      events: f.events || [],
      schedule: f.schedule || "",
      timeout: f.timeout || 15,
      ignore: f.ignore,
      enabled: f.enabled !== false,
      logging: f.logging !== false,
      entrypoint: f.entrypoint || "src/index.ts",
      commands: f.commands || "npm install",
      scopes: f.scopes || [], // Add scopes
      path: f.dirPath || `functions/${f.name}`,
      dirPath: f.dirPath, // Preserve original dirPath
      installationId: f.installationId || "",
      providerRepositoryId: f.providerRepositoryId || "",
      providerBranch: f.providerBranch || "",
      providerSilentMode: f.providerSilentMode || false,
      providerRootDirectory: f.providerRootDirectory || "",
      ...(f.specification ? { specification: f.specification } : {}),
      ...(f.predeployCommands
        ? { predeployCommands: f.predeployCommands }
        : {}),
      ...(f.deployDir ? { deployDir: f.deployDir } : {}),
    }));
  }
  private async selectBuckets(
    buckets: Models.Bucket[],
    message: string,
    multiSelect = true
  ): Promise<Models.Bucket[]> {
    const choices = buckets.map((bucket) => ({
      name: bucket.name,
      value: bucket,
    }));

    const { selectedBuckets } = await inquirer.prompt([
      {
        type: multiSelect ? "checkbox" : "list",
        name: "selectedBuckets",
        message: chalk.blue(message),
        choices,
        loop: false,
        pageSize: 10,
      },
    ]);

    return selectedBuckets;
  }


  private async configureBuckets(
    config: AppwriteConfig,
    databases?: ConfigDatabases
  ): Promise<AppwriteConfig> {
    const { storage } = this.controller!;
    if (!storage) {
      throw new Error(
        "Storage is not initialized. Is the config file correct and created?"
      );
    }

    const allBuckets = await listBuckets(storage);

    // If there are no buckets, ask to create one for each database
    if (allBuckets.total === 0) {
      const databasesToUse = databases ?? config.databases;
      for (const database of databasesToUse) {
        // If database has bucket config in local config, use that
        const localDatabase = this.controller!.config?.databases.find(
          (db) => db.name === database.name
        );
        if (localDatabase?.bucket) {
          database.bucket = localDatabase.bucket;
          continue;
        }
        const { wantCreateBucket } = await inquirer.prompt([
          {
            type: "confirm",
            name: "wantCreateBucket",
            message: chalk.blue(
              `There are no buckets. Do you want to create a bucket for the database "${database.name}"?`
            ),
            default: true,
          },
        ]);
        if (wantCreateBucket) {
          const createdBucket = await this.createNewBucket(
            storage,
            database.name
          );
          database.bucket = {
            ...createdBucket,
            compression: createdBucket.compression as Compression,
          };
        }
      }
      return config;
    }

    // Configure global buckets
    let globalBuckets: Models.Bucket[] = [];
    if (allBuckets.total > 0) {
      globalBuckets = await this.selectBuckets(
        allBuckets.buckets,
        "Select global buckets (buckets that are not associated with any specific database):",
        true
      );

      config.buckets = globalBuckets.map((bucket) => ({
        $id: bucket.$id,
        name: bucket.name,
        enabled: bucket.enabled,
        maximumFileSize: bucket.maximumFileSize,
        allowedFileExtensions: bucket.allowedFileExtensions,
        compression: bucket.compression as Compression,
        encryption: bucket.encryption,
        antivirus: bucket.antivirus,
      }));
    } else {
      config.buckets = [];
    }

    // Configure database-specific buckets
    for (const database of config.databases) {
      const { assignBucket } = await inquirer.prompt([
        {
          type: "confirm",
          name: "assignBucket",
          message: `Do you want to assign or create a bucket for the database "${database.name}"?`,
          default: false,
        },
      ]);

      if (assignBucket) {
        const { action } = await inquirer.prompt([
          {
            type: "list",
            name: "action",
            message: `Choose an action for the database "${database.name}":`,
            choices: [
              { name: "Assign existing bucket", value: "assign" },
              { name: "Create new bucket", value: "create" },
            ],
          },
        ]);

        if (action === "assign") {
          const selectedBuckets = await this.selectBuckets(
            allBuckets.buckets.filter(
              (b) => !globalBuckets.some((gb) => gb.$id === b.$id)
            ),
            `Select a bucket for the database "${database.name}":`,
            false // multiSelect = false
          );

          if (selectedBuckets.length > 0) {
            const selectedBucket = selectedBuckets[0];
            database.bucket = {
              $id: selectedBucket.$id,
              name: selectedBucket.name,
              enabled: selectedBucket.enabled,
              maximumFileSize: selectedBucket.maximumFileSize,
              allowedFileExtensions: selectedBucket.allowedFileExtensions,
              compression: selectedBucket.compression as Compression,
              encryption: selectedBucket.encryption,
              antivirus: selectedBucket.antivirus,
              permissions: selectedBucket.$permissions.map((p) =>
                permissionSchema.parse(p)
              ),
            };
          }
        } else if (action === "create") {
          const createdBucket = await this.createNewBucket(
            storage,
            database.name
          );
          database.bucket = {
            ...createdBucket,
            compression: createdBucket.compression as Compression,
          };
        }
      }
    }

    return config;
  }

  private async createNewBucket(
    storage: Storage,
    databaseName: string
  ): Promise<Models.Bucket> {
    const {
      bucketName,
      bucketEnabled,
      bucketMaximumFileSize,
      bucketAllowedFileExtensions,
      bucketFileSecurity,
      bucketCompression,
      bucketCompressionType,
      bucketEncryption,
      bucketAntivirus,
      bucketId,
    } = await inquirer.prompt([
      {
        type: "input",
        name: "bucketName",
        message: `Enter the name of the bucket for database "${databaseName}":`,
        default: `${databaseName}-bucket`,
      },
      {
        type: "confirm",
        name: "bucketEnabled",
        message: "Is the bucket enabled?",
        default: true,
      },
      {
        type: "confirm",
        name: "bucketFileSecurity",
        message: "Do you want to enable file security for the bucket?",
        default: false,
      },
      {
        type: "number",
        name: "bucketMaximumFileSize",
        message: "Enter the maximum file size for the bucket (MB):",
        default: 1000000,
      },
      {
        type: "input",
        name: "bucketAllowedFileExtensions",
        message:
          "Enter the allowed file extensions for the bucket (comma separated):",
        default: "",
      },
      {
        type: "confirm",
        name: "bucketCompression",
        message: "Do you want to enable compression for the bucket?",
        default: false,
      },
      {
        type: "list",
        name: "bucketCompressionType",
        message: "Select the compression type for the bucket:",
        choices: Object.values(Compression),
        default: Compression.None,
        when: (answers) => answers.bucketCompression,
      },
      {
        type: "confirm",
        name: "bucketEncryption",
        message: "Do you want to enable encryption for the bucket?",
        default: false,
      },
      {
        type: "confirm",
        name: "bucketAntivirus",
        message: "Do you want to enable antivirus for the bucket?",
        default: false,
      },
      {
        type: "input",
        name: "bucketId",
        message: "Enter the ID of the bucket (or empty for auto-generation):",
      },
    ]);

    return await createBucket(
      storage,
      {
        name: bucketName,
        $permissions: [],
        enabled: bucketEnabled,
        fileSecurity: bucketFileSecurity,
        maximumFileSize: bucketMaximumFileSize * 1024 * 1024,
        allowedFileExtensions:
          bucketAllowedFileExtensions.length > 0
            ? bucketAllowedFileExtensions?.split(",")
            : [],
        compression: bucketCompressionType as Compression,
        encryption: bucketEncryption,
        antivirus: bucketAntivirus,
      },
      bucketId.length > 0 ? bucketId : ulid()
    );
  }



  private getLocalCollections(): (Models.Collection & {
    _isFromTablesDir?: boolean;
    _sourceFolder?: string;
    databaseId?: string;
  })[] {
    const configCollections = [
      ...(this.controller!.config?.collections || []),
      ...(this.controller!.config?.tables || [])
    ];
    // @ts-expect-error - appwrite invalid types
    return configCollections.map((c) => ({
      $id: c.$id || ulid(),
      $createdAt: DateTime.now().toISO(),
      $updatedAt: DateTime.now().toISO(),
      name: c.name,
      enabled: c.enabled || true,
      documentSecurity: c.documentSecurity || false,
      attributes: c.attributes || [],
      indexes: c.indexes || [],
      $permissions: PermissionToAppwritePermission(c.$permissions) || [],
      databaseId: c.databaseId,
      _isFromTablesDir: (c as any)._isFromTablesDir || false,
      _sourceFolder: (c as any)._isFromTablesDir ? 'tables' : 'collections',
    }));
  }

  private getLocalDatabases(): Models.Database[] {
    const configDatabases = this.controller!.config?.databases || [];
    return configDatabases.map((db) => ({
      $id: db.$id || ulid(),
      $createdAt: DateTime.now().toISO(),
      $updatedAt: DateTime.now().toISO(),
      name: db.name,
      enabled: true,
      type: "tablesdb" as DatabaseType,
    }));
  }


  /**
   * Extract session information from current controller for preservation
   */
  private async extractSessionFromController(): Promise<{
    appwriteEndpoint: string;
    appwriteProject: string;
    appwriteKey?: string;
    sessionCookie?: string;
    sessionMetadata?: any;
  } | undefined> {
    if (!this.controller?.config) {
      return undefined;
    }

    const sessionInfo = await this.controller.getSessionInfo();
    const config = this.controller.config;

    if (!config.appwriteEndpoint || !config.appwriteProject) {
      return undefined;
    }

    const result: any = {
      appwriteEndpoint: config.appwriteEndpoint,
      appwriteProject: config.appwriteProject,
      appwriteKey: config.appwriteKey
    };

    // Add session data if available
    if (sessionInfo.hasSession) {
      result.sessionCookie = (this.controller as any).sessionCookie;
      result.sessionMetadata = (this.controller as any).sessionMetadata;
    }

    return result;
  }


  private async detectConfigurationType(): Promise<void> {
    try {
      // Check for YAML config first
      const yamlConfigPath = findYamlConfig(this.currentDir);
      if (yamlConfigPath) {
        this.isUsingTypeScriptConfig = false;
        MessageFormatter.info("Using YAML configuration", { prefix: "Config" });
        return;
      }

      // Then check for TypeScript config
      const configPath = findAppwriteConfig(this.currentDir);
      if (configPath) {
        const tsConfigPath = join(configPath, 'appwriteConfig.ts');
        if (fs.existsSync(tsConfigPath)) {
          this.isUsingTypeScriptConfig = true;
          MessageFormatter.info("TypeScript configuration detected", { prefix: "Config" });
          MessageFormatter.info("Consider migrating to YAML for better organization", { prefix: "Config" });
          return;
        }
      }

      // No config found
      this.isUsingTypeScriptConfig = false;
      MessageFormatter.info("No configuration file found", { prefix: "Config" });
    } catch (error) {
      // Silently handle detection errors and continue
      this.isUsingTypeScriptConfig = false;
    }
  }

  private buildChoicesList(): string[] {
    const allChoices = Object.values(CHOICES);
    
    if (this.isUsingTypeScriptConfig) {
      // Place migration option at the top when TS config is detected
      return [
        CHOICES.MIGRATE_CONFIG,
        ...allChoices.filter(choice => choice !== CHOICES.MIGRATE_CONFIG)
      ];
    } else {
      // Hide migration option when using YAML config
      return allChoices.filter(choice => choice !== CHOICES.MIGRATE_CONFIG);
    }
  }

}
