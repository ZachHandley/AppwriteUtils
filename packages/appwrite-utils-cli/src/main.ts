#!/usr/bin/env node
import yargs from "yargs";
import { type ArgumentsCamelCase } from "yargs";
import { hideBin } from "yargs/helpers";
import { InteractiveCLI } from "./interactiveCLI.js";
import { UtilsController, type SetupOptions } from "./utilsController.js";
import type { TransferOptions } from "./migrations/transfer.js";
import { Databases, Storage, type Models } from "node-appwrite";
import { getClient } from "./utils/getClientFromConfig.js";
import { fetchAllDatabases } from "./databases/methods.js";
import { setupDirsFiles } from "./utils/setupFiles.js";
import { fetchAllCollections } from "./collections/methods.js";
import type { Specification } from "appwrite-utils";
import chalk from "chalk";
import { listSpecifications } from "./functions/methods.js";
import { MessageFormatter } from "./shared/messageFormatter.js";
import { ConfirmationDialogs } from "./shared/confirmationDialogs.js";
import path from "path";
import fs from "fs";
import { loadAppwriteProjectConfig, findAppwriteProjectConfig, projectConfigToAppwriteConfig } from "./utils/projectConfig.js";
import { hasSessionAuth, getAvailableSessions, getAuthenticationStatus } from "./utils/sessionAuth.js";
import { findYamlConfig, loadYamlConfigWithSession } from "./config/yamlConfig.js";

interface CliOptions {
  config?: string;
  it?: boolean;
  dbIds?: string;
  collectionIds?: string;
  bucketIds?: string;
  wipe?: "all" | "storage" | "docs" | "users";
  wipeCollections?: boolean;
  generate?: boolean;
  import?: boolean;
  backup?: boolean;
  backupFormat?: 'json' | 'zip';
  comprehensiveBackup?: boolean;
  trackingDatabaseId?: string;
  parallelDownloads?: number;
  writeData?: boolean;
  push?: boolean;
  sync?: boolean;
  endpoint?: string;
  projectId?: string;
  apiKey?: string;
  transfer?: boolean;
  transferUsers?: boolean;
  fromDbId?: string;
  toDbId?: string;
  fromCollectionId?: string;
  toCollectionId?: string;
  fromBucketId?: string;
  toBucketId?: string;
  remoteEndpoint?: string;
  remoteProjectId?: string;
  remoteApiKey?: string;
  setup?: boolean;
  updateFunctionSpec?: boolean;
  functionId?: string;
  specification?: string;
  migrateConfig?: boolean;
  generateConstants?: boolean;
  constantsLanguages?: string;
  constantsOutput?: string;
  migrateCollectionsToTables?: boolean;
  useSession?: boolean;
  session?: string;
  listBackups?: boolean;
}

type ParsedArgv = ArgumentsCamelCase<CliOptions>;

/**
 * Checks if the migration from collections to tables should be allowed
 * Returns an object with:
 * - allowed: boolean indicating if migration should proceed
 * - reason: string explaining why migration was blocked (if not allowed)
 */
function checkMigrationConditions(configPath: string): { allowed: boolean; reason?: string } {
  const collectionsPath = path.join(configPath, "collections");
  const tablesPath = path.join(configPath, "tables");

  // Check if collections/ folder exists
  if (!fs.existsSync(collectionsPath)) {
    return {
      allowed: false,
      reason: "No collections/ folder found. Migration requires existing collections to migrate."
    };
  }

  // Check if collections/ folder has YAML files
  const collectionFiles = fs.readdirSync(collectionsPath).filter(file =>
    file.endsWith(".yaml") || file.endsWith(".yml")
  );

  if (collectionFiles.length === 0) {
    return {
      allowed: false,
      reason: "No YAML files found in collections/ folder. Migration requires existing collection YAML files."
    };
  }

  // Check if tables/ folder exists and has YAML files
  if (fs.existsSync(tablesPath)) {
    const tableFiles = fs.readdirSync(tablesPath).filter(file =>
      file.endsWith(".yaml") || file.endsWith(".yml")
    );

    if (tableFiles.length > 0) {
      return {
        allowed: false,
        reason: `Tables folder already exists with ${tableFiles.length} YAML file(s). Migration appears to have already been completed.`
      };
    }
  }

  // All conditions met
  return { allowed: true };
}

