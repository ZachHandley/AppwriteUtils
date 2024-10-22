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
} from "node-appwrite";
import { getClient } from "./utils/getClientFromConfig.js";
import type { TransferOptions } from "./migrations/transfer.js";
import { parseAttribute, PermissionToAppwritePermission, type AppwriteConfig, type ConfigDatabases } from "appwrite-utils";
import { ulid } from "ulidx";
import chalk from "chalk";
import { DateTime } from "luxon";

enum CHOICES {
  CREATE_COLLECTION_CONFIG = "Create collection config file",
  SETUP_DIRS_FILES = "Setup directories and files",
  SETUP_DIRS_FILES_WITH_EXAMPLE_DATA = "Setup directories and files with example data",
  SYNC_DB = "Push local config to Appwrite",
  SYNCHRONIZE_CONFIGURATIONS = "Synchronize configurations",
  TRANSFER_DATA = "Transfer data",
  BACKUP_DATABASE = "Backup database",
  WIPE_DATABASE = "Wipe database",
  WIPE_COLLECTIONS = "Wipe collections",
  GENERATE_SCHEMAS = "Generate schemas",
  IMPORT_DATA = "Import data",
  RELOAD_CONFIG = "Reload configuration files",
  EXIT = "Exit",
}

export class InteractiveCLI {
  private controller: UtilsController | undefined;

  constructor(private currentDir: string) {}

  async run(): Promise<void> {
    console.log(chalk.green("Welcome to Appwrite Utils CLI Tool by Zach Handley"));
    console.log(
      chalk.blue("For more information, visit https://github.com/zachhandley/AppwriteUtils")
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

      await this.initControllerIfNeeded();

      switch (action) {
        case CHOICES.CREATE_COLLECTION_CONFIG:
          await this.createCollectionConfig();
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
    const choices = databases.map((db) => ({ name: db.name, value: db })).filter((db) => db.name.toLowerCase() !== "migrations");
    const configDatabases = this.getLocalDatabases();
    const allDatabases = Array.from(new Set([...databases, ...configDatabases]));


    const { selectedDatabases } = await inquirer.prompt([
      {
        type: multiSelect ? "checkbox" : "list",
        name: "selectedDatabases",
        message: chalk.blue(message),
        choices,
        loop: false,
        pageSize: 10,
      },
    ]);

    return selectedDatabases;
  }

  private async selectCollections(
    database: Models.Database,
    databasesClient: Databases,
    message: string,
    multiSelect = true
  ): Promise<Models.Collection[]> {
    const collections = await fetchAllCollections(
      database.$id,
      databasesClient
    );
    const configCollections = this.getLocalCollections();
    const collectionNames = collections.map((c) => c.name).concat(configCollections.map((c) => c.name));
    const allCollectionNamesUnique = Array.from(new Set(collectionNames));
    const allCollections = allCollectionNamesUnique.map((name) => configCollections.find((c) => c.name === name) ?? collections.find((c) => c.name === name)).filter((v) => v !== undefined);
    const choices = allCollections.map((collection) => ({
      name: collection.name,
      value: collection,
    }));

    const { selectedCollections } = await inquirer.prompt([
      {
        type: multiSelect ? "checkbox" : "list",
        name: "selectedCollections",
        message: chalk.blue(message),
        choices,
        loop: false,
        pageSize: 10,
      },
    ]);

    return selectedCollections;
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
    console.log(chalk.green(`Creating collection config file for '${collectionName}'...`));
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
      for (const database of databases ?? config.databases) {
        const { wantCreateBucket } = await inquirer.prompt([
          {
            type: "confirm",
            name: "wantCreateBucket",
            message: chalk.blue(`There are no buckets. Do you want to create a bucket for the database "${database.name}"?`),
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
          const [selectedBucket] = await this.selectBuckets(
            allBuckets.buckets.filter(
              (b) => !globalBuckets.some((gb) => gb.$id === b.$id)
            ),
            `Select a bucket for the database "${database.name}":`,
            false
          );

          if (selectedBucket) {
            database.bucket = {
              $id: selectedBucket.$id,
              name: selectedBucket.name,
              enabled: selectedBucket.enabled,
              maximumFileSize: selectedBucket.maximumFileSize,
              allowedFileExtensions: selectedBucket.allowedFileExtensions,
              compression: selectedBucket.compression as Compression,
              encryption: selectedBucket.encryption,
              antivirus: selectedBucket.antivirus,
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
    const databases = await this.selectDatabases(
      await fetchAllDatabases(this.controller!.database!),
      chalk.blue("Select databases to synchronize:"),
      true,
    );
    const collections = await this.selectCollections(
      databases[0],
      this.controller!.database!,
      chalk.blue("Select collections to synchronize:"),
      true,
    );
    await this.controller!.syncDb(databases, collections);
    console.log(chalk.green("Database sync completed."));
  }

  private async synchronizeConfigurations(): Promise<void> {
    if (!this.controller!.database) {
      throw new Error(
        "Database is not initialized. Is the config file correct and created?"
      );
    }
    const databases = await fetchAllDatabases(this.controller!.database);

    const selectedDatabases = await this.selectDatabases(
      databases,
      "Select databases to synchronize:"
    );

    console.log(chalk.yellow("Configuring storage buckets..."));
    const updatedConfig = await this.configureBuckets(
      this.controller!.config!,
      selectedDatabases
    );

    console.log(chalk.yellow("Synchronizing configurations..."));
    await this.controller!.synchronizeConfigurations(
      selectedDatabases,
      updatedConfig
    );
    console.log(chalk.green("Configuration synchronization completed."));
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
        console.log(chalk.yellow(`Wiping selected collections from ${database.name}...`));
        for (const collection of collections) {
          await this.controller!.wipeCollection(database, collection);
          console.log(chalk.green(`Collection ${collection.name} wiped successfully.`));
        }
      } else {
        console.log(chalk.blue(`Wipe operation cancelled for ${database.name}.`));
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
      collections: collections.map(c => c.name),
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
      "Select collections to transfer:"
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
    const configCollections = this.controller!.config!.collections || [];
    // @ts-expect-error - appwrite invalid types
    return configCollections.map(c => ({
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
    const configDatabases = this.controller!.config!.databases || [];
    return configDatabases.map(db => ({
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
}