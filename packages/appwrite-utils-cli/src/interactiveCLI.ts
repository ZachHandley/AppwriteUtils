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
import type { AppwriteConfig, ConfigDatabases } from "appwrite-utils";
import { ulid } from "ulidx";

enum CHOICES {
  CREATE_COLLECTION_CONFIG = "Create collection config file",
  SETUP_DIRS_FILES = "Setup directories and files",
  SETUP_DIRS_FILES_WITH_EXAMPLE_DATA = "Setup directories and files with example data",
  SYNC_DB = "Push local config to Appwrite",
  SYNCHRONIZE_CONFIGURATIONS = "Synchronize configurations",
  TRANSFER_DATA = "Transfer data",
  BACKUP_DATABASE = "Backup database",
  WIPE_DATABASE = "Wipe database",
  GENERATE_SCHEMAS = "Generate schemas",
  IMPORT_DATA = "Import data",
  EXIT = "Exit",
}

export class InteractiveCLI {
  private controller: UtilsController;

  constructor(currentDir?: string, utilsController?: UtilsController) {
    if (utilsController) {
      this.controller = utilsController;
    } else if (currentDir) {
      this.controller = new UtilsController(currentDir);
    } else {
      throw new Error("Current directory or utils controller is required");
    }
  }

  async run(): Promise<void> {
    console.log("Welcome to Appwrite Utils CLI Tool by Zach Handley");
    console.log(
      "For more information, visit https://github.com/zachhandley/appwrite-utils"
    );

    await this.controller.init();

    while (true) {
      const { action } = await inquirer.prompt([
        {
          type: "list",
          name: "action",
          message: "What would you like to do?",
          choices: Object.values(CHOICES),
        },
      ]);

      switch (action) {
        case CHOICES.CREATE_COLLECTION_CONFIG:
          await this.createCollectionConfig();
          break;
        case CHOICES.SETUP_DIRS_FILES:
          await setupDirsFiles(false);
          break;
        case CHOICES.SETUP_DIRS_FILES_WITH_EXAMPLE_DATA:
          await setupDirsFiles(true);
          break;
        case CHOICES.SYNCHRONIZE_CONFIGURATIONS:
          await this.synchronizeConfigurations();
          break;
        case CHOICES.SYNC_DB:
          await this.syncDb();
          break;
        case CHOICES.TRANSFER_DATA:
          await this.transferData();
          break;
        case CHOICES.BACKUP_DATABASE:
          await this.backupDatabase();
          break;
        case CHOICES.WIPE_DATABASE:
          await this.wipeDatabase();
          break;
        case CHOICES.GENERATE_SCHEMAS:
          await this.generateSchemas();
          break;
        case CHOICES.IMPORT_DATA:
          await this.importData();
          break;
        case CHOICES.EXIT:
          console.log("Exiting...");
          return;
      }
    }
  }

  private async selectDatabases(
    databases: Models.Database[],
    message: string,
    multiSelect = true
  ): Promise<Models.Database[]> {
    const choices = databases.map((db) => ({ name: db.name, value: db }));

    if (multiSelect) {
      choices.unshift({ name: "Select All", value: "ALL" as any });
      choices.push({ name: "Clear Selection", value: "CLEAR" as any });
    }

    const { selectedDatabases } = await inquirer.prompt([
      {
        type: multiSelect ? "checkbox" : "list",
        name: "selectedDatabases",
        message,
        choices,
        loop: false,
        pageSize: 10,
      },
    ]);

    if (multiSelect) {
      if (selectedDatabases.includes("ALL")) {
        return databases;
      } else if (selectedDatabases.includes("CLEAR")) {
        return [];
      }
    }

    return selectedDatabases.filter(
      (db: Models.Database | string): db is Models.Database =>
        typeof db !== "string"
    );
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
    const choices = collections.map((collection) => ({
      name: collection.name,
      value: collection,
    }));

    if (multiSelect) {
      choices.unshift({ name: "Select All", value: "ALL" as any });
      choices.push({ name: "Clear Selection", value: "CLEAR" as any });
    }

    const { selectedCollections } = await inquirer.prompt([
      {
        type: multiSelect ? "checkbox" : "list",
        name: "selectedCollections",
        message,
        choices,
        loop: false,
        pageSize: 10,
      },
    ]);

    if (multiSelect) {
      if (selectedCollections.includes("ALL")) {
        return collections;
      } else if (selectedCollections.includes("CLEAR")) {
        return [];
      }
    }

    return selectedCollections.filter(
      (
        collection: Models.Collection | string
      ): collection is Models.Collection => typeof collection !== "string"
    );
  }

  private async selectBuckets(
    buckets: Models.Bucket[],
    message: string,
    multiSelect = true
  ): Promise<Models.Bucket[]> {
    const choices = buckets.map((bucket) => ({
      name: bucket.name,
      value: bucket.$id,
    }));

    if (multiSelect) {
      choices.unshift({ name: "Select All", value: "ALL" });
      choices.push({ name: "Clear Selection", value: "CLEAR" });
    }

    const { selectedBuckets } = await inquirer.prompt([
      {
        type: multiSelect ? "checkbox" : "list",
        name: "selectedBuckets",
        message,
        choices,
        loop: false,
        pageSize: 10,
      },
    ]);

    if (multiSelect) {
      if (selectedBuckets.includes("ALL")) {
        return buckets;
      } else if (selectedBuckets.includes("CLEAR")) {
        return [];
      }
    }

    return selectedBuckets.map(
      (id: string) => buckets.find((bucket) => bucket.$id === id)!
    );
  }

