import inquirer from "inquirer";
import { UtilsController } from "./utilsController.js";
import { createEmptyCollection, setupDirsFiles } from "./utils/setupFiles.js";
import { fetchAllDatabases } from "./databases/methods.js";
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
} from "node-appwrite";
import { getClient } from "./utils/getClientFromConfig.js";
import type { TransferOptions } from "./migrations/transfer.js";
import { ComprehensiveTransfer, type ComprehensiveTransferOptions } from "./migrations/comprehensiveTransfer.js";
import {
  AppwriteFunctionSchema,
  parseAttribute,
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
  createFunctionTemplate,
  deleteFunction,
  downloadLatestFunctionDeployment,
  getFunction,
  listFunctions,
  listSpecifications,
} from "./functions/methods.js";
import { deployLocalFunction } from "./functions/deployments.js";
import { join } from "node:path";
import path from "path";
import fs from "node:fs";
import { SchemaGenerator } from "./shared/schemaGenerator.js";
import { ConfirmationDialogs } from "./shared/confirmationDialogs.js";
import { MessageFormatter } from "./shared/messageFormatter.js";
import { migrateConfig } from "./utils/configMigration.js";
import { findAppwriteConfig } from "./utils/loadConfigs.js";
import { findYamlConfig, addFunctionToYamlConfig } from "./config/yamlConfig.js";

enum CHOICES {
  MIGRATE_CONFIG = "🔄 Migrate TypeScript config to YAML (.appwrite structure)",
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
  EXIT = "👋 Exit",
}

export class InteractiveCLI {
  private controller: UtilsController | undefined;
  private isUsingTypeScriptConfig: boolean = false;