const argv = yargs(hideBin(process.argv))
  .option("config", {
    type: "string",
    description: "Path to Appwrite configuration file (appwriteConfig.ts)",
  })
  .option("it", {
    alias: ["interactive", "i"],
    type: "boolean",
    description: "Launch interactive CLI mode with guided prompts",
  })
  .option("dbIds", {
    type: "string",
    description: "Comma-separated list of database IDs to target (e.g., 'db1,db2,db3')",
  })
  .option("collectionIds", {
    alias: ["collIds", "tableIds", "tables"],
    type: "string",
    description: "Comma-separated list of collection/table IDs to target (e.g., 'users,posts')",
  })
  .option("bucketIds", {
    type: "string",
    description: "Comma-separated list of bucket IDs to operate on",
  })
  .option("wipe", {
    choices: ["all", "docs", "users"] as const,
    description:
      "⚠️  DESTRUCTIVE: Wipe data (all: databases+storage+users, docs: documents only, users: user accounts only)",
  })
  .option("wipeCollections", {
    type: "boolean",
    description:
      "⚠️  DESTRUCTIVE: Wipe specific collections/tables (requires --collectionIds or --tableIds)",
  })
  .option("transferUsers", {
    type: "boolean",
    description: "Transfer users between projects",
  })
  .option("generate", {
    type: "boolean",
    description: "Generate TypeScript schemas and types from your Appwrite database schemas",
  })
  .option("import", {
    type: "boolean",
    description: "Import data from importData/ directory into your Appwrite databases",
  })
  .option("backup", {
    type: "boolean",
    description: "Create a complete backup of your databases and collections",
  })
  .option("backupFormat", {
    type: "string",
    choices: ["json", "zip"] as const,
    default: "json",
    description: "Backup file format (json or zip)",
  })
  .option("listBackups", {
    type: "boolean",
    description: "List all backups for databases",
  })
  .option("comprehensiveBackup", {
    alias: ["comprehensive", "backup-all"],
    type: "boolean",
    description: "🚀 Create comprehensive backup of ALL databases and ALL storage buckets",
  })
  .option("trackingDatabaseId", {
    alias: ["tracking-db"],
    type: "string",
    description: "Database ID to use for centralized backup tracking (interactive prompt if not specified)",
  })
  .option("parallelDownloads", {
    type: "number",
    default: 10,
    description: "Number of parallel file downloads for bucket backups (default: 10)",
  })
  .option("writeData", {
    type: "boolean",
    description: "Output converted import data to files for validation before importing",
  })
  .option("push", {
    type: "boolean",
    description:
      "Deploy your local configuration (collections, attributes, indexes) to Appwrite",
  })
  .option("sync", {
    type: "boolean",
    description:
      "Pull and synchronize your local config with the remote Appwrite project schema",
  })
  .option("endpoint", {
    type: "string",
    description: "Set the Appwrite endpoint",
  })
  .option("projectId", {
    type: "string",
    description: "Set the Appwrite project ID",
  })
  .option("apiKey", {
    type: "string",
    description: "Set the Appwrite API key",
  })
  .option("transfer", {
    type: "boolean",
    description: "Transfer documents and files between databases, collections, or projects",
  })
  .option("fromDbId", {
    alias: ["fromDb", "sourceDbId", "sourceDb"],
    type: "string",
    description: "Source database ID for transfer operations",
  })
  .option("toDbId", {
    alias: ["toDb", "targetDbId", "targetDb"],
    type: "string",
    description: "Target database ID for transfer operations",
  })
  .option("fromCollectionId", {
    alias: ["fromCollId", "fromColl"],
    type: "string",
    description: "Set the source collection ID for transfer",
  })
  .option("toCollectionId", {
    alias: ["toCollId", "toColl"],
    type: "string",
    description: "Set the destination collection ID for transfer",
  })
  .option("fromBucketId", {
    type: "string",
    description: "Set the source bucket ID for transfer",
  })
  .option("toBucketId", {
    type: "string",
    description: "Set the destination bucket ID for transfer",
  })
  .option("remoteEndpoint", {
    type: "string",
    description: "Set the remote Appwrite endpoint for transfer",
  })
  .option("remoteProjectId", {
    type: "string",
    description: "Set the remote Appwrite project ID for transfer",
  })
  .option("remoteApiKey", {
    type: "string",
    description: "Set the remote Appwrite API key for transfer",
  })
  .option("setup", {
    type: "boolean",
    description: "Initialize project with configuration files and directory structure",
  })
  .option("updateFunctionSpec", {
    type: "boolean",
    description: "Update function specifications",
  })
  .option("functionId", {
    type: "string",
    description: "Function ID to update",
  })
  .option("specification", {
    type: "string",
    description: "New function specification (e.g., 's-1vcpu-1gb')",
    choices: [
      "s-0.5vcpu-512mb",
      "s-1vcpu-1gb",
      "s-2vcpu-2gb",
      "s-2vcpu-4gb",
      "s-4vcpu-4gb",
      "s-4vcpu-8gb",
      "s-8vcpu-4gb",
      "s-8vcpu-8gb",
    ],
  })
  .option("migrateConfig", {
    alias: ["migrate"],
    type: "boolean",
    description: "Migrate appwriteConfig.ts to .appwrite structure with YAML configuration",
  })
  .option("generateConstants", {
    alias: ["constants"],
    type: "boolean", 
    description: "Generate cross-language constants file with database, collection, bucket, and function IDs",
  })
  .option("constantsLanguages", {
    type: "string",
    description: "Comma-separated list of languages for constants (typescript,javascript,python,php,dart,json,env)",
    default: "typescript",
  })
  .option("constantsOutput", {
    type: "string",
    description: "Output directory for generated constants files (default: config-folder/constants)",
    default: "auto",
  })
  .option("migrateCollectionsToTables", {
    alias: ["migrate-collections"],
    type: "boolean",
    description: "Migrate collections to tables format for TablesDB API compatibility",
  })
  .option("useSession", {
    alias: ["session"],
    type: "boolean",
    description: "Use Appwrite CLI session authentication instead of API key",
  })
  .option("sessionCookie", {
    type: "string",
    description: "Explicit session cookie to use for authentication",
  })
  .parse() as ParsedArgv;

