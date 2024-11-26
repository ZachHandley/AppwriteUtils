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
  listFunctions,
  listSpecifications,
} from "./functions/methods.js";
import { deployLocalFunction } from "./functions/deployments.js";
import { join } from "node:path";
import fs from "node:fs";
import { SchemaGenerator } from "./migrations/schemaStrings.js";

enum CHOICES {
  CREATE_COLLECTION_CONFIG = "Create collection config file",
  CREATE_FUNCTION = "Create a new function, from scratch or using a template",
  DEPLOY_FUNCTION = "Deploy function",
  DELETE_FUNCTION = "Delete function",
  SETUP_DIRS_FILES = "Setup directories and files",
  SETUP_DIRS_FILES_WITH_EXAMPLE_DATA = "Setup directories and files with example data",
  SYNC_DB = "Push local config to Appwrite",
  SYNCHRONIZE_CONFIGURATIONS = "Synchronize configurations - Pull from Appwrite and write to local config",
  TRANSFER_DATA = "Transfer data",
  BACKUP_DATABASE = "Backup database",
  WIPE_DATABASE = "Wipe database",
  WIPE_COLLECTIONS = "Wipe collections",
  GENERATE_SCHEMAS = "Generate schemas",
  IMPORT_DATA = "Import data",
  RELOAD_CONFIG = "Reload configuration files",
  UPDATE_FUNCTION_SPEC = "Update function specifications",
  EXIT = "Exit",
}

export class InteractiveCLI {
  private controller: UtilsController | undefined;

  constructor(private currentDir: string) {}

  async run(): Promise<void> {
    console.log(
      chalk.green("Welcome to Appwrite Utils CLI Tool by Zach Handley")
    );
    console.log(
      chalk.blue(
        "For more information, visit https://github.com/zachhandley/AppwriteUtils"
      )
    );

    while (true) {
      const { action } = await inquirer.prompt([
        {
          type: "list",
          name: "action",
          message: chalk.yellow("What would you like to do?"),
          choices: Object.values(CHOICES),
        },
      ]);

      switch (action) {
        case CHOICES.CREATE_COLLECTION_CONFIG:
          await this.initControllerIfNeeded();
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
          console.log(chalk.green("Goodbye!"));
          return;
      }
    }
  }