  private async createCollectionConfig(): Promise<void> {
    const { collectionName } = await inquirer.prompt([
      {
        type: "input",
        name: "collectionName",
        message: "Enter the name of the collection:",
        validate: (input) =>
          input.trim() !== "" || "Collection name cannot be empty.",
      },
    ]);
    console.log(`Creating collection config file for '${collectionName}'...`);
    createEmptyCollection(collectionName);
  }

  private async configureBuckets(
    config: AppwriteConfig,
    databases?: ConfigDatabases
  ): Promise<AppwriteConfig> {
    const { storage } = this.controller;
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
            message: `There are no buckets. Do you want to create a bucket for the database "${database.name}"?`,
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
    await this.controller.syncDb();
  }

  private async synchronizeConfigurations(): Promise<void> {
    if (!this.controller.database) {
      throw new Error(
        "Database is not initialized. Is the config file correct and created?"
      );
    }
    const databases = await fetchAllDatabases(this.controller.database);

    const selectedDatabases = await this.selectDatabases(
      databases,
      "Select databases to synchronize (or select none to synchronize all):"
    );

    console.log("Configuring storage buckets...");
    const updatedConfig = await this.configureBuckets(
      this.controller.config!,
      selectedDatabases
    );

    console.log("Synchronizing configurations...");
    await this.controller.synchronizeConfigurations(
      selectedDatabases,
      updatedConfig
    );
  }

  private async backupDatabase(): Promise<void> {
    if (!this.controller.database) {
      throw new Error(
        "Database is not initialized, is the config file correct & created?"
      );
    }
    const databases = await fetchAllDatabases(this.controller.database);

    const selectedDatabases = await this.selectDatabases(
      databases,
      "Select databases to backup (or select none to backup all):"
    );

    for (const db of selectedDatabases) {
      console.log(`Backing up database: ${db.name}`);
      await this.controller.backupDatabase(db);
    }
  }

  private async wipeDatabase(): Promise<void> {
    if (!this.controller.database || !this.controller.storage) {
      throw new Error(
        "Database or Storage is not initialized, is the config file correct & created?"
      );
    }
    const databases = await fetchAllDatabases(this.controller.database);
    const storage = await listBuckets(this.controller.storage);

    const selectedDatabases = await this.selectDatabases(
      databases,
      "Select databases to wipe (or select none to skip database wipe):"
    );

    const { selectedStorage } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selectedStorage",
        message:
          "Select storage buckets to wipe (or select none to skip storage wipe):",
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
        message:
          "Are you sure you want to wipe the selected items? This action cannot be undone.",
        default: false,
      },
    ]);

    if (confirm) {
      console.log("Wiping selected items...");
      for (const db of selectedDatabases) {
        await this.controller.wipeDatabase(db);
      }
      for (const bucketId of selectedStorage) {
        await this.controller.wipeDocumentStorage(bucketId);
      }
      if (wipeUsers) {
        await this.controller.wipeUsers();
      }
    } else {
      console.log("Wipe operation cancelled.");
    }
  }

  private async generateSchemas(): Promise<void> {
    console.log("Generating schemas...");
    await this.controller.generateSchemas();
  }

  private async importData(): Promise<void> {
    if (!this.controller.database) {
      throw new Error(
        "Database is not initialized, is the config file correct & created?"
      );
    }
    const databases = await fetchAllDatabases(this.controller.database);

    const selectedDatabases = await this.selectDatabases(
      databases,
      "Select the database(s) to import data into:"
    );

    let selectedCollections: Models.Collection[] = [];
    for (const db of selectedDatabases) {
      const dbCollections = await this.selectCollections(
        db,
        this.controller.database,
        `Select collections to import data into for database ${db.name} (or select none to import into all):`,
        true
      );
      selectedCollections = [...selectedCollections, ...dbCollections];
    }

    const { shouldWriteFile } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldWriteFile",
        message: "Do you want to write the imported data to a file?",
        default: false,
      },
    ]);

    const { checkDuplicates } = await inquirer.prompt([
      {
        type: "confirm",
        name: "checkDuplicates",
        message: "Do you want to check for duplicates during import?",
        default: true,
      },
    ]);

    console.log("Importing data...");
    await this.controller.importData({
      databases: selectedDatabases,
      collections:
        selectedCollections.length > 0
          ? selectedCollections.map((c) => c.$id)
          : undefined,
      shouldWriteFile,
      checkDuplicates,
    });
  }

  private async transferData(): Promise<void> {
    if (!this.controller.database) {
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

    let sourceClient = this.controller.database;
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
      sourceDatabases = targetDatabases = await fetchAllDatabases(sourceClient);
    }

    const [fromDb] = await this.selectDatabases(
      sourceDatabases,
      "Select the source database:",
      false
    );
    const [targetDb] = await this.selectDatabases(
      targetDatabases.filter((db) => db.$id !== fromDb.$id),
      "Select the target database:",
      false
    );

    const selectedCollections = await this.selectCollections(
      fromDb,
      sourceClient,
      "Select collections to transfer (or select none to transfer all):"
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
      const sourceStorage = new Storage(this.controller.appwriteServer!);
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

      [sourceBucket] = await this.selectBuckets(
        sourceBuckets.buckets,
        "Select the source bucket:",
        false
      );
      [targetBucket] = await this.selectBuckets(
        targetBuckets.buckets,
        "Select the target bucket:",
        false
      );
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

    console.log("Transferring data...");
    await this.controller.transferData(transferOptions);
  }
}
