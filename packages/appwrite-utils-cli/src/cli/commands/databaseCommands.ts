import inquirer from "inquirer";
import chalk from "chalk";
import { join } from "node:path";
import { Query } from "node-appwrite";
import { MessageFormatter } from 'appwrite-utils-helpers';
import { ConfirmationDialogs } from "../../shared/confirmationDialogs.js";
import { SelectionDialogs } from "../../shared/selectionDialogs.js";
import type { DatabaseSelection, BucketSelection } from "../../shared/selectionDialogs.js";
import { logger } from 'appwrite-utils-helpers';
import { fetchAllDatabases } from "../../databases/methods.js";
import { listBuckets } from "../../storage/methods.js";
import { getFunction, downloadLatestFunctionDeployment } from "../../functions/methods.js";
import { deployFunctionsBatch, type BatchDeployItem } from "../../functions/batchDeploy.js";
import { wipeTableRows } from "../../collections/wipeOperations.js";
import type { InteractiveCLI } from "../../interactiveCLI.js";

export const databaseCommands = {
  async syncDb(cli: InteractiveCLI): Promise<void> {
    MessageFormatter.progress("Pushing local configuration to Appwrite...", { prefix: "Push" });

    try {
      // Initialize controller
      await (cli as any).controller!.init();

      // Ask what to push first
      const { pushTargets } = await inquirer.prompt([
        {
          type: "checkbox",
          name: "pushTargets",
          message: chalk.blue("What would you like to push to Appwrite?"),
          choices: [
            { name: "Databases & Tables", value: "databases" },
            { name: "Storage Buckets", value: "buckets" },
            { name: "Functions", value: "functions" },
          ],
          validate: (input: string[]) => {
            if (input.length === 0) {
              return "Please select at least one item to push.";
            }
            return true;
          },
        },
      ]);

      const pushDatabases = pushTargets.includes("databases");
      const pushBuckets = pushTargets.includes("buckets");
      const pushFunctions = pushTargets.includes("functions");

      let databaseSelections: DatabaseSelection[] = [];
      let bucketSelections: BucketSelection[] = [];
      let mergedDatabases: any[] = [];

      // --- Databases & Tables sub-flow ---
      if (pushDatabases) {
        const serverDatabases = await fetchAllDatabases((cli as any).controller!.database!);
        const configuredDatabases = (cli as any).controller!.config?.databases || [];

        const serverDbIds = new Set(serverDatabases.map(db => db.$id));
        mergedDatabases = [...serverDatabases];

        for (const configDb of configuredDatabases) {
          const dbId = configDb.$id;
          if (dbId && !serverDbIds.has(dbId)) {
            mergedDatabases.push({
              $id: dbId,
              name: configDb.name || dbId,
              $createdAt: new Date().toISOString(),
              $updatedAt: new Date().toISOString(),
              enabled: true,
              _isLocalOnly: true,
            } as any);
            MessageFormatter.info(`Including local database "${configDb.name || dbId}" (not yet on server)`, { prefix: "Database" });
          }
        }

        const selectedDatabaseIds = await SelectionDialogs.selectDatabases(
          mergedDatabases,
          configuredDatabases,
          { showSelectAll: false, allowNewOnly: false, defaultSelected: [] }
        );

        if (selectedDatabaseIds.length === 0) {
          MessageFormatter.warning("No databases selected.", { prefix: "Database" });
        } else {
          const tableSelectionsMap = new Map<string, string[]>();
          const availableTablesMap = new Map<string, any[]>();

          for (const databaseId of selectedDatabaseIds) {
            const database = mergedDatabases.find(db => db.$id === databaseId)!;

            const selectedCollections = await (cli as any).selectCollectionsAndTables(
              database,
              (cli as any).controller!.database!,
              chalk.blue(`Select tables to push to "${database.name}":`),
              true,
              true,
              true
            );

            const selectedTableIds = selectedCollections.map((c: any) => c.$id || c.id);
            tableSelectionsMap.set(databaseId, selectedTableIds);
            availableTablesMap.set(databaseId, selectedCollections);

            if (selectedCollections.length === 0) {
              MessageFormatter.warning(`No tables selected for database "${database.name}". Skipping.`, { prefix: "Database" });
            }
          }

          databaseSelections = SelectionDialogs.createDatabaseSelection(
            selectedDatabaseIds,
            mergedDatabases,
            tableSelectionsMap,
            configuredDatabases,
            availableTablesMap
          );
        }
      }

      // --- Storage Buckets sub-flow ---
      if (pushBuckets) {
        try {
          let remoteBuckets: any[] = [];
          try {
            const remoteBucketsResponse = await listBuckets((cli as any).controller!.storage!);
            remoteBuckets = remoteBucketsResponse.buckets || [];
          } catch (error) {
            MessageFormatter.warning("Could not fetch remote buckets, showing local buckets only.", { prefix: "Buckets" });
          }

          const configuredBuckets = (cli as any).controller!.config?.buckets || [];

          // Merge local + remote buckets
          const remoteBucketIds = new Set(remoteBuckets.map((b: any) => b.$id));
          const localBucketIds = new Set(configuredBuckets.map((b: any) => b.$id));

          const mergedBuckets: any[] = [];

          for (const rb of remoteBuckets) {
            mergedBuckets.push({
              ...rb,
              _isLocalOnly: false,
              _isRemoteOnly: !localBucketIds.has(rb.$id),
            });
          }

          for (const lb of configuredBuckets) {
            if (!remoteBucketIds.has(lb.$id)) {
              mergedBuckets.push({
                $id: lb.$id,
                name: lb.name,
                enabled: lb.enabled,
                maximumFileSize: lb.maximumFileSize,
                allowedFileExtensions: lb.allowedFileExtensions || [],
                compression: lb.compression || 'none',
                encryption: lb.encryption || false,
                antivirus: lb.antivirus || false,
                fileSecurity: lb.fileSecurity || false,
                permissions: lb.permissions || [],
                $permissions: [],
                _isLocalOnly: true,
                _isRemoteOnly: false,
              });
            }
          }

          if (mergedBuckets.length === 0) {
            MessageFormatter.warning("No storage buckets found (local or remote).", { prefix: "Buckets" });
          } else {
            const selectedBucketIds = await SelectionDialogs.selectBucketsForPush(
              mergedBuckets,
              configuredBuckets,
            );

            if (selectedBucketIds.length > 0) {
              bucketSelections = SelectionDialogs.createBucketSelection(
                selectedBucketIds,
                mergedBuckets,
                configuredBuckets,
                mergedDatabases
              );
              MessageFormatter.info(`Selected ${bucketSelections.length} storage bucket(s)`, { prefix: "Buckets" });
            }
          }
        } catch (error) {
          MessageFormatter.warning("Failed during bucket selection.", { prefix: "Buckets" });
          logger.warn("Bucket selection failed during syncDb", { error: error instanceof Error ? error.message : String(error) });
        }
      }

      // --- Confirmation ---
      if (databaseSelections.length > 0 || bucketSelections.length > 0) {
        const selectionSummary = SelectionDialogs.createSyncSelectionSummary(
          databaseSelections,
          bucketSelections
        );

        const confirmed = await SelectionDialogs.confirmSyncSelection(selectionSummary, 'push');

        if (!confirmed) {
          MessageFormatter.info("Push operation cancelled by user", { prefix: "Push" });
          return;
        }

        MessageFormatter.progress("Starting selective push...", { prefix: "Push" });
        await (cli as any).controller!.selectivePush(databaseSelections, bucketSelections);
        MessageFormatter.success("Configuration pushed successfully!", { prefix: "Push" });
      }

      // --- Functions sub-flow ---
      if (pushFunctions) {
        if (!(cli as any).controller!.config?.functions?.length) {
          MessageFormatter.warning("No functions defined in local config.", { prefix: "Functions" });
        } else {
          const functions = await (cli as any).selectFunctions(
            chalk.blue("Select local functions to push:"),
            true,
            true
          );

          const controller = (cli as any).controller!;
          const allFunctions = controller.config?.functions || [];
          const items: BatchDeployItem[] = [];
          for (const func of functions) {
            const cfg = allFunctions.find(
              (f: any) => f?.$id === func.$id || f?.name === func.name
            );
            if (!cfg) {
              MessageFormatter.warning(
                `Function ${func.name} missing from loaded config; skipping.`,
                { prefix: "Functions" }
              );
              continue;
            }
            items.push({
              functionName: cfg.name,
              functionConfig: cfg,
              configDirPath: controller.getAppwriteFolderPath?.() ?? controller.appwriteFolderPath,
            });
          }

          if (items.length) {
            const results = await deployFunctionsBatch(
              controller.appwriteServer,
              items
            );
            const failed = results.filter((r) => r.status === "failed");
            if (failed.length) {
              MessageFormatter.warning(
                `${failed.length} of ${results.length} functions failed to deploy.`,
                { prefix: "Functions" }
              );
            } else {
              MessageFormatter.success(
                `All ${results.length} selected functions deployed successfully.`,
                { prefix: "Functions" }
              );
            }
          }
        }
      }

      MessageFormatter.success("Push operation completed!", { prefix: "Push" });
    } catch (error) {
      MessageFormatter.error("Failed to push local configuration", error instanceof Error ? error : new Error(String(error)), { prefix: "Push" });
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
        message: "Do you want to synchronize databases, tables, and their buckets?",
        default: true,
      },
    ]);

    if (syncDatabases) {
      const remoteDatabases = await fetchAllDatabases(
        (cli as any).controller!.database!
      );

      // First, prepare the combined database list for bucket configuration
      const localDatabases = (cli as any).controller!.config?.databases || [];
      const allDatabases = [
        ...localDatabases,
        ...remoteDatabases.filter(
          (rd: any) => !localDatabases.some((ld: any) => ld.name === rd.name)
        ),
      ];

      // Configure buckets FIRST to get user selections before writing config
      MessageFormatter.progress("Configuring storage buckets...", { prefix: "Buckets" });
      const configWithBuckets = await (cli as any).configureBuckets({
        ...(cli as any).controller!.config!,
        databases: allDatabases,
      });

      // Update controller config with bucket selections
      (cli as any).controller!.config = configWithBuckets;

      // Now synchronize configurations with the updated config that includes bucket selections
      MessageFormatter.progress("Pulling tables and generating table files...", { prefix: "Tables" });
      await (cli as any).controller!.synchronizeConfigurations(remoteDatabases, configWithBuckets);
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
              entrypoint: remoteFunction.entrypoint || "src/main.ts",
              commands: remoteFunction.commands || "npm install",
              scopes: remoteFunction.scopes || [],
              installationId: remoteFunction.installationId,
              providerRepositoryId: remoteFunction.providerRepositoryId,
              providerBranch: remoteFunction.providerBranch,
              providerSilentMode: remoteFunction.providerSilentMode,
              providerRootDirectory: remoteFunction.providerRootDirectory,
              buildSpecification: (remoteFunction as any).buildSpecification,
              runtimeSpecification: (remoteFunction as any).runtimeSpecification,
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
              entrypoint: remoteFunction.entrypoint || "src/main.ts",
              commands: remoteFunction.commands || "npm install",
              scopes: remoteFunction.scopes || [],
              installationId: remoteFunction.installationId,
              providerRepositoryId: remoteFunction.providerRepositoryId,
              providerBranch: remoteFunction.providerBranch,
              providerSilentMode: remoteFunction.providerSilentMode,
              providerRootDirectory: remoteFunction.providerRootDirectory,
              buildSpecification: (remoteFunction as any).buildSpecification,
              runtimeSpecification: (remoteFunction as any).runtimeSpecification,
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
          { name: "Selective tables (choose specific tables)", value: "selective-tables" }
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

    if (scopeType === "selective-tables") {
      const databases = await fetchAllDatabases((cli as any).controller!.database);
      const selectedDatabase = await (cli as any).selectDatabases(
        databases,
        "Select database containing tables:",
        false // single selection
      );

      if (!selectedDatabase || selectedDatabase.length === 0) {
        throw new Error("No database selected");
      }

      const db = selectedDatabase[0];
      const collections = await (cli as any).selectCollectionsAndTables(
        db,
        (cli as any).controller!.database!,
        "Select tables to backup:",
        true,
        true,
        true
      );

      return {
        type: "selective-tables",
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
    } else if (scope.type === "selective-tables") {
      summary += `  • Database: ${scope.databaseName}\n`;
      summary += `  • ${scope.collections.length} selected tables\n`;
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
    } else if (scope.type === "selective-tables") {
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
      "Select the database(s) containing the tables to wipe:",
      true
    );

    for (const database of selectedDatabases) {
      const collections = await (cli as any).selectCollectionsAndTables(
        database,
        (cli as any).controller!.database,
        `Select tables to wipe from ${database.name}:`,
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
          `Wiping selected tables from ${database.name}...`,
          { prefix: "Wipe" }
        );
        for (const collection of collections) {
          await (cli as any).controller!.wipeCollection(database, collection);
          MessageFormatter.success(
            `Table ${collection.name} wiped successfully`,
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
    MessageFormatter.success("Wipe tables operation completed", { prefix: "Wipe" });
  },

  async wipeTablesData(cli: InteractiveCLI): Promise<void> {
    const controller = (cli as any).controller;

    if (!controller?.adapter) {
      throw new Error(
        "Database adapter is not initialized. TablesDB operations require adapter support."
      );
    }

    try {
      // Step 1: Select database (single selection for clearer UX)
      const databases = await fetchAllDatabases(controller.database);

      if (!databases || databases.length === 0) {
        MessageFormatter.warning("No databases found", { prefix: "Wipe" });
        return;
      }

      const { selectedDatabase } = await inquirer.prompt([
        {
          type: "list",
          name: "selectedDatabase",
          message: "Select database containing tables to wipe:",
          choices: databases.map((db: any) => ({
            name: `${db.name} (${db.$id})`,
            value: db
          }))
        }
      ]);

      const database = selectedDatabase;

      // Step 2: Get available tables
      const adapter = controller.adapter;
      const tablesResponse = await adapter.listTables({
        databaseId: database.$id,
        queries: [Query.limit(500)]
      });
      const availableTables = (tablesResponse as any).tables || [];

      if (availableTables.length === 0) {
        MessageFormatter.warning(`No tables found in database: ${database.name}`, { prefix: "Wipe" });
        return;
      }

      // Step 3: Select tables using existing SelectionDialogs
      const selectedTableIds = await SelectionDialogs.selectTablesForDatabase(
        database.$id,
        database.name,
        availableTables,
        [], // No configured tables context needed for wipe
        {
          showSelectAll: true,
          allowNewOnly: false,
          defaultSelected: []
        }
      );

      if (selectedTableIds.length === 0) {
        MessageFormatter.warning("No tables selected. Operation cancelled.", { prefix: "Wipe" });
        return;
      }

      // Step 4: Show confirmation with table details
      const selectedTables = availableTables.filter((t: any) =>
        selectedTableIds.includes(t.$id)
      );
      const tableNames = selectedTables.map((t: any) => t.name);

      console.log(chalk.yellow.bold("\n⚠️  WARNING: Table Row Wipe Operation"));
      console.log(chalk.yellow("This will delete ALL ROWS from the selected tables."));
      console.log(chalk.yellow("The table structures will remain intact.\n"));
      console.log(chalk.cyan("Database:"), chalk.white(database.name));
      console.log(chalk.cyan("Tables to wipe:"));
      tableNames.forEach((name: string) => console.log(chalk.white(`  • ${name}`)));
      console.log();

      const { confirmed } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirmed",
          message: chalk.red.bold("Are you ABSOLUTELY SURE you want to wipe these table rows?"),
          default: false
        }
      ]);

      if (!confirmed) {
        MessageFormatter.info("Wipe operation cancelled by user", { prefix: "Wipe" });
        return;
      }

      // Step 5: Execute wipe using existing wipeTableRows function
      MessageFormatter.progress("Starting table row wipe operation...", { prefix: "Wipe" });

      for (const table of selectedTables) {
        try {
          MessageFormatter.info(`Wiping rows from table: ${table.name}`, { prefix: "Wipe" });

          // Use existing wipeTableRows from wipeOperations.ts
          await wipeTableRows(adapter, database.$id, table.$id);

          MessageFormatter.success(
            `Successfully wiped rows from table: ${table.name}`,
            { prefix: "Wipe" }
          );
        } catch (error) {
          MessageFormatter.error(
            `Failed to wipe table ${table.name}`,
            error instanceof Error ? error : new Error(String(error)),
            { prefix: "Wipe" }
          );
        }
      }

      MessageFormatter.success(
        `Wipe operation completed for ${selectedTables.length} table(s)`,
        { prefix: "Wipe" }
      );
    } catch (error) {
      MessageFormatter.error(
        "Table wipe operation failed",
        error instanceof Error ? error : new Error(String(error)),
        { prefix: "Wipe" }
      );
      throw error;
    }
  }
};