async function main() {
  const startTime = Date.now();
  const operationStats: Record<string, number> = {};
  
  // Early session detection for better user guidance
  const availableSessions = getAvailableSessions();
  let hasAnyValidSessions = availableSessions.length > 0;

  if (argv.it) {
    const cli = new InteractiveCLI(process.cwd());
    await cli.run();
  } else {
    // Enhanced config creation with session and project file support
    let directConfig: any = undefined;

    // Show authentication status on startup if no config provided
    if (!argv.config && !argv.endpoint && !argv.projectId && !argv.apiKey && !argv.useSession && !argv.sessionCookie) {
      if (hasAnyValidSessions) {
        MessageFormatter.info(`Found ${availableSessions.length} available session(s)`, { prefix: "Auth" });
        availableSessions.forEach(session => {
          MessageFormatter.info(`  \u2022 ${session.projectId} (${session.email || 'unknown'}) at ${session.endpoint}`, { prefix: "Auth" });
        });
        MessageFormatter.info("Use --session to enable session authentication", { prefix: "Auth" });
      } else {
        MessageFormatter.info("No active Appwrite sessions found", { prefix: "Auth" });
        MessageFormatter.info("\u2022 Run 'appwrite login' to authenticate with session", { prefix: "Auth" });
        MessageFormatter.info("\u2022 Or provide --apiKey for API key authentication", { prefix: "Auth" });
      }
    }

    // Priority 1: Check for appwrite.json project configuration
    const projectConfigPath = findAppwriteProjectConfig(process.cwd());
    if (projectConfigPath) {
      const projectConfig = loadAppwriteProjectConfig(projectConfigPath);
      if (projectConfig) {
        directConfig = projectConfigToAppwriteConfig(projectConfig);
        MessageFormatter.info(`Loaded project configuration from ${projectConfigPath}`, { prefix: "CLI" });
      }
    }

    // Priority 2: CLI arguments override project config
    if (argv.endpoint || argv.projectId || argv.apiKey || argv.useSession || argv.sessionCookie) {
      directConfig = {
        ...directConfig,
        appwriteEndpoint: argv.endpoint || directConfig?.appwriteEndpoint,
        appwriteProject: argv.projectId || directConfig?.appwriteProject,
        appwriteKey: argv.apiKey || directConfig?.appwriteKey,
      };
    }

    // Priority 3: Session authentication support with improved detection
    let sessionAuthAvailable = false;

    if (directConfig?.appwriteEndpoint && directConfig?.appwriteProject) {
      sessionAuthAvailable = hasSessionAuth(directConfig.appwriteEndpoint, directConfig.appwriteProject);
    }

    if (argv.useSession || argv.sessionCookie) {
      if (argv.sessionCookie) {
        // Explicit session cookie provided
        MessageFormatter.info("Using explicit session cookie for authentication", { prefix: "Auth" });
      } else if (sessionAuthAvailable) {
        MessageFormatter.info("Session authentication detected and will be used", { prefix: "Auth" });
      } else {
        MessageFormatter.warning("Session authentication requested but no valid session found", { prefix: "Auth" });
        const availableSessions = getAvailableSessions();
        if (availableSessions.length > 0) {
          MessageFormatter.info(`Available sessions: ${availableSessions.map(s => `${s.projectId} (${s.email || 'unknown'})`).join(", ")}`, { prefix: "Auth" });
          MessageFormatter.info("Use --session flag to enable session authentication", { prefix: "Auth" });
        } else {
          MessageFormatter.warning("No Appwrite CLI sessions found. Please run 'appwrite login' first.", { prefix: "Auth" });
        }
        MessageFormatter.error("Session authentication requested but not available", undefined, { prefix: "Auth" });
        return; // Exit early if session auth was requested but not available
      }
    } else if (sessionAuthAvailable && !argv.apiKey) {
      // Auto-detect session authentication when no API key is provided
      MessageFormatter.info("Session authentication detected - no API key required", { prefix: "Auth" });
      MessageFormatter.info("Use --session flag to explicitly enable session authentication", { prefix: "Auth" });
    }

    // Enhanced session authentication support:
    // 1. If session auth is explicitly requested via flags, use it
    // 2. If no API key is provided but sessions are available, offer to use session auth
    // 3. Auto-detect session authentication when possible
    let finalDirectConfig = directConfig;

    if ((argv.useSession || argv.sessionCookie) &&
        (!directConfig || !directConfig.appwriteEndpoint || !directConfig.appwriteProject)) {
      // Don't pass incomplete directConfig - let UtilsController load YAML config normally
      finalDirectConfig = null;
    } else if (finalDirectConfig && !finalDirectConfig.appwriteKey && !argv.useSession && !argv.sessionCookie) {
      // Auto-detect session authentication when no API key provided
      if (sessionAuthAvailable) {
        MessageFormatter.info("No API key provided, but session authentication is available", { prefix: "Auth" });
        MessageFormatter.info("Automatically using session authentication (add --session to suppress this message)", { prefix: "Auth" });
        // Implicitly enable session authentication
        argv.useSession = true;
      }
    }

    // Create controller with session authentication support
    const controller = new UtilsController(process.cwd(), finalDirectConfig);

    // Pass session authentication options to the controller
    const initOptions: any = {};
    if (argv.useSession || argv.sessionCookie) {
      initOptions.useSession = true;
      if (argv.sessionCookie) {
        initOptions.sessionCookie = argv.sessionCookie;
      }
    }

    await controller.init(initOptions);

    if (argv.setup) {
      await setupDirsFiles(false, process.cwd());
      return;
    }

    if (argv.migrateConfig) {
      const { migrateConfig } = await import("./utils/configMigration.js");
      await migrateConfig(process.cwd());
      return;
    }

    if (argv.generateConstants) {
      const { ConstantsGenerator } = await import("./utils/constantsGenerator.js");
      type SupportedLanguage = import("./utils/constantsGenerator.js").SupportedLanguage;
      
      if (!controller.config) {
        MessageFormatter.error("No Appwrite configuration found", undefined, { prefix: "Constants" });
        return;
      }

      const languages = argv.constantsLanguages!.split(",").map(l => l.trim()) as SupportedLanguage[];
      
      // Determine output directory - use config folder/constants by default, or custom path if specified
      let outputDir: string;
      if (argv.constantsOutput === "auto") {
        // Default case: use config directory + constants, fallback to current directory
        const configPath = controller.getAppwriteFolderPath();
        outputDir = configPath 
          ? path.join(configPath, "constants")
          : path.join(process.cwd(), "constants");
      } else {
        // Custom output directory specified
        outputDir = argv.constantsOutput!;
      }
      
      MessageFormatter.info(`Generating constants for languages: ${languages.join(", ")}`, { prefix: "Constants" });
      
      const generator = new ConstantsGenerator(controller.config);
      await generator.generateFiles(languages, outputDir);
      
      operationStats.generatedConstants = languages.length;
      MessageFormatter.success(`Constants generated in ${outputDir}`, { prefix: "Constants" });
      return;
    }

    if (argv.migrateCollectionsToTables) {
      try {
        if (!controller.config) {
          MessageFormatter.error("No Appwrite configuration found", undefined, { prefix: "Migration" });
          return;
        }

        // Get the config path from the controller or use .appwrite in current directory
        let configPath = controller.getAppwriteFolderPath();
        if (!configPath) {
          // Try .appwrite in current directory
          const defaultPath = path.join(process.cwd(), ".appwrite");
          if (fs.existsSync(defaultPath)) {
            configPath = defaultPath;
          } else {
            MessageFormatter.error("Could not determine configuration folder path", undefined, { prefix: "Migration" });
            MessageFormatter.info("Make sure you have a .appwrite/ folder in your current directory", { prefix: "Migration" });
            return;
          }
        }

        // Check if migration conditions are met
        const migrationCheck = checkMigrationConditions(configPath);
        if (!migrationCheck.allowed) {
          MessageFormatter.error(`Migration not allowed: ${migrationCheck.reason}`, undefined, { prefix: "Migration" });
          MessageFormatter.info("Migration requirements:", { prefix: "Migration" });
          MessageFormatter.info("  • Configuration must be loaded (use --config or have .appwrite/ folder)", { prefix: "Migration" });
          MessageFormatter.info("  • collections/ folder must exist with YAML files", { prefix: "Migration" });
          MessageFormatter.info("  • tables/ folder must not exist or be empty", { prefix: "Migration" });
          return;
        }

        const { migrateCollectionsToTables } = await import("./config/configMigration.js");

        MessageFormatter.info("Starting collections to tables migration...", { prefix: "Migration" });
        const result = migrateCollectionsToTables(controller.config, {
          strategy: "full_migration",
          validateResult: true,
          dryRun: false
        });

        if (result.success) {
          operationStats.migratedCollections = result.changes.length;
          MessageFormatter.success("Collections migration completed successfully", { prefix: "Migration" });
        } else {
          MessageFormatter.error(`Migration failed: ${result.errors.join(", ")}`, undefined, { prefix: "Migration" });
          process.exit(1);
        }
      } catch (error) {
        MessageFormatter.error("Migration failed", error instanceof Error ? error : new Error(String(error)), { prefix: "Migration" });
        process.exit(1);
      }
      return;
    }

    if (!controller.config) {
      // Provide better guidance based on available authentication methods
      const availableSessions = getAvailableSessions();

      if (availableSessions.length > 0) {
        MessageFormatter.error("No Appwrite configuration found", undefined, { prefix: "CLI" });
        MessageFormatter.info("Available authentication options:", { prefix: "Auth" });
        MessageFormatter.info("• Session authentication: Add --session flag", { prefix: "Auth" });
        MessageFormatter.info("• API key authentication: Add --apiKey YOUR_API_KEY", { prefix: "Auth" });
        MessageFormatter.info(`• Available sessions: ${availableSessions.map(s => `${s.projectId} (${s.email || 'unknown'})`).join(", ")}`, { prefix: "Auth" });
      } else {
        MessageFormatter.error("No Appwrite configuration found", undefined, { prefix: "CLI" });
        MessageFormatter.info("Authentication options:", { prefix: "Auth" });
        MessageFormatter.info("• Login with Appwrite CLI: Run 'appwrite login' then use --session flag", { prefix: "Auth" });
        MessageFormatter.info("• Use API key: Add --apiKey YOUR_API_KEY", { prefix: "Auth" });
        MessageFormatter.info("• Create config file: Run with --setup to initialize project configuration", { prefix: "Auth" });
      }
      return;
    }

    const parsedArgv = argv;

    // List backups if requested
    if (parsedArgv.listBackups) {
      const { AdapterFactory } = await import("./adapters/AdapterFactory.js");
      const { listBackups } = await import("./shared/backupTracking.js");

      if (!controller.config) {
        MessageFormatter.error("No Appwrite configuration found", undefined, { prefix: "Backups" });
        return;
      }

      const { adapter } = await AdapterFactory.create({
        appwriteEndpoint: controller.config.appwriteEndpoint,
        appwriteProject: controller.config.appwriteProject,
        appwriteKey: controller.config.appwriteKey
      });

      const databases = parsedArgv.dbIds
        ? await controller.getDatabasesByIds(parsedArgv.dbIds.split(","))
        : await fetchAllDatabases(controller.database!);

      if (!databases || databases.length === 0) {
        MessageFormatter.info("No databases found", { prefix: "Backups" });
        return;
      }

      for (const db of databases!) {
        const backups = await listBackups(adapter, db.$id);

        MessageFormatter.info(`\nBackups for database: ${db.name} (${db.$id})`, { prefix: "Backups" });

        if (backups.length === 0) {
          MessageFormatter.info("  No backups found", { prefix: "Backups" });
        } else {
          backups.forEach((backup, index) => {
            const date = new Date(backup.$createdAt).toLocaleString();
            const size = MessageFormatter.formatBytes(backup.sizeBytes);
            MessageFormatter.info(
              `  ${index + 1}. ${date} - ${backup.format.toUpperCase()} - ${size} - ${backup.collections} collections, ${backup.documents} documents`,
              { prefix: "Backups" }
            );
          });
        }
      }

      return;
    }

    const options: SetupOptions = {
      databases: parsedArgv.dbIds
        ? await controller.getDatabasesByIds(parsedArgv.dbIds.split(","))
        : undefined,
      collections: parsedArgv.collectionIds?.split(","),
      doBackup: parsedArgv.backup,
      wipeDatabase: parsedArgv.wipe === "all" || parsedArgv.wipe === "docs",
      wipeDocumentStorage:
        parsedArgv.wipe === "all" || parsedArgv.wipe === "storage",
      wipeUsers: parsedArgv.wipe === "all" || parsedArgv.wipe === "users",
      generateSchemas: parsedArgv.generate,
      importData: parsedArgv.import,
      shouldWriteFile: parsedArgv.writeData,
      wipeCollections: parsedArgv.wipeCollections,
      transferUsers: parsedArgv.transferUsers,
    };

    if (parsedArgv.updateFunctionSpec) {
      if (!parsedArgv.functionId || !parsedArgv.specification) {
        throw new Error(
          "Function ID and specification are required for updating function specs"
        );
      }
      MessageFormatter.info(
        `Updating function specification for ${parsedArgv.functionId} to ${parsedArgv.specification}`,
        { prefix: "Functions" }
      );
      const specifications = await listSpecifications(
        controller.appwriteServer!
      );
      if (
        !specifications.specifications.some(
          (s: { slug: string }) => s.slug === parsedArgv.specification
        )
      ) {
        MessageFormatter.error(
          `Specification ${parsedArgv.specification} not found`,
          undefined,
          { prefix: "Functions" }
        );
        return;
      }
      await controller.updateFunctionSpecifications(
        parsedArgv.functionId,
        parsedArgv.specification as Specification
      );
    }

    // Add default databases if not specified (only if we need them for operations)
    const needsDatabases = options.doBackup || options.wipeDatabase ||
                          options.wipeDocumentStorage || options.wipeUsers ||
                          options.wipeCollections || options.importData ||
                          parsedArgv.sync || parsedArgv.transfer;

    if (needsDatabases && (!options.databases || options.databases.length === 0)) {
      const allDatabases = await fetchAllDatabases(controller.database!);
      options.databases = allDatabases;
    }

    // Add default collections if not specified
    if (!options.collections || options.collections.length === 0) {
      if (controller.config && controller.config.collections) {
        options.collections = controller.config.collections.map((c) => c.name);
      } else {
        options.collections = [];
      }
    }

    // Comprehensive backup (all databases + all buckets)
    if (parsedArgv.comprehensiveBackup) {
      const { comprehensiveBackup } = await import("./backups/operations/comprehensiveBackup.js");
      const { AdapterFactory } = await import("./adapters/AdapterFactory.js");

      // Get tracking database ID (interactive prompt if not specified)
      let trackingDatabaseId = parsedArgv.trackingDatabaseId;

      if (!trackingDatabaseId) {
        // Fetch all databases for selection
        const allDatabases = await fetchAllDatabases(controller.database!);

        if (allDatabases.length === 0) {
          MessageFormatter.error("No databases found. Cannot create comprehensive backup without a tracking database.", undefined, { prefix: "Backup" });
          return;
        }

        if (allDatabases.length === 1) {
          trackingDatabaseId = allDatabases[0].$id;
          MessageFormatter.info(`Using only available database for tracking: ${allDatabases[0].name} (${trackingDatabaseId})`, { prefix: "Backup" });
        } else {
          // Interactive selection
          const inquirer = (await import("inquirer")).default;
          const answer = await inquirer.prompt([{
            type: 'list',
            name: 'trackingDb',
            message: 'Select database to store backup tracking metadata:',
            choices: allDatabases.map(db => ({
              name: `${db.name} (${db.$id})`,
              value: db.$id
            }))
          }]);
          trackingDatabaseId = answer.trackingDb;
        }
      }

      MessageFormatter.info(`Using tracking database: ${trackingDatabaseId}`, { prefix: "Backup" });

      // Create adapter for backup tracking
      const { adapter } = await AdapterFactory.create({
        appwriteEndpoint: controller.config!.appwriteEndpoint,
        appwriteProject: controller.config!.appwriteProject,
        appwriteKey: controller.config!.appwriteKey,
        sessionCookie: controller.config!.sessionCookie
      });

      const result = await comprehensiveBackup(
        controller.config!,
        controller.database!,
        controller.storage!,
        adapter,
        {
          trackingDatabaseId,
          backupFormat: parsedArgv.backupFormat || 'zip',
          parallelDownloads: parsedArgv.parallelDownloads || 10,
          onProgress: (message) => {
            MessageFormatter.info(message, { prefix: "Backup" });
          }
        }
      );

      operationStats.comprehensiveBackup = 1;
      operationStats.databasesBackedUp = result.databaseBackups.length;
      operationStats.bucketsBackedUp = result.bucketBackups.length;
      operationStats.totalBackupSize = MessageFormatter.formatBytes(result.totalSizeBytes);

      if (result.status === 'completed') {
        MessageFormatter.success(`Comprehensive backup completed successfully (ID: ${result.backupId})`, { prefix: "Backup" });
      } else if (result.status === 'partial') {
        MessageFormatter.warning(`Comprehensive backup completed with errors (ID: ${result.backupId})`, { prefix: "Backup" });
        result.errors.forEach(err => MessageFormatter.warning(err, { prefix: "Backup" }));
      } else {
        MessageFormatter.error(`Comprehensive backup failed (ID: ${result.backupId})`, undefined, { prefix: "Backup" });
        result.errors.forEach(err => MessageFormatter.error(err, undefined, { prefix: "Backup" }));
      }
    }

    if (options.doBackup && options.databases) {
      MessageFormatter.info(`Creating backups for ${options.databases.length} database(s) in ${parsedArgv.backupFormat} format`, { prefix: "Backup" });
      for (const db of options.databases) {
        await controller.backupDatabase(db, parsedArgv.backupFormat || 'json');
      }
      operationStats.backups = options.databases.length;
      MessageFormatter.success(`Backup completed for ${options.databases.length} database(s)`, { prefix: "Backup" });
    }

    if (
      options.wipeDatabase ||
      options.wipeDocumentStorage ||
      options.wipeUsers ||
      options.wipeCollections
    ) {
      // Confirm destructive operations
      const databaseNames = options.databases?.map(db => db.name) || [];
      const confirmed = await ConfirmationDialogs.confirmDatabaseWipe(databaseNames, {
        includeStorage: options.wipeDocumentStorage,
        includeUsers: options.wipeUsers
      });
      
      if (!confirmed) {
        MessageFormatter.info("Operation cancelled by user", { prefix: "CLI" });
        return;
      }
      
      let wipeStats = { databases: 0, collections: 0, users: 0, buckets: 0 };
      
      if (parsedArgv.wipe === "all") {
        if (options.databases) {
          for (const db of options.databases) {
            await controller.wipeDatabase(db, true); // true to wipe associated buckets
          }
          wipeStats.databases = options.databases.length;
        }
        await controller.wipeUsers();
        wipeStats.users = 1;
      } else if (parsedArgv.wipe === "docs") {
        if (options.databases) {
          for (const db of options.databases) {
            await controller.wipeBucketFromDatabase(db);
          }
          wipeStats.databases = options.databases.length;
        }
        if (parsedArgv.bucketIds) {
          const bucketIds = parsedArgv.bucketIds.split(",");
          for (const bucketId of bucketIds) {
            await controller.wipeDocumentStorage(bucketId);
          }
          wipeStats.buckets = bucketIds.length;
        }
      } else if (parsedArgv.wipe === "users") {
        await controller.wipeUsers();
        wipeStats.users = 1;
      }

      // Handle specific collection wipes
      if (options.wipeCollections && options.databases) {
        for (const db of options.databases) {
          const dbCollections = await fetchAllCollections(
            db.$id,
            controller.database!
          );
          const collectionsToWipe = dbCollections.filter((c) =>
            options.collections!.includes(c.$id)
          );
          
          // Confirm collection wipe
          const collectionNames = collectionsToWipe.map(c => c.name);
          const collectionConfirmed = await ConfirmationDialogs.confirmCollectionWipe(
            db.name,
            collectionNames
          );
          
          if (collectionConfirmed) {
            for (const collection of collectionsToWipe) {
              await controller.wipeCollection(db, collection);
            }
            wipeStats.collections += collectionsToWipe.length;
          }
        }
      }
      
      // Show wipe operation summary
      if (wipeStats.databases > 0 || wipeStats.collections > 0 || wipeStats.users > 0 || wipeStats.buckets > 0) {
        operationStats.wipedDatabases = wipeStats.databases;
        operationStats.wipedCollections = wipeStats.collections;
        operationStats.wipedUsers = wipeStats.users;
        operationStats.wipedBuckets = wipeStats.buckets;
      }
    }

    if (parsedArgv.push || parsedArgv.sync) {
      const databases =
        options.databases || (await fetchAllDatabases(controller.database!));
      let collections: Models.Collection[] = [];

      if (options.collections) {
        for (const db of databases) {
          const dbCollections = await fetchAllCollections(
            db.$id,
            controller.database!
          );
          collections = collections.concat(
            dbCollections.filter((c) => options.collections!.includes(c.$id))
          );
        }
      }

      if (parsedArgv.push) {
        await controller.syncDb(databases, collections);
        operationStats.pushedDatabases = databases.length;
        operationStats.pushedCollections = collections.length;
      } else if (parsedArgv.sync) {
        await controller.synchronizeConfigurations(databases);
        operationStats.syncedDatabases = databases.length;
      }
    }

    if (options.generateSchemas) {
      await controller.generateSchemas();
      operationStats.generatedSchemas = 1;
    }

    if (options.importData) {
      await controller.importData(options);
      operationStats.importCompleted = 1;
    }

    if (parsedArgv.transfer) {
      const isRemote = !!parsedArgv.remoteEndpoint;
      let fromDb, toDb: Models.Database | undefined;
      let targetDatabases: Databases | undefined;
      let targetStorage: Storage | undefined;

      // Only fetch databases if database IDs are provided
      if (parsedArgv.fromDbId && parsedArgv.toDbId) {
        MessageFormatter.info(
          `Starting database transfer from ${parsedArgv.fromDbId} to ${parsedArgv.toDbId}`,
          { prefix: "Transfer" }
        );
        fromDb = (
          await controller.getDatabasesByIds([parsedArgv.fromDbId])
        )?.[0];
        if (!fromDb) {
          MessageFormatter.error("Source database not found", undefined, { prefix: "Transfer" });
          return;
        }
        if (isRemote) {
          if (
            !parsedArgv.remoteEndpoint ||
            !parsedArgv.remoteProjectId ||
            !parsedArgv.remoteApiKey
          ) {
            throw new Error("Remote transfer details are missing");
          }
          const remoteClient = getClient(
            parsedArgv.remoteEndpoint,
            parsedArgv.remoteProjectId,
            parsedArgv.remoteApiKey
          );
          targetDatabases = new Databases(remoteClient);
          targetStorage = new Storage(remoteClient);
          const remoteDbs = await fetchAllDatabases(targetDatabases);
          toDb = remoteDbs.find((db) => db.$id === parsedArgv.toDbId);
          if (!toDb) {
            MessageFormatter.error("Target database not found", undefined, { prefix: "Transfer" });
            return;
          }
        } else {
          toDb = (await controller.getDatabasesByIds([parsedArgv.toDbId]))?.[0];
          if (!toDb) {
            MessageFormatter.error("Target database not found", undefined, { prefix: "Transfer" });
            return;
          }
        }

        if (!fromDb || !toDb) {
          MessageFormatter.error("Source or target database not found", undefined, { prefix: "Transfer" });
          return;
        }
      }

      // Handle storage setup
      let sourceBucket, targetBucket;
      if (parsedArgv.fromBucketId) {
        sourceBucket = await controller.storage?.getBucket(
          parsedArgv.fromBucketId
        );
      }
      if (parsedArgv.toBucketId) {
        if (isRemote) {
          if (!targetStorage) {
            const remoteClient = getClient(
              parsedArgv.remoteEndpoint!,
              parsedArgv.remoteProjectId!,
              parsedArgv.remoteApiKey!
            );
            targetStorage = new Storage(remoteClient);
          }
          targetBucket = await targetStorage?.getBucket(parsedArgv.toBucketId);
        } else {
          targetBucket = await controller.storage?.getBucket(
            parsedArgv.toBucketId
          );
        }
      }

      // Validate that at least one transfer type is specified
      if (!fromDb && !sourceBucket && !options.transferUsers) {
        throw new Error("No source database or bucket specified for transfer");
      }

      const transferOptions: TransferOptions = {
        isRemote,
        fromDb,
        targetDb: toDb,
        transferEndpoint: parsedArgv.remoteEndpoint,
        transferProject: parsedArgv.remoteProjectId,
        transferKey: parsedArgv.remoteApiKey,
        sourceBucket: sourceBucket,
        targetBucket: targetBucket,
        transferUsers: options.transferUsers,
      };

      await controller.transferData(transferOptions);
      operationStats.transfers = 1;
    }
    
    // Show final operation summary if any operations were performed
    if (Object.keys(operationStats).length > 0) {
      const duration = Date.now() - startTime;
      MessageFormatter.operationSummary("CLI Operations", operationStats, duration);
    }
  }
}

main().catch((error) => {
  MessageFormatter.error("CLI execution failed", error, { prefix: "CLI" });
  process.exit(1);
});
