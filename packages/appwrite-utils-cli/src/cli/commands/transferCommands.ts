import inquirer from "inquirer";
import { Databases, Storage } from "node-appwrite";
import { MessageFormatter } from "../../shared/messageFormatter.js";
import { fetchAllDatabases } from "../../databases/methods.js";
import { listBuckets } from "../../storage/methods.js";
import { getClient } from "../../utils/getClientFromConfig.js";
import { ComprehensiveTransfer, type ComprehensiveTransferOptions } from "../../migrations/comprehensiveTransfer.js";
import type { TransferOptions } from "../../migrations/transfer.js";
import type { InteractiveCLI } from "../../interactiveCLI.js";

export const transferCommands = {
  async transferData(cli: InteractiveCLI): Promise<void> {
    if (!(cli as any).controller!.database) {
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

    let sourceClient = (cli as any).controller!.database;
    let targetClient: Databases;
    let sourceDatabases: any[];
    let targetDatabases: any[];
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

    const fromDbs = await (cli as any).selectDatabases(
      sourceDatabases,
      "Select the source database:",
      false
    );
    const fromDb = fromDbs[0];
    if (!fromDb) {
      throw new Error("No source database selected");
    }
    const availableDbs = targetDatabases.filter((db: any) => db.$id !== fromDb.$id);
    const targetDbs = await (cli as any).selectDatabases(
      availableDbs,
      "Select the target database:",
      false
    );
    const targetDb = targetDbs[0];
    if (!targetDb) {
      throw new Error("No target database selected");
    }

    const selectedCollections = await (cli as any).selectCollectionsAndTables(
      fromDb,
      sourceClient,
      "Select collections/tables to transfer:",
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
      const sourceStorage = new Storage((cli as any).controller!.appwriteServer!);
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

      const sourceBucketPicked = await (cli as any).selectBuckets(
        sourceBuckets.buckets,
        "Select the source bucket:",
        false
      );
      const targetBucketPicked = await (cli as any).selectBuckets(
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
          ? selectedCollections.map((c: any) => c.$id)
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

    MessageFormatter.progress("Transferring data...", { prefix: "Transfer" });
    await (cli as any).controller!.transferData(transferOptions);
    MessageFormatter.success("Data transfer completed", { prefix: "Transfer" });
  },

  async comprehensiveTransfer(cli: InteractiveCLI): Promise<void> {
    MessageFormatter.info("Starting comprehensive transfer configuration...", { prefix: "Transfer" });

    try {
      // Initialize controller to optionally load config if available (supports both YAML and TypeScript configs)
      await (cli as any).initControllerIfNeeded();

      // Extract session for potential transfer operations
      const sessionConfig = (cli as any).extractSessionFromController();

      // Check if user has an appwrite config for easier setup
      const hasAppwriteConfig = (cli as any).controller?.config?.appwriteEndpoint &&
                               (cli as any).controller?.config?.appwriteProject &&
                               (cli as any).controller?.config?.appwriteKey;

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
            sourceEndpoint: (cli as any).controller!.config!.appwriteEndpoint,
            sourceProject: (cli as any).controller!.config!.appwriteProject,
            sourceKey: (cli as any).controller!.config!.appwriteKey,
          };
          // Preserve session for source if available
          if (sessionConfig?.sessionCookie) {
            sourceConfig.sessionCookie = sessionConfig.sessionCookie;
            sourceConfig.sessionMetadata = sessionConfig.sessionMetadata;
          }
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
            targetEndpoint: (cli as any).controller!.config!.appwriteEndpoint,
            targetProject: (cli as any).controller!.config!.appwriteProject,
            targetKey: (cli as any).controller!.config!.appwriteKey,
          };
          // Preserve session for target if available
          if (sessionConfig?.sessionCookie) {
            targetConfig.sessionCookie = sessionConfig.sessionCookie;
            targetConfig.sessionMetadata = sessionConfig.sessionMetadata;
          }
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
            { name: "👥 Teams", value: "teams", checked: true },
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
        transferTeams: transferOptions.transferTypes.includes("teams"),
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
        if (transferOptions.transferTypes.includes("teams") && results.teams.transferred > 0) {
          MessageFormatter.info("Team memberships have been transferred and may require user acceptance of invitations", { prefix: "Transfer" });
        }
      }

    } catch (error) {
      MessageFormatter.error("Comprehensive transfer failed", error instanceof Error ? error : new Error(String(error)), { prefix: "Transfer" });
    }
  }
};