  constructor(private currentDir: string) {}

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
          await this.migrateTypeScriptConfig();
          break;
        case CHOICES.CREATE_COLLECTION_CONFIG:
          await this.createCollectionConfig();
          break;
        case CHOICES.CREATE_FUNCTION:
          await this.initControllerIfNeeded();
          await this.createFunction();
          break;
        case CHOICES.DEPLOY_FUNCTION:
          await this.initControllerIfNeeded();
          await this.deployFunction();
          break;
        case CHOICES.DELETE_FUNCTION:
          await this.initControllerIfNeeded();
          await this.deleteFunction();
          break;
        case CHOICES.SETUP_DIRS_FILES:
          await setupDirsFiles(false, this.currentDir);
          break;
        case CHOICES.SETUP_DIRS_FILES_WITH_EXAMPLE_DATA:
          await setupDirsFiles(true, this.currentDir);
          break;
        case CHOICES.SYNCHRONIZE_CONFIGURATIONS:
          await this.initControllerIfNeeded();
          await this.synchronizeConfigurations();
          break;
        case CHOICES.SYNC_DB:
          await this.initControllerIfNeeded();
          await this.syncDb();
          break;
        case CHOICES.TRANSFER_DATA:
          await this.initControllerIfNeeded();
          await this.transferData();
          break;
        case CHOICES.COMPREHENSIVE_TRANSFER:
          await this.comprehensiveTransfer();
          break;
        case CHOICES.BACKUP_DATABASE:
          await this.initControllerIfNeeded();
          await this.backupDatabase();
          break;
        case CHOICES.WIPE_DATABASE:
          await this.initControllerIfNeeded();
          await this.wipeDatabase();
          break;
        case CHOICES.WIPE_COLLECTIONS:
          await this.initControllerIfNeeded();
          await this.wipeCollections();
          break;
        case CHOICES.GENERATE_SCHEMAS:
          await this.initControllerIfNeeded();
          await this.generateSchemas();
          break;
        case CHOICES.GENERATE_CONSTANTS:
          await this.initControllerIfNeeded();
          await this.generateConstants();
          break;
        case CHOICES.IMPORT_DATA:
          await this.initControllerIfNeeded();
          await this.importData();
          break;
        case CHOICES.RELOAD_CONFIG:
          await this.initControllerIfNeeded();
          await this.reloadConfig();
          break;
        case CHOICES.UPDATE_FUNCTION_SPEC:
          await this.initControllerIfNeeded();
          await this.updateFunctionSpec();
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
      this.controller = new UtilsController(this.currentDir, directConfig);
      await this.controller.init();
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
        // Local config takes precedence - if a database with same name exists, use local version
        const existingIndex = acc.findIndex((d) => d.name === db.name);
        if (existingIndex >= 0) {
          if (configDatabases.some((cdb) => cdb.name === db.name)) {
            acc[existingIndex] = db; // Replace with local version
          }
        } else {
          acc.push(db);
        }
        return acc;
      }, [] as Models.Database[])
      .filter((db) => {
        const useMigrations = this.controller?.config?.useMigrations ?? true;
        return useMigrations || db.name.toLowerCase() !== "migrations";
      });

    const hasLocalAndRemote =
      allDatabases.some((db) =>
        configDatabases.some((c) => c.name === db.name)
      ) &&
      allDatabases.some(
        (db) => !configDatabases.some((c) => c.name === db.name)
      );

    const choices = allDatabases
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((db) => ({
        name:
          db.name +
          (hasLocalAndRemote
            ? configDatabases.some((c) => c.name === db.name)
              ? " (Local)"
              : " (Remote)"
            : ""),
        value: db,
      }))
      .filter((db) => {
        const useMigrations = this.controller?.config?.useMigrations ?? true;
        return useMigrations || db.name.toLowerCase() !== "migrations";
      });

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
      console.log(
        chalk.red(
          `Database "${database.name}" does not exist, using only local collection options`
        )
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
            if (!acc.some((c) => c.name === remoteCollection.name)) {
              acc.push(remoteCollection);
            }
            return acc;
          },
          [...configCollections]
        )
      : [
          ...remoteCollections,
          ...configCollections.filter(
            (c) => !remoteCollections.some((rc) => rc.name === c.name)
          ),
        ];

    if (shouldFilterByDatabase) {
      allCollections = allCollections.filter(
        (c) => c.databaseId === database.$id
      );
    }

    const hasLocalAndRemote =
      allCollections.some((coll) =>
        configCollections.some((c) => c.name === coll.name)
      ) &&
      allCollections.some(
        (coll) => !configCollections.some((c) => c.name === coll.name)
      );

    const choices = allCollections
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((collection) => ({
        name:
          collection.name +
          (hasLocalAndRemote
            ? configCollections.some((c) => c.name === collection.name)
              ? " (Local)"
              : " (Remote)"
            : ""),
        value: collection,
      }));

    const { selectedCollections } = await inquirer.prompt([
      {
        type: multiSelect ? "checkbox" : "list",
        name: "selectedCollections",
        message: chalk.blue(message),
        choices,
        loop: true,
        pageSize: 10,
      },
    ]);

    return selectedCollections;
  }

  private getTemplateDefaults(template: string) {
    const defaults = {
      "typescript-node": {
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

  private async createFunction(): Promise<void> {
    const { name } = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "Function name:",
        validate: (input) => input.length > 0,
      },
    ]);

    const { template } = await inquirer.prompt([
      {
        type: "list",
        name: "template",
        message: "Select a template:",
        choices: [
          { name: "TypeScript Node.js", value: "typescript-node" },
          { name: "Python with UV", value: "uv" },
          { name: "Count Documents in Collection", value: "count-docs-in-collection" },
          { name: "None (Empty Function)", value: "none" },
        ],
      },
    ]);

    // Get template defaults
    const templateDefaults = this.getTemplateDefaults(template);

    const { runtime } = await inquirer.prompt([
      {
        type: "list",
        name: "runtime",
        message: "Select runtime:",
        choices: Object.values(RuntimeSchema.Values),
        default: templateDefaults.runtime,
      },
    ]);

    const specifications = await listSpecifications(
      this.controller!.appwriteServer!
    );
    const { specification } = await inquirer.prompt([
      {
        type: "list",
        name: "specification",
        message: "Select specification:",
        choices: [
          { name: "None", value: undefined },
          ...specifications.specifications.map((s) => ({
            name: s.slug,
            value: s.slug,
          })),
        ],
        default: templateDefaults.specification,
      },
    ]);

    const functionConfig: AppwriteFunction = {
      $id: ulid(),
      name,
      runtime,
      events: [],
      execute: ["any"],
      enabled: true,
      logging: true,
      entrypoint: templateDefaults.entrypoint,
      commands: templateDefaults.commands,
      specification: specification || templateDefaults.specification,
      scopes: [],
      timeout: 15,
      schedule: "",
      installationId: "",
      providerRepositoryId: "",
      providerBranch: "",
      providerSilentMode: false,
      providerRootDirectory: "",
      templateRepository: "",
      templateOwner: "",
      templateRootDirectory: "",
    };

    if (template !== "none") {
      await createFunctionTemplate(
        template as "typescript-node" | "uv" | "count-docs-in-collection",
        name,
        "./functions"
      );
    }

    // Add to in-memory config
    if (!this.controller!.config!.functions) {
      this.controller!.config!.functions = [];
    }
    this.controller!.config!.functions.push(functionConfig);

    // If using YAML config, also add to YAML file
    const yamlConfigPath = findYamlConfig(this.currentDir);
    if (yamlConfigPath) {
      try {
        await addFunctionToYamlConfig(yamlConfigPath, functionConfig);
      } catch (error) {
        MessageFormatter.warning(
          `Function created but failed to update YAML config: ${error instanceof Error ? error.message : error}`,
          { prefix: "Functions" }
        );
      }
    }

    MessageFormatter.success("Function created successfully!", { prefix: "Functions" });
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
          console.log(
            chalk.green(`Found function at common location: ${path}`)
          );
          return path;
        }
      } catch (error) {
        // Path doesn't exist, continue to next
      }
    }

    // If not found in common locations, do recursive search
    console.log(
      chalk.yellow(
        "Function not found in common locations, searching subdirectories..."
      )
    );

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
              console.log(chalk.green(`Found function at: ${fullPath}`));
              return fullPath;
            }

            queue.push(fullPath);
          }
        }
      } catch (error) {
        console.log(
          chalk.yellow(`Error reading directory ${currentPath}:`, error)
        );
      }
    }

    return null;
  }

  private async deployFunction(): Promise<void> {
    await this.initControllerIfNeeded();
    if (!this.controller?.config) {
      console.log(chalk.red("Failed to initialize controller or load config"));
      return;
    }

    const functions = await this.selectFunctions(
      "Select function(s) to deploy:",
      true,
      true
    );

    if (!functions?.length) {
      console.log(chalk.red("No function selected"));
      return;
    }

    for (const functionConfig of functions) {
      if (!functionConfig) {
        console.log(chalk.red("Invalid function configuration"));
        return;
      }

      // Ensure functions array exists
      if (!this.controller.config.functions) {
        this.controller.config.functions = [];
      }

      const functionNameLower = functionConfig.name
        .toLowerCase()
        .replace(/\s+/g, "-");

      // Check locations in priority order:
      const priorityLocations = [
        // 1. Config dirPath if specified
        functionConfig.dirPath,
        // 2. Appwrite config folder/functions/name
        join(
          this.controller.getAppwriteFolderPath()!,
          "functions",
          functionNameLower
        ),
        // 3. Current working directory/functions/name
        join(process.cwd(), "functions", functionNameLower),
        // 4. Current working directory/name
        join(process.cwd(), functionNameLower),
      ].filter((val): val is string => val !== undefined); // Remove undefined entries (in case dirPath is undefined)

      let functionPath: string | null = null;

      // Check each priority location
      for (const location of priorityLocations) {
        if (fs.existsSync(location)) {
          console.log(chalk.green(`Found function at: ${location}`));
          functionPath = location;
          break;
        }
      }

      // If not found in priority locations, do a broader search
      if (!functionPath) {
        console.log(
          chalk.yellow(
            `Function not found in primary locations, searching subdirectories...`
          )
        );

        // Search in both appwrite config directory and current working directory
        functionPath = await this.findFunctionInSubdirectories(
          [this.controller.getAppwriteFolderPath()!, process.cwd()],
          functionNameLower
        );
      }

      if (!functionPath) {
        const { shouldDownload } = await inquirer.prompt([
          {
            type: "confirm",
            name: "shouldDownload",
            message:
              "Function not found locally. Would you like to download the latest deployment?",
            default: false,
          },
        ]);

        if (shouldDownload) {
          try {
            console.log(chalk.blue("Downloading latest deployment..."));
            const { path: downloadedPath, function: remoteFunction } =
              await downloadLatestFunctionDeployment(
                this.controller.appwriteServer!,
                functionConfig.$id,
                join(this.controller.getAppwriteFolderPath()!, "functions")
              );
            console.log(
              chalk.green(`✨ Function downloaded to ${downloadedPath}`)
            );

            functionPath = downloadedPath;
            functionConfig.dirPath = downloadedPath;

            const existingIndex = this.controller.config.functions.findIndex(
              (f) => f?.$id === remoteFunction.$id
            );

            if (existingIndex >= 0) {
              this.controller.config.functions[existingIndex].dirPath =
                downloadedPath;
            }

            await this.controller.reloadConfig();
          } catch (error) {
            console.error(
              chalk.red("Failed to download function deployment:"),
              error
            );
            return;
          }
        } else {
          console.log(
            chalk.red(
              `Function ${functionConfig.name} not found locally. Cannot deploy.`
            )
          );
          return;
        }
      }

      if (!this.controller.appwriteServer) {
        console.log(chalk.red("Appwrite server not initialized"));
        return;
      }

      try {
        await deployLocalFunction(
          this.controller.appwriteServer,
          functionConfig.name,
          {
            ...functionConfig,
            dirPath: functionPath,
          }
        );
        MessageFormatter.success("Function deployed successfully!", { prefix: "Functions" });
      } catch (error) {
        console.error(chalk.red("Failed to deploy function:"), error);
      }
    }
  }

  private async deleteFunction(): Promise<void> {
    const functions = await this.selectFunctions(
      "Select functions to delete:",
      true,
      false
    );

    if (!functions.length) {
      console.log(chalk.red("No functions selected"));
      return;
    }

    for (const func of functions) {
      try {
        await deleteFunction(this.controller!.appwriteServer!, func.$id);
        console.log(
          chalk.green(`✨ Function ${func.name} deleted successfully!`)
        );
      } catch (error) {
        console.error(
          chalk.red(`Failed to delete function ${func.name}:`),
          error
        );
      }
    }
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
        (rf) => !localFunctions.some((lf) => lf.name === rf.name)
      ),
    ];

    const { selectedFunctions } = await inquirer.prompt([
      {
        type: multiple ? "checkbox" : "list",
        name: "selectedFunctions",
        message,
        choices: allFunctions.map((f) => ({
          name: `${f.name} (${f.$id})${
            localFunctions.some((lf) => lf.name === f.name)
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

  private async createCollectionConfig(): Promise<void> {
    const { collectionName } = await inquirer.prompt([
      {
        type: "input",
        name: "collectionName",
        message: chalk.blue("Enter the name of the collection:"),
        validate: (input) =>
          input.trim() !== "" || "Collection name cannot be empty.",
      },
    ]);
    console.log(
      chalk.green(`Creating collection config file for '${collectionName}'...`)
    );
    createEmptyCollection(collectionName);
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

  private async syncDb(): Promise<void> {
    console.log(chalk.blue("Pushing local configuration to Appwrite..."));

    const databases = await this.selectDatabases(
      this.getLocalDatabases(),
      chalk.blue("Select local databases to push:"),
      true
    );

    if (!databases.length) {
      console.log(
        chalk.yellow("No databases selected. Skipping database sync.")
      );
      return;
    }

    const collections = await this.selectCollections(
      databases[0],
      this.controller!.database!,
      chalk.blue("Select local collections to push:"),
      true,
      true // prefer local
    );

    const { syncFunctions } = await inquirer.prompt([
      {
        type: "confirm",
        name: "syncFunctions",
        message: "Do you want to push local functions to remote?",
        default: false,
      },
    ]);

    try {
      // First sync databases and collections
      await this.controller!.syncDb(databases, collections);
      console.log(chalk.green("Database and collections pushed successfully"));

      // Then handle functions if requested
      if (syncFunctions && this.controller!.config?.functions?.length) {
        const functions = await this.selectFunctions(
          chalk.blue("Select local functions to push:"),
          true,
          true // prefer local
        );

        for (const func of functions) {
          try {
            await this.controller!.deployFunction(func.name);
            console.log(
              chalk.green(`Function ${func.name} deployed successfully`)
            );
          } catch (error) {
            console.error(
              chalk.red(`Failed to deploy function ${func.name}:`),
              error
            );
          }
        }
      }

      console.log(
        chalk.green("Local configuration push completed successfully!")
      );
    } catch (error) {
      console.error(chalk.red("Failed to push local configuration:"), error);
      throw error;
    }
  }

  private async synchronizeConfigurations(): Promise<void> {
    console.log(chalk.blue("Synchronizing configurations..."));
    await this.controller!.init();
    // Sync databases and buckets first
    const { syncDatabases } = await inquirer.prompt([
      {
        type: "confirm",
        name: "syncDatabases",
        message: "Do you want to synchronize databases and their buckets?",
        default: true,
      },
    ]);

    if (syncDatabases) {
      const remoteDatabases = await fetchAllDatabases(
        this.controller!.database!
      );
      const localDatabases = this.controller!.config?.databases || [];

      // Update config with remote databases that don't exist locally
      const updatedConfig = await this.configureBuckets({
        ...this.controller!.config!,
        databases: [
          ...localDatabases,
          ...remoteDatabases.filter(
            (rd) => !localDatabases.some((ld) => ld.name === rd.name)
          ),
        ],
      });

      this.controller!.config = updatedConfig;
    }

    // Then sync functions
    const { syncFunctions } = await inquirer.prompt([
      {
        type: "confirm",
        name: "syncFunctions",
        message: "Do you want to synchronize functions?",
        default: true,
      },
    ]);

    if (syncFunctions) {
      const remoteFunctions = await this.controller!.listAllFunctions();
      const localFunctions = this.controller!.config?.functions || [];

      const allFunctions = [
        ...remoteFunctions,
        ...localFunctions.filter(
          (f) => !remoteFunctions.some((rf) => rf.$id === f.$id)
        ),
      ];

      for (const func of allFunctions) {
        const hasLocal = localFunctions.some((lf) => lf.$id === func.$id);
        const hasRemote = remoteFunctions.some((rf) => rf.$id === func.$id);

        if (hasLocal && hasRemote) {
          // First try to find the function locally
          let functionPath = join(
            this.controller!.getAppwriteFolderPath()!,
            "functions",
            func.name
          );

          if (!fs.existsSync(functionPath)) {
            console.log(
              chalk.yellow(
                `Function not found in primary location, searching subdirectories...`
              )
            );
            const foundPath = await this.findFunctionInSubdirectories(
              [this.controller!.getAppwriteFolderPath()!, process.cwd()],
              func.name
            );

            if (foundPath) {
              console.log(chalk.green(`Found function at: ${foundPath}`));
              functionPath = foundPath;
            }
          }

          const { preference } = await inquirer.prompt([
            {
              type: "list",
              name: "preference",
              message: `Function "${func.name}" ${
                functionPath ? "found at " + functionPath : "not found locally"
              }. What would you like to do?`,
              choices: [
                ...(functionPath
                  ? [
                      {
                        name: "Keep local version (deploy to remote)",
                        value: "local",
                      },
                    ]
                  : []),
                { name: "Use remote version (download)", value: "remote" },
                { name: "Update config only", value: "config" },
                { name: "Skip this function", value: "skip" },
              ],
            },
          ]);

          if (preference === "local" && functionPath) {
            await this.controller!.deployFunction(func.name);
          } else if (preference === "remote") {
            await downloadLatestFunctionDeployment(
              this.controller!.appwriteServer!,
              func.$id,
              join(this.controller!.getAppwriteFolderPath()!, "functions")
            );
          } else if (preference === "config") {
            const remoteFunction = await getFunction(
              this.controller!.appwriteServer!,
              func.$id
            );

            const newFunction = {
              $id: remoteFunction.$id,
              name: remoteFunction.name,
              runtime: remoteFunction.runtime as Runtime,
              execute: remoteFunction.execute || [],
              events: remoteFunction.events || [],
              schedule: remoteFunction.schedule || "",
              timeout: remoteFunction.timeout || 15,
              enabled: remoteFunction.enabled !== false,
              logging: remoteFunction.logging !== false,
              entrypoint: remoteFunction.entrypoint || "src/index.ts",
              commands: remoteFunction.commands || "npm install",
              scopes: (remoteFunction.scopes || []) as FunctionScope[],
              installationId: remoteFunction.installationId,
              providerRepositoryId: remoteFunction.providerRepositoryId,
              providerBranch: remoteFunction.providerBranch,
              providerSilentMode: remoteFunction.providerSilentMode,
              providerRootDirectory: remoteFunction.providerRootDirectory,
              specification: remoteFunction.specification as Specification,
            };

            const existingIndex = this.controller!.config!.functions!.findIndex(
              (f) => f.$id === remoteFunction.$id
            );

            if (existingIndex >= 0) {
              this.controller!.config!.functions![existingIndex] = newFunction;
            } else {
              this.controller!.config!.functions!.push(newFunction);
            }
            console.log(
              chalk.green(`Updated config for function: ${func.name}`)
            );
          }
        } else if (hasLocal) {
          // Similar check for local-only functions
          let functionPath = join(
            this.controller!.getAppwriteFolderPath()!,
            "functions",
            func.name
          );

          if (!fs.existsSync(functionPath)) {
            const foundPath = await this.findFunctionInSubdirectories(
              [this.controller!.getAppwriteFolderPath()!, process.cwd()],
              func.name
            );

            if (foundPath) {
              functionPath = foundPath;
            }
          }

          const { action } = await inquirer.prompt([
            {
              type: "list",
              name: "action",
              message: `Function "${func.name}" ${
                functionPath ? "found at " + functionPath : "not found locally"
              }. What would you like to do?`,
              choices: [
                ...(functionPath
                  ? [
                      {
                        name: "Deploy to remote",
                        value: "deploy",
                      },
                    ]
                  : []),
                { name: "Skip this function", value: "skip" },
              ],
            },
          ]);

          if (action === "deploy" && functionPath) {
            await this.controller!.deployFunction(func.name);
          }
        } else if (hasRemote) {
          const { action } = await inquirer.prompt([
            {
              type: "list",
              name: "action",
              message: `Function "${func.name}" exists only remotely. What would you like to do?`,
              choices: [
                { name: "Update config only", value: "config" },
                { name: "Download locally", value: "download" },
                { name: "Skip this function", value: "skip" },
              ],
            },
          ]);

          if (action === "download") {
            await downloadLatestFunctionDeployment(
              this.controller!.appwriteServer!,
              func.$id,
              join(this.controller!.getAppwriteFolderPath()!, "functions")
            );
          } else if (action === "config") {
            const remoteFunction = await getFunction(
              this.controller!.appwriteServer!,
              func.$id
            );

            const newFunction = {
              $id: remoteFunction.$id,
              name: remoteFunction.name,
              runtime: remoteFunction.runtime as Runtime,
              execute: remoteFunction.execute || [],
              events: remoteFunction.events || [],
              schedule: remoteFunction.schedule || "",
              timeout: remoteFunction.timeout || 15,
              enabled: remoteFunction.enabled !== false,
              logging: remoteFunction.logging !== false,
              entrypoint: remoteFunction.entrypoint || "src/index.ts",
              commands: remoteFunction.commands || "npm install",
              scopes: (remoteFunction.scopes || []) as FunctionScope[],
              installationId: remoteFunction.installationId,
              providerRepositoryId: remoteFunction.providerRepositoryId,
              providerBranch: remoteFunction.providerBranch,
              providerSilentMode: remoteFunction.providerSilentMode,
              providerRootDirectory: remoteFunction.providerRootDirectory,
              specification: remoteFunction.specification as Specification,
            };

            this.controller!.config!.functions =
              this.controller!.config!.functions || [];
            this.controller!.config!.functions.push(newFunction);
            console.log(
              chalk.green(`Added config for remote function: ${func.name}`)
            );
          }
        }
      }

      // Update schemas after all changes
      const schemaGenerator = new SchemaGenerator(
        this.controller!.config!,
        this.controller!.getAppwriteFolderPath()!
      );
      schemaGenerator.updateConfig(this.controller!.config!);
    }

    console.log(chalk.green("✨ Configurations synchronized successfully!"));
  }

  private async backupDatabase(): Promise<void> {
    if (!this.controller!.database) {
      throw new Error(
        "Database is not initialized, is the config file correct & created?"
      );
    }
    const databases = await fetchAllDatabases(this.controller!.database);

    const selectedDatabases = await this.selectDatabases(
      databases,
      "Select databases to backup:"
    );

    for (const db of selectedDatabases) {
      console.log(chalk.yellow(`Backing up database: ${db.name}`));
      await this.controller!.backupDatabase(db);
    }
    MessageFormatter.success("Database backup completed", { prefix: "Backup" });
  }

  private async wipeDatabase(): Promise<void> {
    if (!this.controller!.database || !this.controller!.storage) {
      throw new Error(
        "Database or Storage is not initialized, is the config file correct & created?"
      );
    }
    const databases = await fetchAllDatabases(this.controller!.database);
    const storage = await listBuckets(this.controller!.storage);

    const selectedDatabases = await this.selectDatabases(
      databases,
      "Select databases to wipe:"
    );

    const { selectedStorage } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selectedStorage",
        message: "Select storage buckets to wipe:",
        choices: storage.buckets.map((s) => ({ name: s.name, value: s.$id })),
      },
    ]);

    const { wipeUsers } = await inquirer.prompt([
      {
        type: "confirm",
        name: "wipeUsers",
        message: "Do you want to wipe users as well?",
        default: false,
      },
    ]);

    const databaseNames = selectedDatabases.map(db => db.name);
    const confirmed = await ConfirmationDialogs.confirmDatabaseWipe(databaseNames, {
      includeStorage: selectedStorage.length > 0,
      includeUsers: wipeUsers
    });

    if (confirmed) {
      MessageFormatter.info("Starting wipe operation...", { prefix: "Wipe" });
      for (const db of selectedDatabases) {
        await this.controller!.wipeDatabase(db);
      }
      for (const bucketId of selectedStorage) {
        await this.controller!.wipeDocumentStorage(bucketId);
      }
      if (wipeUsers) {
        await this.controller!.wipeUsers();
      }
      MessageFormatter.success("Wipe operation completed", { prefix: "Wipe" });
    } else {
      MessageFormatter.info("Wipe operation cancelled", { prefix: "Wipe" });
    }
  }

  private async wipeCollections(): Promise<void> {
    if (!this.controller!.database) {
      throw new Error(
        "Database is not initialized, is the config file correct & created?"
      );
    }
    const databases = await fetchAllDatabases(this.controller!.database);
    const selectedDatabases = await this.selectDatabases(
      databases,
      "Select the database(s) containing the collections to wipe:",
      true
    );

    for (const database of selectedDatabases) {
      const collections = await this.selectCollections(
        database,
        this.controller!.database,
        `Select collections to wipe from ${database.name}:`,
        true,
        undefined,
        true
      );

      const collectionNames = collections.map(c => c.name);
      const confirmed = await ConfirmationDialogs.confirmCollectionWipe(
        database.name,
        collectionNames
      );

      if (confirmed) {
        MessageFormatter.info(
          `Wiping selected collections from ${database.name}...`,
          { prefix: "Wipe" }
        );
        for (const collection of collections) {
          await this.controller!.wipeCollection(database, collection);
          MessageFormatter.success(
            `Collection ${collection.name} wiped successfully`,
            { prefix: "Wipe" }
          );
        }
      } else {
        MessageFormatter.info(
          `Wipe operation cancelled for ${database.name}`,
          { prefix: "Wipe" }
        );
      }
    }
    MessageFormatter.success("Wipe collections operation completed", { prefix: "Wipe" });
  }

  private async generateSchemas(): Promise<void> {
    console.log(chalk.yellow("Generating schemas..."));
    
    // Prompt user for schema type preference
    const { schemaType } = await inquirer.prompt([
      {
        type: "list",
        name: "schemaType",
        message: "What type of schemas would you like to generate?",
        choices: [
          { name: "TypeScript (Zod) schemas", value: "zod" },
          { name: "JSON schemas", value: "json" },
          { name: "Both TypeScript and JSON schemas", value: "both" },
        ],
        default: "both",
      },
    ]);

    // Get the config folder path (where the config file is located)
    const configFolderPath = this.controller!.getAppwriteFolderPath();
    if (!configFolderPath) {
      MessageFormatter.error("Failed to get config folder path", undefined, { prefix: "Schemas" });
      return;
    }

    // Create SchemaGenerator with the correct base path and generate schemas
    const schemaGenerator = new SchemaGenerator(this.controller!.config!, configFolderPath);
    schemaGenerator.generateSchemas({ format: schemaType, verbose: true });
    
    MessageFormatter.success("Schema generation completed", { prefix: "Schemas" });
  }

  private async generateConstants(): Promise<void> {
    console.log(chalk.yellow("Generating cross-language constants..."));

    if (!this.controller?.config) {
      MessageFormatter.error("No configuration found", undefined, { prefix: "Constants" });
      return;
    }

    // Prompt for languages
    const { languages } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "languages",
        message: "Select languages for constants generation:",
        choices: [
          { name: "TypeScript", value: "typescript", checked: true },
          { name: "JavaScript", value: "javascript" },
          { name: "Python", value: "python" },
          { name: "PHP", value: "php" },
          { name: "Dart", value: "dart" },
          { name: "JSON", value: "json" },
          { name: "Environment Variables", value: "env" },
        ],
        validate: (input) => {
          if (input.length === 0) {
            return "Please select at least one language";
          }
          return true;
        },
      },
    ]);

    // Determine default output directory based on config location
    const configPath = this.controller!.getAppwriteFolderPath();
    const defaultOutputDir = configPath 
      ? path.join(configPath, "constants")
      : path.join(process.cwd(), "constants");

    // Prompt for output directory
    const { outputDir } = await inquirer.prompt([
      {
        type: "input",
        name: "outputDir",
        message: "Output directory for constants files:",
        default: defaultOutputDir,
        validate: (input) => {
          if (!input.trim()) {
            return "Output directory cannot be empty";
          }
          return true;
        },
      },
    ]);

    try {
      const { ConstantsGenerator } = await import("./utils/constantsGenerator.js");
      const generator = new ConstantsGenerator(this.controller.config);
      
      MessageFormatter.info(`Generating constants for: ${languages.join(", ")}`, { prefix: "Constants" });
      await generator.generateFiles(languages, outputDir);
      
      MessageFormatter.success(`Constants generated in ${outputDir}`, { prefix: "Constants" });
    } catch (error) {
      MessageFormatter.error("Failed to generate constants", error instanceof Error ? error : new Error(String(error)), { prefix: "Constants" });
    }
  }

  private async importData(): Promise<void> {
    console.log(chalk.yellow("Importing data..."));

    const { doBackup } = await inquirer.prompt([
      {
        type: "confirm",
        name: "doBackup",
        message: "Do you want to perform a backup before importing?",
        default: true,
      },
    ]);

    const databases = await this.selectDatabases(
      await fetchAllDatabases(this.controller!.database!),
      "Select databases to import data into:",
      true
    );

    const collections = await this.selectCollections(
      databases[0],
      this.controller!.database!,
      "Select collections to import data into (leave empty for all):",
      true
    );

    const { shouldWriteFile } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldWriteFile",
        message: "Do you want to write the imported data to a file?",
        default: false,
      },
    ]);

    const options = {
      databases,
      collections: collections.map((c) => c.name),
      doBackup,
      importData: true,
      shouldWriteFile,
    };

    try {
      await this.controller!.importData(options);
      console.log(chalk.green("Data import completed successfully."));
    } catch (error) {
      console.error(chalk.red("Error importing data:"), error);
    }
  }

  private async transferData(): Promise<void> {
    if (!this.controller!.database) {
      throw new Error(
        "Database is not initialized, is the config file correct & created?"
      );
    }

    const { isRemote } = await inquirer.prompt([
      {
        type: "confirm",
        name: "isRemote",
        message: "Is this a remote transfer?",
        default: false,
      },
    ]);

    let sourceClient = this.controller!.database;
    let targetClient: Databases;
    let sourceDatabases: Models.Database[];
    let targetDatabases: Models.Database[];
    let remoteOptions:
      | {
          transferEndpoint: string;
          transferProject: string;
          transferKey: string;
        }
      | undefined;

    if (isRemote) {
      remoteOptions = await inquirer.prompt([
        {
          type: "input",
          name: "transferEndpoint",
          message: "Enter the remote endpoint:",
        },
        {
          type: "input",
          name: "transferProject",
          message: "Enter the remote project ID:",
        },
        {
          type: "input",
          name: "transferKey",
          message: "Enter the remote API key:",
        },
      ]);

      const remoteClient = getClient(
        remoteOptions!.transferEndpoint,
        remoteOptions!.transferProject,
        remoteOptions!.transferKey
      );
      targetClient = new Databases(remoteClient);

      sourceDatabases = await fetchAllDatabases(sourceClient);
      targetDatabases = await fetchAllDatabases(targetClient);
    } else {
      targetClient = sourceClient;
      const allDatabases = await fetchAllDatabases(sourceClient);
      sourceDatabases = targetDatabases = allDatabases;
    }

    const fromDbs = await this.selectDatabases(
      sourceDatabases,
      "Select the source database:",
      false
    );
    const fromDb = fromDbs[0];
    if (!fromDb) {
      throw new Error("No source database selected");
    }
    const availableDbs = targetDatabases.filter((db) => db.$id !== fromDb.$id);
    const targetDbs = await this.selectDatabases(
      availableDbs,
      "Select the target database:",
      false
    );
    const targetDb = targetDbs[0];
    if (!targetDb) {
      throw new Error("No target database selected");
    }

    const selectedCollections = await this.selectCollections(
      fromDb,
      sourceClient,
      "Select collections to transfer:",
      true,
      false // don't prefer local for transfers
    );

    const { transferStorage } = await inquirer.prompt([
      {
        type: "confirm",
        name: "transferStorage",
        message: "Do you want to transfer storage as well?",
        default: false,
      },
    ]);

    let sourceBucket, targetBucket;

    if (transferStorage) {
      const sourceStorage = new Storage(this.controller!.appwriteServer!);
      const targetStorage = isRemote
        ? new Storage(
            getClient(
              remoteOptions!.transferEndpoint,
              remoteOptions!.transferProject,
              remoteOptions!.transferKey
            )
          )
        : sourceStorage;

      const sourceBuckets = await listBuckets(sourceStorage);
      const targetBuckets = isRemote
        ? await listBuckets(targetStorage)
        : sourceBuckets;

      const sourceBucketPicked = await this.selectBuckets(
        sourceBuckets.buckets,
        "Select the source bucket:",
        false
      );
      const targetBucketPicked = await this.selectBuckets(
        targetBuckets.buckets,
        "Select the target bucket:",
        false
      );
      sourceBucket = sourceBucketPicked[0];
      targetBucket = targetBucketPicked[0];
    }

    let transferOptions: TransferOptions = {
      fromDb,
      targetDb,
      isRemote,
      collections:
        selectedCollections.length > 0
          ? selectedCollections.map((c) => c.$id)
          : undefined,
      sourceBucket,
      targetBucket,
    };

    if (isRemote && remoteOptions) {
      transferOptions = {
        ...transferOptions,
        ...remoteOptions,
      };
    }

    console.log(chalk.yellow("Transferring data..."));
    await this.controller!.transferData(transferOptions);
    console.log(chalk.green("Data transfer completed."));
  }

  private getLocalCollections(): Models.Collection[] {
    const configCollections = this.controller!.config?.collections || [];
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
      databaseId: c.databaseId!,
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
    }));
  }

  private async reloadConfig(): Promise<void> {
    MessageFormatter.progress("Reloading configuration files...", { prefix: "Config" });
    try {
      await this.controller!.reloadConfig();
      MessageFormatter.success("Configuration files reloaded successfully", { prefix: "Config" });
    } catch (error) {
      MessageFormatter.error("Failed to reload configuration files", error instanceof Error ? error : new Error(String(error)), { prefix: "Config" });
    }
  }

  private async updateFunctionSpec(): Promise<void> {
    const remoteFunctions = await listFunctions(
      this.controller!.appwriteServer!,
      [Query.limit(1000)]
    );
    const localFunctions = this.getLocalFunctions();

    const allFunctions = [
      ...remoteFunctions.functions,
      ...localFunctions.filter(
        (f) => !remoteFunctions.functions.some((rf) => rf.name === f.name)
      ),
    ];

    const functionsToUpdate = await inquirer.prompt([
      {
        type: "checkbox",
        name: "functionId",
        message: "Select functions to update:",
        choices: allFunctions.map((f) => ({
          name: `${f.name} (${f.$id})${
            localFunctions.some((lf) => lf.name === f.name)
              ? " (Local)"
              : " (Remote)"
          }`,
          value: f.$id,
        })),
        loop: true,
      },
    ]);

    const specifications = await listSpecifications(
      this.controller!.appwriteServer!
    );
    const { specification } = await inquirer.prompt([
      {
        type: "list",
        name: "specification",
        message: "Select new specification:",
        choices: specifications.specifications.map((s) => ({
          name: `${s.slug}`,
          value: s.slug,
        })),
      },
    ]);

    try {
      for (const functionId of functionsToUpdate.functionId) {
        await this.controller!.updateFunctionSpecifications(
          functionId,
          specification
        );
        console.log(
          chalk.green(
            `Successfully updated function specification to ${specification}`
          )
        );
      }
    } catch (error) {
      console.error(chalk.red("Error updating function specification:"), error);
    }
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

  private async migrateTypeScriptConfig(): Promise<void> {
    try {
      MessageFormatter.info("Starting TypeScript to YAML configuration migration...", { prefix: "Migration" });
      
      // Perform the migration
      await migrateConfig(this.currentDir);
      
      // Reset the detection flag
      this.isUsingTypeScriptConfig = false;
      
      // Reset the controller to pick up the new config
      this.controller = undefined;
      
      MessageFormatter.success("Migration completed successfully!", { prefix: "Migration" });
      MessageFormatter.info("Your configuration has been migrated to the .appwrite directory structure", { prefix: "Migration" });
      MessageFormatter.info("You can now use YAML configuration for easier management", { prefix: "Migration" });
      
    } catch (error) {
      MessageFormatter.error("Migration failed", error instanceof Error ? error : new Error(String(error)), { prefix: "Migration" });
    }
  }

  private async comprehensiveTransfer(): Promise<void> {
    MessageFormatter.info("Starting comprehensive transfer configuration...", { prefix: "Transfer" });

    try {
      // Initialize controller to optionally load config if available (supports both YAML and TypeScript configs)\n      await this.initControllerIfNeeded();\n      \n      // Check if user has an appwrite config for easier setup
      const hasAppwriteConfig = this.controller?.config?.appwriteEndpoint && 
                               this.controller?.config?.appwriteProject && 
                               this.controller?.config?.appwriteKey;

      let sourceConfig: any;
      let targetConfig: any;

      if (hasAppwriteConfig) {
        // Offer to use existing config for source
        const { useConfigForSource } = await inquirer.prompt([
          {
            type: "confirm",
            name: "useConfigForSource",
            message: "Use your current appwriteConfig as the source?",
            default: true,
          },
        ]);

        if (useConfigForSource) {
          sourceConfig = {
            sourceEndpoint: this.controller!.config!.appwriteEndpoint,
            sourceProject: this.controller!.config!.appwriteProject,
            sourceKey: this.controller!.config!.appwriteKey,
          };
          MessageFormatter.info(`Using config source: ${sourceConfig.sourceEndpoint}`, { prefix: "Transfer" });
        } else {
          // Get source configuration manually
          sourceConfig = await inquirer.prompt([
            {
              type: "input",
              name: "sourceEndpoint",
              message: "Enter the source Appwrite endpoint:",
              validate: (input) => input.trim() !== "" || "Endpoint cannot be empty",
            },
            {
              type: "input",
              name: "sourceProject",
              message: "Enter the source project ID:",
              validate: (input) => input.trim() !== "" || "Project ID cannot be empty",
            },
            {
              type: "password",
              name: "sourceKey",
              message: "Enter the source API key:",
              validate: (input) => input.trim() !== "" || "API key cannot be empty",
            },
          ]);
        }

        // Offer to use existing config for target
        const { useConfigForTarget } = await inquirer.prompt([
          {
            type: "confirm",
            name: "useConfigForTarget",
            message: "Use your current appwriteConfig as the target?",
            default: false,
          },
        ]);

        if (useConfigForTarget) {
          targetConfig = {
            targetEndpoint: this.controller!.config!.appwriteEndpoint,
            targetProject: this.controller!.config!.appwriteProject,
            targetKey: this.controller!.config!.appwriteKey,
          };
          MessageFormatter.info(`Using config target: ${targetConfig.targetEndpoint}`, { prefix: "Transfer" });
        } else {
          // Get target configuration manually
          targetConfig = await inquirer.prompt([
            {
              type: "input",
              name: "targetEndpoint",
              message: "Enter the target Appwrite endpoint:",
              validate: (input) => input.trim() !== "" || "Endpoint cannot be empty",
            },
            {
              type: "input",
              name: "targetProject",
              message: "Enter the target project ID:",
              validate: (input) => input.trim() !== "" || "Project ID cannot be empty",
            },
            {
              type: "password",
              name: "targetKey",
              message: "Enter the target API key:",
              validate: (input) => input.trim() !== "" || "API key cannot be empty",
            },
          ]);
        }
      } else {
        // No appwrite config found, get both configurations manually
        MessageFormatter.info("No appwriteConfig found, please enter source and target configurations manually", { prefix: "Transfer" });
        
        // Get source configuration
        sourceConfig = await inquirer.prompt([
          {
            type: "input",
            name: "sourceEndpoint",
            message: "Enter the source Appwrite endpoint:",
            validate: (input) => input.trim() !== "" || "Endpoint cannot be empty",
          },
          {
            type: "input",
            name: "sourceProject",
            message: "Enter the source project ID:",
            validate: (input) => input.trim() !== "" || "Project ID cannot be empty",
          },
          {
            type: "password",
            name: "sourceKey",
            message: "Enter the source API key:",
            validate: (input) => input.trim() !== "" || "API key cannot be empty",
          },
        ]);

        // Get target configuration
        targetConfig = await inquirer.prompt([
          {
            type: "input",
            name: "targetEndpoint",
            message: "Enter the target Appwrite endpoint:",
            validate: (input) => input.trim() !== "" || "Endpoint cannot be empty",
          },
          {
            type: "input",
            name: "targetProject",
            message: "Enter the target project ID:",
            validate: (input) => input.trim() !== "" || "Project ID cannot be empty",
          },
          {
            type: "password",
            name: "targetKey",
            message: "Enter the target API key:",
            validate: (input) => input.trim() !== "" || "API key cannot be empty",
          },
        ]);
      }

      // Get transfer options
      const transferOptions = await inquirer.prompt([
        {
          type: "checkbox",
          name: "transferTypes",
          message: "Select what to transfer:",
          choices: [
            { name: "👥 Users", value: "users", checked: true },
            { name: "🗄️ Databases", value: "databases", checked: true },
            { name: "📦 Storage Buckets", value: "buckets", checked: true },
            { name: "⚡ Functions", value: "functions", checked: true },
          ],
          validate: (input) => input.length > 0 || "Select at least one transfer type",
        },
        {
          type: "list",
          name: "concurrencyLimit",
          message: "Select concurrency limit:",
          choices: [
            { name: "5 (Conservative) - Users: 2, Files: 1", value: 5 },
            { name: "10 (Balanced) - Users: 5, Files: 2", value: 10 },
            { name: "15 - Users: 7, Files: 3", value: 15 },
            { name: "20 - Users: 10, Files: 5", value: 20 },
            { name: "25 - Users: 12, Files: 6", value: 25 },
            { name: "30 - Users: 15, Files: 7", value: 30 },
            { name: "35 - Users: 17, Files: 8", value: 35 },
            { name: "40 - Users: 20, Files: 10", value: 40 },
            { name: "45 - Users: 22, Files: 11", value: 45 },
            { name: "50 - Users: 25, Files: 12", value: 50 },
            { name: "55 - Users: 27, Files: 13", value: 55 },
            { name: "60 - Users: 30, Files: 15", value: 60 },
            { name: "65 - Users: 32, Files: 16", value: 65 },
            { name: "70 - Users: 35, Files: 17", value: 70 },
            { name: "75 - Users: 37, Files: 18", value: 75 },
            { name: "80 - Users: 40, Files: 20", value: 80 },
            { name: "85 - Users: 42, Files: 21", value: 85 },
            { name: "90 - Users: 45, Files: 22", value: 90 },
            { name: "95 - Users: 47, Files: 23", value: 95 },
            { name: "100 (Aggressive) - Users: 50, Files: 25", value: 100 },
          ],
          default: 10,
        },
        {
          type: "confirm",
          name: "dryRun",
          message: "Run in dry-run mode (no actual changes)?",
          default: false,
        },
      ]);

      // Confirmation
      const { confirmed } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirmed",
          message: `Are you sure you want to ${transferOptions.dryRun ? "dry-run" : "perform"} comprehensive transfer from ${sourceConfig.sourceEndpoint} to ${targetConfig.targetEndpoint}?`,
          default: false,
        },
      ]);

      if (!confirmed) {
        MessageFormatter.info("Transfer cancelled by user", { prefix: "Transfer" });
        return;
      }

      // Password preservation information
      if (transferOptions.transferTypes.includes("users") && !transferOptions.dryRun) {
        MessageFormatter.info("User Password Transfer Information:", { prefix: "Transfer" });
        MessageFormatter.info("✅ Users with hashed passwords (Argon2, Bcrypt, Scrypt, MD5, SHA, PHPass) will preserve their passwords", { prefix: "Transfer" });
        MessageFormatter.info("⚠️  Users without hash information will receive temporary passwords and need to reset", { prefix: "Transfer" });
        MessageFormatter.info("🔒 All user data (preferences, labels, verification status) will be preserved", { prefix: "Transfer" });
        
        const { continueWithUsers } = await inquirer.prompt([
          {
            type: "confirm",
            name: "continueWithUsers",
            message: "Continue with user transfer?",
            default: true,
          },
        ]);

        if (!continueWithUsers) {
          // Remove users from transfer types
          transferOptions.transferTypes = transferOptions.transferTypes.filter((type: string) => type !== "users");
          if (transferOptions.transferTypes.length === 0) {
            MessageFormatter.info("No transfer types selected, cancelling", { prefix: "Transfer" });
            return;
          }
        }
      }

      // Execute comprehensive transfer
      const comprehensiveTransferOptions: ComprehensiveTransferOptions = {
        sourceEndpoint: sourceConfig.sourceEndpoint,
        sourceProject: sourceConfig.sourceProject,
        sourceKey: sourceConfig.sourceKey,
        targetEndpoint: targetConfig.targetEndpoint,
        targetProject: targetConfig.targetProject,
        targetKey: targetConfig.targetKey,
        transferUsers: transferOptions.transferTypes.includes("users"),
        transferDatabases: transferOptions.transferTypes.includes("databases"),
        transferBuckets: transferOptions.transferTypes.includes("buckets"),
        transferFunctions: transferOptions.transferTypes.includes("functions"),
        concurrencyLimit: transferOptions.concurrencyLimit,
        dryRun: transferOptions.dryRun,
      };

      const transfer = new ComprehensiveTransfer(comprehensiveTransferOptions);
      const results = await transfer.execute();

      // Display results
      if (transferOptions.dryRun) {
        MessageFormatter.success("Dry run completed successfully!", { prefix: "Transfer" });
      } else {
        MessageFormatter.success("Comprehensive transfer completed!", { prefix: "Transfer" });
        if (transferOptions.transferTypes.includes("users") && results.users.transferred > 0) {
          MessageFormatter.info("Users with preserved password hashes can log in with their original passwords", { prefix: "Transfer" });
          MessageFormatter.info("Users with temporary passwords will need to reset their passwords", { prefix: "Transfer" });
        }
      }

    } catch (error) {
      MessageFormatter.error("Comprehensive transfer failed", error instanceof Error ? error : new Error(String(error)), { prefix: "Transfer" });
    }
  }
}
