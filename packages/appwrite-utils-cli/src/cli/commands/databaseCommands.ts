import inquirer from "inquirer";
import chalk from "chalk";
import { join } from "node:path";
import { MessageFormatter } from "../../shared/messageFormatter.js";
import { ConfirmationDialogs } from "../../shared/confirmationDialogs.js";
import { fetchAllDatabases } from "../../databases/methods.js";
import { listBuckets } from "../../storage/methods.js";
import { getFunction, downloadLatestFunctionDeployment } from "../../functions/methods.js";
import type { InteractiveCLI } from "../../interactiveCLI.js";

export const databaseCommands = {
  async syncDb(cli: InteractiveCLI): Promise<void> {
    MessageFormatter.progress("Pushing local configuration to Appwrite...", { prefix: "Database" });

    const databases = await (cli as any).selectDatabases(
      (cli as any).getLocalDatabases(),
      chalk.blue("Select local databases to push:"),
      true
    );

    if (!databases.length) {
      MessageFormatter.warning("No databases selected. Skipping database sync.", { prefix: "Database" });
      return;
    }

    const collections = await (cli as any).selectCollectionsAndTables(
      databases[0],
      (cli as any).controller!.database!,
      chalk.blue("Select local collections/tables to push:"),
      true,
      true, // prefer local
      true  // filter by selected database
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
      await (cli as any).controller!.syncDb(databases, collections);
      MessageFormatter.success("Database and collections pushed successfully", { prefix: "Database" });

      // Then handle functions if requested
      if (syncFunctions && (cli as any).controller!.config?.functions?.length) {
        const functions = await (cli as any).selectFunctions(
          chalk.blue("Select local functions to push:"),
          true,
          true // prefer local
        );

        for (const func of functions) {
          try {
            await (cli as any).controller!.deployFunction(func.name);
            MessageFormatter.success(`Function ${func.name} deployed successfully`, { prefix: "Functions" });
          } catch (error) {
            MessageFormatter.error(`Failed to deploy function ${func.name}`, error instanceof Error ? error : new Error(String(error)), { prefix: "Functions" });
          }
        }
      }

      MessageFormatter.success("Local configuration push completed successfully!", { prefix: "Database" });
    } catch (error) {
      MessageFormatter.error("Failed to push local configuration", error instanceof Error ? error : new Error(String(error)), { prefix: "Database" });
      throw error;
    }
  },

  async synchronizeConfigurations(cli: InteractiveCLI): Promise<void> {
    MessageFormatter.progress("Synchronizing configurations...", { prefix: "Config" });
    await (cli as any).controller!.init();

    // Sync databases, collections, and buckets
    const { syncDatabases } = await inquirer.prompt([
      {
        type: "confirm",
        name: "syncDatabases",
        message: "Do you want to synchronize databases, collections, and their buckets?",
        default: true,
      },
    ]);

    if (syncDatabases) {
      const remoteDatabases = await fetchAllDatabases(
        (cli as any).controller!.database!
      );

      // Use the controller's synchronizeConfigurations method which handles collections properly
      MessageFormatter.progress("Pulling collections and generating collection files...", { prefix: "Collections" });
      await (cli as any).controller!.synchronizeConfigurations(remoteDatabases);

      // Also configure buckets for any new databases
      const localDatabases = (cli as any).controller!.config?.databases || [];
      const updatedConfig = await (cli as any).configureBuckets({
        ...(cli as any).controller!.config!,
        databases: [
          ...localDatabases,
          ...remoteDatabases.filter(
            (rd: any) => !localDatabases.some((ld: any) => ld.name === rd.name)
          ),
        ],
      });

      (cli as any).controller!.config = updatedConfig;
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
      const remoteFunctions = await (cli as any).controller!.listAllFunctions();
      const localFunctions = (cli as any).controller!.config?.functions || [];

      const allFunctions = [
        ...remoteFunctions,
        ...localFunctions.filter(
          (f: any) => !remoteFunctions.some((rf: any) => rf.$id === f.$id)
        ),
      ];

      for (const func of allFunctions) {
        const hasLocal = localFunctions.some((lf: any) => lf.$id === func.$id);
        const hasRemote = remoteFunctions.some((rf: any) => rf.$id === func.$id);

        if (hasLocal && hasRemote) {
          // Function exists in both local and remote
          const { preference } = await inquirer.prompt([
            {
              type: "list",
              name: "preference",
              message: `Function "${func.name}" exists both locally and remotely. What would you like to do?`,
              choices: [
                { name: "Keep local version (deploy to remote)", value: "local" },
                { name: "Use remote version (download)", value: "remote" },
                { name: "Update config only", value: "config" },
                { name: "Skip this function", value: "skip" },
              ],
            },
          ]);

          if (preference === "local") {
            await (cli as any).controller!.deployFunction(func.name);
          } else if (preference === "remote") {
            await downloadLatestFunctionDeployment(
              (cli as any).controller!.appwriteServer!,
              func.$id,
              join((cli as any).controller!.getAppwriteFolderPath()!, "functions")
            );
          } else if (preference === "config") {
            // Update config with remote function details
            const remoteFunction = await getFunction(
              (cli as any).controller!.appwriteServer!,
              func.$id
            );

            const newFunction = {
              $id: remoteFunction.$id,
              name: remoteFunction.name,
              runtime: remoteFunction.runtime,
              execute: remoteFunction.execute || [],
              events: remoteFunction.events || [],
              schedule: remoteFunction.schedule || "",
              timeout: remoteFunction.timeout || 15,
              enabled: remoteFunction.enabled !== false,
              logging: remoteFunction.logging !== false,
              entrypoint: remoteFunction.entrypoint || "src/index.ts",
              commands: remoteFunction.commands || "npm install",
              scopes: remoteFunction.scopes || [],
              installationId: remoteFunction.installationId,
              providerRepositoryId: remoteFunction.providerRepositoryId,
              providerBranch: remoteFunction.providerBranch,
              providerSilentMode: remoteFunction.providerSilentMode,
              providerRootDirectory: remoteFunction.providerRootDirectory,
              specification: remoteFunction.specification,
            };

            const existingIndex = (cli as any).controller!.config!.functions!.findIndex(
              (f: any) => f.$id === remoteFunction.$id
            );

            if (existingIndex >= 0) {
              (cli as any).controller!.config!.functions![existingIndex] = newFunction;
            } else {
              (cli as any).controller!.config!.functions!.push(newFunction);
            }
            MessageFormatter.success(`Updated config for function: ${func.name}`, { prefix: "Functions" });
          }
        } else if (hasLocal) {
          // Function exists only locally
          const { action } = await inquirer.prompt([
            {
              type: "list",
              name: "action",
              message: `Function "${func.name}" exists only locally. What would you like to do?`,
              choices: [
                { name: "Deploy to remote", value: "deploy" },
                { name: "Skip this function", value: "skip" },
              ],
            },
          ]);

          if (action === "deploy") {
            await (cli as any).controller!.deployFunction(func.name);
          }
        } else if (hasRemote) {
          // Function exists only remotely
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
              (cli as any).controller!.appwriteServer!,
              func.$id,
              join((cli as any).controller!.getAppwriteFolderPath()!, "functions")
            );
          } else if (action === "config") {
            const remoteFunction = await getFunction(
              (cli as any).controller!.appwriteServer!,
              func.$id
            );

            const newFunction = {
              $id: remoteFunction.$id,
              name: remoteFunction.name,
              runtime: remoteFunction.runtime,
              execute: remoteFunction.execute || [],
              events: remoteFunction.events || [],
              schedule: remoteFunction.schedule || "",
              timeout: remoteFunction.timeout || 15,
              enabled: remoteFunction.enabled !== false,
              logging: remoteFunction.logging !== false,
              entrypoint: remoteFunction.entrypoint || "src/index.ts",
              commands: remoteFunction.commands || "npm install",
              scopes: remoteFunction.scopes || [],
              installationId: remoteFunction.installationId,
              providerRepositoryId: remoteFunction.providerRepositoryId,
              providerBranch: remoteFunction.providerBranch,
              providerSilentMode: remoteFunction.providerSilentMode,
              providerRootDirectory: remoteFunction.providerRootDirectory,
              specification: remoteFunction.specification,
            };

            (cli as any).controller!.config!.functions =
              (cli as any).controller!.config!.functions || [];
            (cli as any).controller!.config!.functions.push(newFunction);
            MessageFormatter.success(`Added config for remote function: ${func.name}`, { prefix: "Functions" });
          }
        }
      }
    }

    MessageFormatter.success("✨ Configurations synchronized successfully!", { prefix: "Config" });
  },

  async backupDatabase(cli: InteractiveCLI): Promise<void> {
    if (!(cli as any).controller!.database || !(cli as any).controller!.storage) {
      throw new Error(
        "Database or Storage is not initialized, is the config file correct & created?"
      );
    }

    try {
      // STEP 1: Select tracking database
      MessageFormatter.info("Step 1/5: Select tracking database", { prefix: "Backup" });
      const trackingDb = await this.selectTrackingDatabase(cli);

      // STEP 2: Ensure backup tracking table exists
      MessageFormatter.info("Step 2/5: Initializing backup tracking", { prefix: "Backup" });
      await this.ensureBackupTrackingTable(cli, trackingDb);

      // STEP 3: Select backup scope
      MessageFormatter.info("Step 3/5: Select backup scope", { prefix: "Backup" });
      const scope = await this.selectBackupScope(cli);

      // STEP 4: Show confirmation
      MessageFormatter.info("Step 4/5: Confirm backup plan", { prefix: "Backup" });
      const confirmed = await this.confirmBackupPlan(scope);
      if (!confirmed) {
        MessageFormatter.info("Backup cancelled by user", { prefix: "Backup" });
        return;
      }

      // STEP 5: Execute unified backup
      MessageFormatter.info("Step 5/5: Executing backup", { prefix: "Backup" });
      await this.executeUnifiedBackup(cli, trackingDb, scope);

      MessageFormatter.success("Backup operation completed successfully", { prefix: "Backup" });
    } catch (error) {
      MessageFormatter.error(
        "Backup operation failed",
        error instanceof Error ? error : new Error(String(error)),
        { prefix: "Backup" }
      );
      throw error;
    }
  },

  // Helper method: Select tracking database
  async selectTrackingDatabase(cli: InteractiveCLI): Promise<string> {
    const databases = await fetchAllDatabases((cli as any).controller!.database);

    const { trackingDatabaseId } = await inquirer.prompt([
      {
        type: "list",
        name: "trackingDatabaseId",
        message: "Select database to store backup metadata:",
        choices: databases.map(db => ({
          name: `${db.name} (${db.$id})`,
          value: db.$id
        }))
      }
    ]);

    MessageFormatter.info(`Using ${trackingDatabaseId} for backup tracking`, { prefix: "Backup" });
    return trackingDatabaseId;
  },

  // Helper method: Ensure backup tracking table exists
  async ensureBackupTrackingTable(cli: InteractiveCLI, trackingDatabaseId: string): Promise<void> {
    const { createCentralizedBackupTrackingTable } = await import("../../backups/tracking/centralizedTracking.js");
    const adapter = (cli as any).controller!.adapter;

    await createCentralizedBackupTrackingTable(adapter, trackingDatabaseId);
    MessageFormatter.success("Backup tracking table ready", { prefix: "Backup" });
  },

  // Helper method: Select backup scope
  async selectBackupScope(cli: InteractiveCLI): Promise<any> {
    const { scopeType } = await inquirer.prompt([
      {
        type: "list",
        name: "scopeType",
        message: "What would you like to backup?",
        choices: [
          { name: "Comprehensive (ALL databases + ALL buckets)", value: "comprehensive" },
          { name: "Selective databases (choose specific databases)", value: "selective-databases" },
          { name: "Selective collections (choose specific collections)", value: "selective-collections" }
        ]
      }
    ]);

    if (scopeType === "comprehensive") {
      return { type: "comprehensive" };
    }

    if (scopeType === "selective-databases") {
      const databases = await fetchAllDatabases((cli as any).controller!.database);
      const selectedDatabases = await (cli as any).selectDatabases(
        databases,
        "Select databases to backup:"
      );

      const { includeBuckets } = await inquirer.prompt([
        {
          type: "confirm",
          name: "includeBuckets",
          message: "Include storage buckets in backup?",
          default: false
        }
      ]);

      let selectedBuckets: string[] = [];
      if (includeBuckets) {
        const buckets = await listBuckets((cli as any).controller!.storage);
        const { bucketIds } = await inquirer.prompt([
          {
            type: "checkbox",
            name: "bucketIds",
            message: "Select buckets to backup:",
            choices: buckets.buckets.map((b: any) => ({
              name: `${b.name} (${b.$id})`,
              value: b.$id
            }))
          }
        ]);
        selectedBuckets = bucketIds;
      }

      return {
        type: "selective-databases",
        databases: selectedDatabases,
        buckets: selectedBuckets
      };
    }

    if (scopeType === "selective-collections") {
      const databases = await fetchAllDatabases((cli as any).controller!.database);
      const selectedDatabase = await (cli as any).selectDatabases(
        databases,
        "Select database containing collections:",
        false // single selection
      );

      if (!selectedDatabase || selectedDatabase.length === 0) {
        throw new Error("No database selected");
      }

      const db = selectedDatabase[0];
      const collections = await (cli as any).selectCollectionsAndTables(
        db,
        (cli as any).controller!.database!,
        "Select collections to backup:",
        true,
        true,
        true
      );

      return {
        type: "selective-collections",
        databaseId: db.$id,
        databaseName: db.name,
        collections: collections
      };
    }

    throw new Error("Invalid backup scope selected");
  },

  // Helper method: Confirm backup plan
  async confirmBackupPlan(scope: any): Promise<boolean> {
    let summary = "\n" + chalk.bold("Backup Plan Summary:") + "\n";

    if (scope.type === "comprehensive") {
      summary += "  • ALL databases\n";
      summary += "  • ALL storage buckets\n";
    } else if (scope.type === "selective-databases") {
      summary += `  • ${scope.databases.length} selected databases\n`;
      if (scope.buckets.length > 0) {
        summary += `  • ${scope.buckets.length} selected buckets\n`;
      }
    } else if (scope.type === "selective-collections") {
      summary += `  • Database: ${scope.databaseName}\n`;
      summary += `  • ${scope.collections.length} selected collections\n`;
    }

    console.log(summary);

    const { confirmed } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmed",
        message: "Proceed with backup?",
        default: true
      }
    ]);

    return confirmed;
  },

  // Helper method: Execute unified backup
  async executeUnifiedBackup(cli: InteractiveCLI, trackingDatabaseId: string, scope: any): Promise<void> {
    if (scope.type === "comprehensive") {
      const { comprehensiveBackup } = await import("../../backups/operations/comprehensiveBackup.js");

      await comprehensiveBackup(
        (cli as any).controller!.config,
        (cli as any).controller!.database,
        (cli as any).controller!.storage,
        (cli as any).controller!.adapter,
        {
          trackingDatabaseId,
          backupFormat: 'zip',
          parallelDownloads: 10,
          onProgress: (message: string) => {
            MessageFormatter.progress(message, { prefix: "Backup" });
          }
        }
      );
    } else if (scope.type === "selective-databases") {
      // Backup each selected database
      for (const db of scope.databases) {
        MessageFormatter.progress(`Backing up database: ${db.name}`, { prefix: "Backup" });
        await (cli as any).controller!.backupDatabase(db);
      }

      // Backup selected buckets if any
      for (const bucketId of scope.buckets) {
        MessageFormatter.progress(`Backing up bucket: ${bucketId}`, { prefix: "Backup" });
        const { backupBucket } = await import("../../backups/operations/bucketBackup.js");
        await backupBucket(
          (cli as any).controller!.storage,
          bucketId,
          "appwrite-backups",
          { parallelDownloads: 10 }
        );
      }
    } else if (scope.type === "selective-collections") {
      const { backupCollections } = await import("../../backups/operations/collectionBackup.js");

      await backupCollections(
        (cli as any).controller!.config,
        (cli as any).controller!.database,
        (cli as any).controller!.storage,
        (cli as any).controller!.adapter,
        {
          trackingDatabaseId,
          databaseId: scope.databaseId,
          collectionIds: scope.collections.map((c: any) => c.$id || c.id),
          backupFormat: 'zip',
          onProgress: (message: string) => {
            MessageFormatter.progress(message, { prefix: "Backup" });
          }
        }
      );
    }
  },

  async wipeDatabase(cli: InteractiveCLI): Promise<void> {
    if (!(cli as any).controller!.database || !(cli as any).controller!.storage) {
      throw new Error(
        "Database or Storage is not initialized, is the config file correct & created?"
      );
    }
    const databases = await fetchAllDatabases((cli as any).controller!.database);
    const storage = await listBuckets((cli as any).controller!.storage);

    const selectedDatabases = await (cli as any).selectDatabases(
      databases,
      "Select databases to wipe:"
    );

    const { selectedStorage } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selectedStorage",
        message: "Select storage buckets to wipe:",
        choices: storage.buckets.map((s: any) => ({ name: s.name, value: s.$id })),
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

    const databaseNames = selectedDatabases.map((db: any) => db.name);
    const confirmed = await ConfirmationDialogs.confirmDatabaseWipe(databaseNames, {
      includeStorage: selectedStorage.length > 0,
      includeUsers: wipeUsers
    });

    if (confirmed) {
      MessageFormatter.info("Starting wipe operation...", { prefix: "Wipe" });
      for (const db of selectedDatabases) {
        await (cli as any).controller!.wipeDatabase(db);
      }
      for (const bucketId of selectedStorage) {
        await (cli as any).controller!.wipeDocumentStorage(bucketId);
      }
      if (wipeUsers) {
        await (cli as any).controller!.wipeUsers();
      }
      MessageFormatter.success("Wipe operation completed", { prefix: "Wipe" });
    } else {
      MessageFormatter.info("Wipe operation cancelled", { prefix: "Wipe" });
    }
  },

  async wipeCollections(cli: InteractiveCLI): Promise<void> {
    if (!(cli as any).controller!.database) {
      throw new Error(
        "Database is not initialized, is the config file correct & created?"
      );
    }
    const databases = await fetchAllDatabases((cli as any).controller!.database);
    const selectedDatabases = await (cli as any).selectDatabases(
      databases,
      "Select the database(s) containing the collections to wipe:",
      true
    );

    for (const database of selectedDatabases) {
      const collections = await (cli as any).selectCollectionsAndTables(
        database,
        (cli as any).controller!.database,
        `Select collections/tables to wipe from ${database.name}:`,
        true,
        undefined,
        true
      );

      const collectionNames = collections.map((c: any) => c.name);
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
          await (cli as any).controller!.wipeCollection(database, collection);
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
};