  private async initControllerIfNeeded(): Promise<void> {
    if (!this.controller) {
      this.controller = new UtilsController(this.currentDir);
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
      .filter((db) => db.name.toLowerCase() !== "migrations");

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
      .filter((db) => db.name.toLowerCase() !== "migrations");

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
    preferLocal = false
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
    } else {
      remoteCollections = await fetchAllCollections(
        database.$id,
        databasesClient
      );
    }

    const allCollections = preferLocal
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
          "typescript-node",
          "poetry",
          "count-docs-in-collection",
          "none",
        ],
      },
    ]);

    const { runtime } = await inquirer.prompt([
      {
        type: "list",
        name: "runtime",
        message: "Select runtime:",
        choices: Object.values(RuntimeSchema.Values),
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
      entrypoint: template === "none" ? "src/index.ts" : undefined,
      specification,
      predeployCommands: template.includes("typescript")
        ? ["npm install", "npm run build"]
        : undefined,
      deployDir: template.includes("typescript") ? "dist" : undefined,
    };

    if (template !== "none") {
      await createFunctionTemplate(
        template as "typescript-node" | "poetry" | "count-docs-in-collection",
        name,
        "./functions"
      );
    }

    // Add to config
    if (!this.controller!.config!.functions) {
      this.controller!.config!.functions = [];
    }
    this.controller!.config!.functions.push(functionConfig);

    console.log(chalk.green("✨ Function created successfully!"));
  }

  private async findFunctionInSubdirectories(
    basePath: string,
    functionName: string
  ): Promise<string | null> {
    const queue = [basePath];

    while (queue.length > 0) {
      const currentPath = queue.shift()!;

      try {
        const entries = await fs.promises.readdir(currentPath, {
          withFileTypes: true,
        });

        // Check if function exists in current directory
        const functionPath = join(currentPath, functionName);
        if (fs.existsSync(functionPath)) {
          return functionPath;
        }

        // Add subdirectories to queue
        for (const entry of entries) {
          if (entry.isDirectory()) {
            queue.push(join(currentPath, entry.name));
          }
        }
      } catch (error) {
        console.log(
          chalk.yellow(`Skipping inaccessible directory: ${currentPath}`)
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
      "Select function to deploy:",
      false,
      true
    );

    if (!functions?.length) {
      console.log(chalk.red("No function selected"));
      return;
    }

    const functionConfig = functions[0];
    if (!functionConfig) {
      console.log(chalk.red("Invalid function configuration"));
      return;
    }

    let functionPath = join(
      this.controller.getAppwriteFolderPath(),
      "functions",
      functionConfig.name
    );

    if (!fs.existsSync(functionPath)) {
      console.log(
        chalk.yellow(
          `Function not found in primary location, searching subdirectories...`
        )
      );
      const foundPath = await this.findFunctionInSubdirectories(
        this.controller.getAppwriteFolderPath(),
        functionConfig.name
      );

      if (foundPath) {
        console.log(chalk.green(`Found function at: ${foundPath}`));
        functionPath = foundPath;
        functionConfig.dirPath = foundPath;
      } else {
        console.log(
          chalk.yellow(
            `Function ${functionConfig.name} not found locally in any subdirectory`
          )
        );

        const { shouldDownload } = await inquirer.prompt([
          {
            type: "confirm",
            name: "shouldDownload",
            message: "Would you like to download the latest deployment?",
            default: true,
          },
        ]);

        if (shouldDownload) {
          try {
            console.log(chalk.blue("Downloading latest deployment..."));
            const { path: downloadedPath, function: remoteFunction } =
              await downloadLatestFunctionDeployment(
                this.controller.appwriteServer!,
                functionConfig.$id,
                join(this.controller.getAppwriteFolderPath(), "functions")
              );
            console.log(
              chalk.green(`✨ Function downloaded to ${downloadedPath}`)
            );

            // Update the config and functions array safely
            this.controller.config.functions =
              this.controller.config.functions || [];

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
              dirPath: downloadedPath,
              scopes: (remoteFunction.scopes || []) as FunctionScope[],
              installationId: remoteFunction.installationId,
              providerRepositoryId: remoteFunction.providerRepositoryId,
              providerBranch: remoteFunction.providerBranch,
              providerSilentMode: remoteFunction.providerSilentMode,
              providerRootDirectory: remoteFunction.providerRootDirectory,
              specification: remoteFunction.specification as Specification,
            };

            const existingIndex = this.controller.config.functions.findIndex(
              (f) => f?.$id === remoteFunction.$id
            );

            if (existingIndex >= 0) {
              this.controller.config.functions[existingIndex] = newFunction;
            } else {
              this.controller.config.functions.push(newFunction);
            }

            const schemaGenerator = new SchemaGenerator(
              this.controller.config,
              this.controller.getAppwriteFolderPath()
            );
            schemaGenerator.updateConfig(this.controller.config);
            console.log(
              chalk.green("✨ Updated appwriteConfig.ts with new function")
            );

            await this.controller.reloadConfig();
            functionConfig.dirPath = downloadedPath;
          } catch (error) {
            console.error(
              chalk.red("Failed to download function deployment:"),
              error
            );
            return;
          }
        } else {
          console.log(chalk.yellow("Deployment cancelled"));
          return;
        }
      }
    }

    if (!this.controller.appwriteServer) {
      console.log(chalk.red("Appwrite server not initialized"));
      return;
    }

    await deployLocalFunction(
      this.controller.appwriteServer,
      functionConfig.name,
      functionConfig
    );
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
    multiSelect = true,
    preferLocal = false
  ): Promise<AppwriteFunction[]> {
    await this.initControllerIfNeeded();

    const configFunctions = this.getLocalFunctions();
    let remoteFunctions: Models.Function[] = [];

    try {
      const functions = await this.controller!.listAllFunctions();
      remoteFunctions = functions;
    } catch (error) {
      console.log(
        chalk.yellow(
          `Note: Remote functions not available, using only local functions`
        )
      );
    }

    // Combine functions based on whether we're deploying or not
    const allFunctions = preferLocal
      ? [
          ...configFunctions,
          ...remoteFunctions.map((f) => AppwriteFunctionSchema.parse(f)),
        ]
      : [
          ...remoteFunctions.map((f) => AppwriteFunctionSchema.parse(f)),
          ...configFunctions.filter(
            (f) => !remoteFunctions.some((rf) => rf.name === f.name)
          ),
        ];

    if (allFunctions.length === 0) {
      console.log(chalk.red("No functions available"));
      return [];
    }

    const choices = allFunctions
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((func) => ({
        name: func.name,
        value: func,
      }));

    const { selectedFunctions } = await inquirer.prompt([
      {
        type: multiSelect ? "checkbox" : "list",
        name: "selectedFunctions",
        message: chalk.blue(message),
        choices,
        loop: true,
        pageSize: 10,
      },
    ]);

    // For single selection, ensure we return an array
    if (!multiSelect) {
      return selectedFunctions ? [selectedFunctions] : [];
    }

    return selectedFunctions || [];
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
      enabled: f.enabled !== false,
      logging: f.logging !== false,
      entrypoint: f.entrypoint || "src/index.ts",
      commands: f.commands || "npm install",
      path: f.dirPath || `functions/${f.name}`,
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
    console.log(chalk.yellow("Syncing database..."));
    const functionsClient = new Functions(this.controller!.appwriteServer!);
    const databases = await this.selectDatabases(
      await fetchAllDatabases(this.controller!.database!),
      chalk.blue("Select databases to synchronize:"),
      true
    );
    const collections = await this.selectCollections(
      databases[0],
      this.controller!.database!,
      chalk.blue("Select collections to synchronize:"),
      true,
      true // prefer local
    );
    const answer = await inquirer.prompt([
      {
        type: "confirm",
        name: "syncFunctions",
        message: "Do you want to synchronize functions?",
        default: false,
      },
    ]);
    if (answer.syncFunctions) {
      const functions = await this.selectFunctions(
        chalk.blue("Select functions to synchronize:"),
        true,
        true // prefer local
      );
      await this.controller!.syncDb(databases, collections);
      for (const func of functions) {
        await deployLocalFunction(
          this.controller!.appwriteServer!,
          func.dirPath || `functions/${func.name}`,
          func
        );
      }
    }
    console.log(chalk.green("Database sync completed."));
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
          const { preference } = await inquirer.prompt([
            {
              type: "list",
              name: "preference",
              message: `Function "${func.name}" exists both locally and remotely. What would you like to do?`,
              choices: [
                {
                  name: "Keep local version (deploy to remote)",
                  value: "local",
                },
                { name: "Use remote version (download)", value: "remote" },
                { name: "Skip this function", value: "skip" },
              ],
            },
          ]);

          if (preference === "local") {
            await this.controller!.deployFunction(func.name);
          } else if (preference === "remote") {
            await downloadLatestFunctionDeployment(
              this.controller!.appwriteServer!,
              func.$id,
              join(this.controller!.getAppwriteFolderPath(), "functions")
            );
          }
        } else if (hasLocal) {
          const { deploy } = await inquirer.prompt([
            {
              type: "confirm",
              name: "deploy",
              message: `Function "${func.name}" exists only locally. Deploy to remote?`,
              default: true,
            },
          ]);

          if (deploy) {
            await this.controller!.deployFunction(func.name);
          }
        } else if (hasRemote) {
          const { download } = await inquirer.prompt([
            {
              type: "confirm",
              name: "download",
              message: `Function "${func.name}" exists only remotely. Download locally?`,
              default: true,
            },
          ]);

          if (download) {
            await downloadLatestFunctionDeployment(
              this.controller!.appwriteServer!,
              func.$id,
              join(this.controller!.getAppwriteFolderPath(), "functions")
            );
          }
        }
      }
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
    console.log(chalk.green("Database backup completed."));
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

    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: chalk.red(
          "Are you sure you want to wipe the selected items? This action cannot be undone."
        ),
        default: false,
      },
    ]);

    if (confirm) {
      console.log(chalk.yellow("Wiping selected items..."));
      for (const db of selectedDatabases) {
        await this.controller!.wipeDatabase(db);
      }
      for (const bucketId of selectedStorage) {
        await this.controller!.wipeDocumentStorage(bucketId);
      }
      if (wipeUsers) {
        await this.controller!.wipeUsers();
      }
      console.log(chalk.green("Wipe operation completed."));
    } else {
      console.log(chalk.blue("Wipe operation cancelled."));
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
        true
      );

      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: chalk.red(
            `Are you sure you want to wipe the selected collections from ${database.name}? This action cannot be undone.`
          ),
          default: false,
        },
      ]);

      if (confirm) {
        console.log(
          chalk.yellow(`Wiping selected collections from ${database.name}...`)
        );
        for (const collection of collections) {
          await this.controller!.wipeCollection(database, collection);
          console.log(
            chalk.green(`Collection ${collection.name} wiped successfully.`)
          );
        }
      } else {
        console.log(
          chalk.blue(`Wipe operation cancelled for ${database.name}.`)
        );
      }
    }
    console.log(chalk.green("Wipe collections operation completed."));
  }

  private async generateSchemas(): Promise<void> {
    console.log(chalk.yellow("Generating schemas..."));
    await this.controller!.generateSchemas();
    console.log(chalk.green("Schema generation completed."));
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
    console.log(chalk.yellow("Reloading configuration files..."));
    try {
      await this.controller!.reloadConfig();
      console.log(chalk.green("Configuration files reloaded successfully."));
    } catch (error) {
      console.error(chalk.red("Error reloading configuration files:"), error);
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
}
