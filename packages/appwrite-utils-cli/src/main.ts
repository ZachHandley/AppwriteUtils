#!/usr/bin/env node
import yargs from "yargs";
import { type ArgumentsCamelCase } from "yargs";
import { hideBin } from "yargs/helpers";
import { InteractiveCLI } from "./interactiveCLI.js";
import { UtilsController, type SetupOptions } from "./utilsController.js";
import type { TransferOptions } from "./migrations/transfer.js";
import { Databases, Storage, type Models } from "node-appwrite";
import { getClient } from "appwrite-utils-helpers";
import { fetchAllDatabases } from "./databases/methods.js";
import { setupDirsFiles } from "./utils/setupFiles.js";
import { logCliError } from "./utils/errorLogger.js";
import { fetchAllCollections } from "./collections/methods.js";
import type { Specification } from "appwrite-utils";
import chalk from "chalk";
import { listSpecifications } from "./functions/methods.js";
import {
  MessageFormatter,
  logger,
  AuthenticationError,
  configureLoggingPreset,
} from "appwrite-utils-helpers";
import { ConfirmationDialogs } from "./shared/confirmationDialogs.js";
import { SelectionDialogs } from "./shared/selectionDialogs.js";
import type { SyncSelectionSummary, DatabaseSelection, BucketSelection } from "./shared/selectionDialogs.js";
import path from "path";
import fs from "fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
if (!(globalThis as any).require) {
  (globalThis as any).require = require;
}

interface CliOptions {
  config?: string;
  appwriteConfig?: boolean;
  it?: boolean;
  dbIds?: string;
  collectionIds?: string;
  bucketIds?: string;
  wipe?: "all" | "storage" | "docs" | "users";
  wipeCollections?: boolean;
  generate?: boolean;
  import?: boolean;
  backup?: boolean;
  backupFormat?: "json" | "zip";
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
  buildSpecification?: string;
  runtimeSpecification?: string;
  migrateConfig?: boolean;
  generateConstants?: boolean;
  constantsLanguages?: string;
  constantsOutput?: string;
  migrateCollectionsToTables?: boolean;
  useSession?: boolean;
  sessionCookie?: string;
  debug?: boolean;
  listBackups?: boolean;
  autoSync?: boolean;
  selectBuckets?: boolean;
  // New schema/constant CLI flags
  generateSchemas?: boolean;
  schemaFormat?: 'zod' | 'json' | 'pydantic' | 'both' | 'all';
  schemaOutDir?: string;
  constantsInclude?: string;
  // Direct file import
  importFile?: string;
  targetDb?: string;
  targetTable?: string;
  // New sidecar/bootstrap/passthrough flags
  init?: boolean;
  upgradeConfig?: boolean;
  passthrough?: boolean;
  regen?: string;
  noDeploy?: boolean;
  forceOverwriteSecrets?: boolean;
  syncExtensions?: boolean;
  pullSelective?: boolean;
}

type ParsedArgv = ArgumentsCamelCase<CliOptions>;

/**
 * Enhanced sync function with intelligent configuration detection and selection dialogs
 */
async function performEnhancedSync(
  controller: UtilsController,
  parsedArgv: ParsedArgv
): Promise<SyncSelectionSummary | null> {
  try {
    MessageFormatter.banner("Enhanced Sync", "Intelligent configuration detection and selection");

    if (!controller.config) {
      MessageFormatter.error("No Appwrite configuration found", undefined, { prefix: "Sync" });
      return null;
    }

    // Get all available databases from remote
    const availableDatabases = await fetchAllDatabases(controller.database!);
    if (availableDatabases.length === 0) {
      MessageFormatter.warning("No databases found in remote project", { prefix: "Sync" });
      return null;
    }

    // Get existing configuration
    const configuredDatabases = controller.config.databases || [];
    const configuredBuckets = controller.config.buckets || [];

    // Check if we have existing configuration
    const hasExistingConfig = configuredDatabases.length > 0 || configuredBuckets.length > 0;

    let syncExisting = false;
    let modifyConfiguration = true;

    if (hasExistingConfig) {
      // Prompt about existing configuration
      const response = await SelectionDialogs.promptForExistingConfig([
        ...configuredDatabases,
        ...configuredBuckets
      ]);
      syncExisting = response.syncExisting;
      modifyConfiguration = response.modifyConfiguration;

      if (syncExisting && !modifyConfiguration) {
        // Just sync existing configuration without changes
        MessageFormatter.info("Syncing existing configuration without modifications", { prefix: "Sync" });

        // Convert configured databases to DatabaseSelection format
        const databaseSelections: DatabaseSelection[] = configuredDatabases.map(db => ({
          databaseId: db.$id,
          databaseName: db.name,
          tableIds: [], // Tables will be populated from collections config
          tableNames: [],
          isNew: false
        }));

        // Convert configured buckets to BucketSelection format
        const bucketSelections: BucketSelection[] = configuredBuckets.map(bucket => ({
          bucketId: bucket.$id,
          bucketName: bucket.name,
          databaseId: undefined,
          databaseName: undefined,
          isNew: false
        }));

        const selectionSummary = SelectionDialogs.createSyncSelectionSummary(
          databaseSelections,
          bucketSelections
        );

        const confirmed = await SelectionDialogs.confirmSyncSelection(selectionSummary, 'pull');
        if (!confirmed) {
          MessageFormatter.info("Pull operation cancelled by user", { prefix: "Sync" });
          return null;
        }

        // Perform sync with existing configuration (pull from remote)
        await controller.selectivePull(databaseSelections, bucketSelections);
        return selectionSummary;
      }
    }

    if (!modifyConfiguration) {
      MessageFormatter.info("No configuration changes requested", { prefix: "Sync" });
      return null;
    }

    // Allow new items selection based on user choice
    const allowNewOnly = !syncExisting;

    // Select databases
    const selectedDatabaseIds = await SelectionDialogs.selectDatabases(
      availableDatabases,
      configuredDatabases,
      {
        showSelectAll: false,
        allowNewOnly,
        defaultSelected: []
      }
    );

    if (selectedDatabaseIds.length === 0) {
      MessageFormatter.warning("No databases selected for sync", { prefix: "Sync" });
      return null;
    }

    // For each selected database, get available tables and select them
    const tableSelectionsMap = new Map<string, string[]>();
    const availableTablesMap = new Map<string, any[]>();

    for (const databaseId of selectedDatabaseIds) {
      const database = availableDatabases.find(db => db.$id === databaseId)!;

      SelectionDialogs.showProgress(`Fetching tables for database: ${database.name}`);

      // Get available tables from remote
      const availableTables = await fetchAllCollections(databaseId, controller.database!);
      availableTablesMap.set(databaseId, availableTables);

      // Get configured tables for this database
      // Note: Collections are stored globally in the config, not per database
      const configuredTables = controller.config.collections || [];

      // Select tables for this database
      const selectedTableIds = await SelectionDialogs.selectTablesForDatabase(
        databaseId,
        database.name,
        availableTables,
        configuredTables,
        {
          showSelectAll: false,
          allowNewOnly,
          defaultSelected: []
        }
      );

      tableSelectionsMap.set(databaseId, selectedTableIds);

      if (selectedTableIds.length === 0) {
        MessageFormatter.warning(`No tables selected for database: ${database.name}`, { prefix: "Sync" });
      }
    }

    // Select buckets
    let selectedBucketIds: string[] = [];

    // Get available buckets from remote
    if (controller.storage) {
      try {
        // Note: We need to implement fetchAllBuckets or use storage.listBuckets
        // For now, we'll use configured buckets as available
        SelectionDialogs.showProgress("Fetching storage buckets...");

        // Create a mock availableBuckets array - in real implementation,
        // you'd fetch this from the Appwrite API
        const availableBuckets = configuredBuckets; // Placeholder

        selectedBucketIds = await SelectionDialogs.selectBucketsForDatabases(
          selectedDatabaseIds,
          availableBuckets,
          configuredBuckets,
          {
            showSelectAll: false,
            allowNewOnly: parsedArgv.selectBuckets ? false : allowNewOnly,
            groupByDatabase: true,
            defaultSelected: []
          }
        );
      } catch (error) {
        MessageFormatter.warning("Could not fetch storage buckets", { prefix: "Sync" });
        logger.warn("Failed to fetch buckets during sync", { error });
      }
    }

    // Create selection objects
    const databaseSelections = SelectionDialogs.createDatabaseSelection(
      selectedDatabaseIds,
      availableDatabases,
      tableSelectionsMap,
      configuredDatabases,
      availableTablesMap
    );

    const bucketSelections = SelectionDialogs.createBucketSelection(
      selectedBucketIds,
      [], // availableBuckets - would be populated from API
      configuredBuckets,
      availableDatabases
    );

    // Show final confirmation
    const selectionSummary = SelectionDialogs.createSyncSelectionSummary(
      databaseSelections,
      bucketSelections
    );

    const confirmed = await SelectionDialogs.confirmSyncSelection(selectionSummary, 'pull');
    if (!confirmed) {
      MessageFormatter.info("Pull operation cancelled by user", { prefix: "Sync" });
      return null;
    }

    // Perform the selective sync (pull from remote)
    await controller.selectivePull(databaseSelections, bucketSelections);

    MessageFormatter.success("Enhanced sync completed successfully", { prefix: "Sync" });
    return selectionSummary;

  } catch (error) {
    SelectionDialogs.showError("Enhanced sync failed", error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

/**
 * Performs selective sync with the given database and bucket selections
 */

/**
 * Checks if the migration from collections to tables should be allowed
 * Returns an object with:
 * - allowed: boolean indicating if migration should proceed
 * - reason: string explaining why migration was blocked (if not allowed)
 */
function checkMigrationConditions(configPath: string): {
  allowed: boolean;
  reason?: string;
} {
  const collectionsPath = path.join(configPath, "collections");
  const tablesPath = path.join(configPath, "tables");

  // Check if collections/ folder exists
  if (!fs.existsSync(collectionsPath)) {
    return {
      allowed: false,
      reason:
        "No collections/ folder found. Migration requires existing collections to migrate.",
    };
  }

  // Check if collections/ folder has YAML files
  const collectionFiles = fs
    .readdirSync(collectionsPath)
    .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"));

  if (collectionFiles.length === 0) {
    return {
      allowed: false,
      reason:
        "No YAML files found in collections/ folder. Migration requires existing collection YAML files.",
    };
  }

  // Check if tables/ folder exists and has YAML files
  if (fs.existsSync(tablesPath)) {
    const tableFiles = fs
      .readdirSync(tablesPath)
      .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"));

    if (tableFiles.length > 0) {
      return {
        allowed: false,
        reason: `Tables folder already exists with ${tableFiles.length} YAML file(s). Migration appears to have already been completed.`,
      };
    }
  }

  // All conditions met
  return { allowed: true };
}

const argv = yargs(hideBin(process.argv))
  .parserConfiguration({ "populate--": true })
  .option("config", {
    type: "string",
    description: "Path to Appwrite configuration file (appwriteConfig.ts)",
  })
  .option("appwriteConfig", {
    alias: ["appwrite-config", "use-appwrite-config"],
    type: "boolean",
    description: "Prefer loading from appwrite.config.json instead of config.yaml",
  })
  .option("it", {
    alias: ["interactive", "i"],
    type: "boolean",
    description: "Launch interactive CLI mode with guided prompts",
  })
  .option("dbIds", {
    type: "string",
    description:
      "Comma-separated list of database IDs to target (e.g., 'db1,db2,db3')",
  })
  .option("collectionIds", {
    alias: ["collIds", "tableIds", "tables"],
    type: "string",
    description:
      "Comma-separated list of collection/table IDs to target (e.g., 'users,posts')",
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
    description:
      "Generate TypeScript schemas and types from your Appwrite database schemas",
  })
  .option("import", {
    type: "boolean",
    description:
      "Import data from importData/ directory into your Appwrite databases",
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
    description:
      "🚀 Create comprehensive backup of ALL databases and ALL storage buckets",
  })
  .option("trackingDatabaseId", {
    alias: ["tracking-db"],
    type: "string",
    description:
      "Database ID to use for centralized backup tracking (interactive prompt if not specified)",
  })
  .option("parallelDownloads", {
    type: "number",
    default: 10,
    description:
      "Number of parallel file downloads for bucket backups (default: 10)",
  })
  .option("writeData", {
    type: "boolean",
    description:
      "Output converted import data to files for validation before importing",
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
  .option("autoSync", {
    alias: ["auto"],
    type: "boolean",
    description: "Skip prompts and sync all databases, tables, and buckets (current behavior)"
  })
  .option("selectBuckets", {
    type: "boolean",
    description: "Force bucket selection dialog even if buckets are already configured"
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
    description:
      "Transfer documents and files between databases, collections, or projects",
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
    description:
      "Initialize project with configuration files and directory structure",
  })
  .option("updateFunctionSpec", {
    type: "boolean",
    description: "Update function specifications",
  })
  .option("functionId", {
    type: "string",
    description: "Function ID to update",
  })
  .option("buildSpecification", {
    type: "string",
    description: "New function build specification (e.g., 's-1vcpu-1gb')",
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
  .option("runtimeSpecification", {
    type: "string",
    description: "New function runtime specification (e.g., 's-1vcpu-1gb')",
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
    description:
      "Migrate appwriteConfig.ts to .appwrite structure with YAML configuration",
  })
  .option("generateConstants", {
    alias: ["constants"],
    type: "boolean",
    description:
      "Generate cross-language constants file with database, collection, bucket, and function IDs",
  })
  .option("constantsLanguages", {
    type: "string",
    description:
      "Comma-separated list of languages for constants (typescript,javascript,python,php,dart,json,env)",
    default: "typescript",
  })
  .option("constantsOutput", {
    type: "string",
    description:
      "Output directory for generated constants files (default: config-folder/constants)",
    default: "auto",
  })
  .option("constantsInclude", {
    type: "string",
    description:
      "Comma-separated categories to include: databases,collections,buckets,functions",
  })
  .option("generateSchemas", {
    type: "boolean",
    description: "Generate schemas/models without interactive prompts",
  })
  .option("schemaFormat", {
    type: "string",
    choices: ["zod", "json", "pydantic", "both", "all"],
    description: "Schema format: zod, json, pydantic, both (zod+json), or all",
  })
  .option("schemaOutDir", {
    type: "string",
    description: "Output directory for generated schemas (absolute path respected)",
  })
  .option("migrateCollectionsToTables", {
    alias: ["migrate-collections"],
    type: "boolean",
    description:
      "Migrate collections to tables format for TablesDB API compatibility",
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
  .option("importFile", {
    alias: ["import-file"],
    type: "string",
    description: "Import a CSV or JSON file directly into a table (no config needed)",
  })
  .option("targetDb", {
    alias: ["target-db"],
    type: "string",
    description: "Target database ID for --importFile (prompted if omitted)",
  })
  .option("targetTable", {
    alias: ["target-table"],
    type: "string",
    description: "Target table ID for --importFile (prompted if omitted)",
  })
  .option("init", {
    alias: ["initialize", "init-project", "link", "link-project"],
    type: "boolean",
    description: "Link this project to Appwrite (runs `appwrite init project`) and create the AppwriteUtils sidecar config",
  })
  .option("upgradeConfig", {
    alias: ["upgrade-config"],
    type: "boolean",
    description: "Opt-in: rewrite legacy AppwriteUtils config.yaml to the new sidecar format (appwrite-utils.config.yaml + appwrite.config.json)",
  })
  .option("passthrough", {
    alias: ["pass-through", "appwrite-cli"],
    type: "boolean",
    description: "Pass remaining args to the official `appwrite` CLI through our auth bridge. Use `-- <appwrite args...>` after this flag. Example: appwrite-migrate --passthrough -- functions list",
  })
  .option("regen", {
    type: "string",
    description: "Regenerate official JSON + push. Target syntax: <resource>[:<id>] or 'all'. V1 supports: all | functions[:<id>] | sites[:<id>]",
  })
  .option("noDeploy", {
    alias: ["no-deploy"],
    type: "boolean",
    description: "With --regen: only write the aggregated JSON; skip the push call",
  })
  .option("forceOverwriteSecrets", {
    alias: ["force-overwrite-secrets", "force-secrets"],
    type: "boolean",
    description:
      "With --regen functions/all: overwrite Appwrite-side secret variables from the local sidecar `vars` block. Default preserves server-side secrets (OneUptime tokens, payment keys, etc.). Per-function `forceOverwriteSecrets: true` in the sidecar wins over this flag if set.",
  })
  .option("syncExtensions", {
    alias: ["sync-extensions"],
    type: "boolean",
    description: "Add empty extension stubs in the sidecar for any $id in the official config that is missing from extensions.<resource>. Orphans (sidecar entries missing from official) are surfaced as warnings but never deleted.",
  })
  .option("pullSelective", {
    alias: ["pull-selective", "pull"],
    type: "boolean",
    description: "Re-run the selective post-link pull (functions + tables + filtered buckets, never teams by default). Useful after --link or when remote schema changed.",
  })
  .option("debug", {
    type: "boolean",
    default: false,
    description: "Enable verbose helpers logging (debug level + console transport). Use when auth/discovery is failing silently.",
  })
  .parse() as ParsedArgv;

// Idempotent process-wide exit. Multiple SIGINTs (or SIGINT-then-SIGTERM)
// collapse to a single process.exit. Without this, a Ctrl+C during an inquirer
// prompt that's already been torn down by `runAppwriteCli`'s signal mirroring
// would otherwise print a stack trace from the second handler firing.
let __awuExiting = false;
function __awuExit(code: number): void {
  if (__awuExiting) return;
  __awuExiting = true;
  process.exit(code);
}
process.on("SIGINT", () => __awuExit(130));
process.on("SIGTERM", () => __awuExit(143));

// Global error capture. Without these handlers, an inquirer-internal crash
// (or any other top-level throw inside an async path) just dumps a raw stack
// trace and dies — making bug reports impossible to triage because the
// failing object's shape is never preserved anywhere. The MCP package has
// the same pattern at packages/appwrite-utils-mcp/src/bin/appwrite-mcp.ts:62.
process.on("uncaughtException", (error) => {
  logCliError({
    command: "<uncaughtException>",
    args: process.argv.slice(2),
    error,
    context: { cwd: process.cwd() },
  });
  __awuExit(1);
});
process.on("unhandledRejection", (reason) => {
  logCliError({
    command: "<unhandledRejection>",
    args: process.argv.slice(2),
    error: reason,
    context: { cwd: process.cwd() },
  });
  __awuExit(1);
});

async function main() {
  const startTime = Date.now();
  const operationStats: Record<string, number> = {};

  // --debug: flip the helpers winston logger from silent default to
  // debug-level with console transport. Without this, all the diagnostic
  // logs in SessionAuthService/ConfigManager are invisible — the silent
  // default is great for production but useless when something's broken.
  if (argv.debug) {
    configureLoggingPreset("debug");
    MessageFormatter.info("Debug logging enabled (helpers logs → console at debug level)", { prefix: "CLI" });
  }

  if (argv.it) {
    const cli = new InteractiveCLI(process.cwd(), {
      useSession: argv.useSession,
      sessionCookie: argv.sessionCookie
    });
    await cli.run();
  } else {
    // Non-interactive mode - pass auth flags through to controller
    // ConfigManager will handle config discovery and auth decisions
    // Users can provide credentials via CLI flags even without a config file

    const controller = UtilsController.getInstance(process.cwd());

    // Build init options from CLI flags
    const initOptions: any = {
      useSession: argv.useSession,
      sessionCookie: argv.sessionCookie,
      preferJson: argv.appwriteConfig,
    };

    // Add CLI overrides if provided - these can work even without a config file
    if (argv.endpoint || argv.projectId || argv.apiKey) {
      initOptions.overrides = {
        appwriteEndpoint: argv.endpoint,
        appwriteProject: argv.projectId,
        appwriteKey: argv.apiKey,
      };
    }

    try {
      await controller.init(initOptions);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        // --init / --upgradeConfig / --passthrough can legitimately run without a fully wired config.
        // Defer auth handling to those flows; otherwise surface the error and exit.
        if (!argv.init && !argv.upgradeConfig && !argv.passthrough && !argv.regen && !argv.syncExtensions && !argv.pullSelective) {
          MessageFormatter.error(error.getFormattedMessage(), undefined, { prefix: "Auth" });
          process.exit(1);
        }
      } else {
        // Re-throw other errors
        throw error;
      }
    }

    // --init: bootstrap project + sidecar
    if (argv.init) {
      const { runInitFlow } = await import("./cli/commands/initFlow.js");
      await runInitFlow({
        cwd: process.cwd(),
        configPath: argv.config,
        credentials: argv.endpoint && argv.projectId ? {
          endpoint: argv.endpoint, projectId: argv.projectId, apiKey: argv.apiKey,
        } : undefined,
      });
      return;
    }

    // --upgradeConfig: opt-in rewrite of old YAML to new sidecar
    if (argv.upgradeConfig) {
      const { runUpgradeConfigFlow } = await import("./cli/commands/upgradeConfigFlow.js");
      await runUpgradeConfigFlow({ cwd: process.cwd() });
      return;
    }

    // --passthrough: forward remaining args to `appwrite` CLI through our auth bridge
    if (argv.passthrough) {
      const { runPassthrough } = await import("./cli/commands/passthroughCommand.js");
      // With parserConfiguration({ "populate--": true }), args after `--` land in
      // argv["--"]. Fall back to argv._ for users who omit the `--` separator.
      const afterDashDash = ((argv as any)["--"] as string[] | undefined) ?? [];
      const positional = (argv._ as Array<string | number>).map((s) => String(s));
      const rest = afterDashDash.length > 0 ? afterDashDash : positional;
      await runPassthrough(rest, {
        configPath: argv.config,
        credentials: argv.endpoint && argv.projectId ? {
          endpoint: argv.endpoint, projectId: argv.projectId, apiKey: argv.apiKey,
        } : undefined,
      });
      return;
    }

    // --regen: unified regen+push for a resource target
    if (argv.regen) {
      const { runRegenFlow } = await import("./cli/commands/regenFlow.js");
      await runRegenFlow({
        target: argv.regen,
        configPath: argv.config,
        noDeploy: argv.noDeploy,
        forceOverwriteSecrets: argv.forceOverwriteSecrets,
        argvCredentials: argv.endpoint && argv.projectId
          ? { endpoint: argv.endpoint, projectId: argv.projectId, apiKey: argv.apiKey }
          : undefined,
      });
      return;
    }

    // --sync-extensions: backfill ext.extensions stubs from the official config
    if (argv.syncExtensions) {
      const { runSyncExtensionsFlow } = await import(
        "./cli/commands/syncExtensionsFlow.js"
      );
      await runSyncExtensionsFlow({ configPath: argv.config });
      return;
    }

    // --pull-selective: re-run the post-link selective pull (no re-link needed)
    if (argv.pullSelective) {
      const { runSelectivePullFlow } = await import(
        "./cli/commands/selectivePullFlow.js"
      );
      await runSelectivePullFlow({
        configPath: argv.config,
        credentials: argv.endpoint && argv.projectId ? {
          endpoint: argv.endpoint, projectId: argv.projectId, apiKey: argv.apiKey,
        } : undefined,
      });
      return;
    }

    // After init, check if we have a valid config (from file OR CLI overrides)
    if (!controller.config) {
      MessageFormatter.error("No Appwrite configuration available", undefined, { prefix: "CLI" });
      MessageFormatter.info("Provide credentials via CLI flags (--endpoint, --projectId, --apiKey or --session)", { prefix: "CLI" });
      MessageFormatter.info("Or create a config file using --setup", { prefix: "CLI" });
      return;
    }

    const parsedArgv = argv;

    if (argv.importFile) {
      const { importFileFromPath, importFilePromptMissing } = await import("./cli/commands/importFileCommands.js");
      if (!controller.adapter) {
        MessageFormatter.error("No adapter available — check your credentials", undefined, { prefix: "Import" });
        return;
      }
      if (parsedArgv.targetDb && parsedArgv.targetTable) {
        await importFileFromPath(controller.adapter, argv.importFile, parsedArgv.targetDb, parsedArgv.targetTable);
      } else {
        await importFilePromptMissing(controller.adapter, controller.database, argv.importFile, parsedArgv.targetDb, parsedArgv.targetTable);
      }
      return;
    }

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
      const { ConstantsGenerator } = await import(
        "appwrite-utils-helpers"
      );
      type SupportedLanguage =
        import("appwrite-utils-helpers").SupportedLanguage;

      if (!controller.config) {
        MessageFormatter.error("No Appwrite configuration found", undefined, {
          prefix: "Constants",
        });
        return;
      }

      const languages = argv
        .constantsLanguages!.split(",")
        .map((l) => l.trim()) as SupportedLanguage[];

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

      MessageFormatter.info(
        `Generating constants for languages: ${languages.join(", ")}`,
        { prefix: "Constants" }
      );

      const generator = new ConstantsGenerator(controller.config);
      await generator.generateFiles(languages, outputDir);

      operationStats.generatedConstants = languages.length;
      MessageFormatter.success(`Constants generated in ${outputDir}`, {
        prefix: "Constants",
      });
      return;
    }

    if (argv.migrateCollectionsToTables) {
      try {
        if (!controller.config) {
          MessageFormatter.error("No Appwrite configuration found", undefined, {
            prefix: "Migration",
          });
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
            MessageFormatter.error(
              "Could not determine configuration folder path",
              undefined,
              { prefix: "Migration" }
            );
            MessageFormatter.info(
              "Make sure you have a .appwrite/ folder in your current directory",
              { prefix: "Migration" }
            );
            return;
          }
        }

        // Check if migration conditions are met
        const migrationCheck = checkMigrationConditions(configPath);
        if (!migrationCheck.allowed) {
          MessageFormatter.error(
            `Migration not allowed: ${migrationCheck.reason}`,
            undefined,
            { prefix: "Migration" }
          );
          MessageFormatter.info("Migration requirements:", {
            prefix: "Migration",
          });
          MessageFormatter.info(
            "  • Configuration must be loaded (use --config or have .appwrite/ folder)",
            { prefix: "Migration" }
          );
          MessageFormatter.info(
            "  • collections/ folder must exist with YAML files",
            { prefix: "Migration" }
          );
          MessageFormatter.info(
            "  • tables/ folder must not exist or be empty",
            { prefix: "Migration" }
          );
          return;
        }

        const { migrateCollectionsToTables } = await import(
          "appwrite-utils-helpers"
        );

        MessageFormatter.info("Starting collections to tables migration...", {
          prefix: "Migration",
        });
        const result = migrateCollectionsToTables(controller.config, {
          strategy: "full_migration",
          validateResult: true,
          dryRun: false,
        });

        if (result.success) {
          operationStats.migratedCollections = result.changes.length;
          MessageFormatter.success(
            "Collections migration completed successfully",
            { prefix: "Migration" }
          );
        } else {
          MessageFormatter.error(
            `Migration failed: ${result.errors.join(", ")}`,
            undefined,
            { prefix: "Migration" }
          );
          process.exit(1);
        }
      } catch (error) {
        MessageFormatter.error(
          "Migration failed",
          error instanceof Error ? error : new Error(String(error)),
          { prefix: "Migration" }
        );
        process.exit(1);
      }
      return;
    }

    // List backups if requested
    if (parsedArgv.listBackups) {
      const { AdapterFactory } = await import("appwrite-utils-helpers");
      const { listBackups } = await import("./shared/backupTracking.js");

      if (!controller.config) {
        MessageFormatter.error("No Appwrite configuration found", undefined, {
          prefix: "Backups",
        });
        return;
      }

      const { adapter } = await AdapterFactory.create({
        appwriteEndpoint: controller.config.appwriteEndpoint,
        appwriteProject: controller.config.appwriteProject,
        appwriteKey: controller.config.appwriteKey,
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

        MessageFormatter.info(
          `\nBackups for database: ${db.name} (${db.$id})`,
          { prefix: "Backups" }
        );

        if (backups.length === 0) {
          MessageFormatter.info("  No backups found", { prefix: "Backups" });
        } else {
          backups.forEach((backup, index) => {
            const date = new Date(backup.$createdAt).toLocaleString();
            const size = MessageFormatter.formatBytes(backup.sizeBytes);
            MessageFormatter.info(
              `  ${
                index + 1
              }. ${date} - ${backup.format.toUpperCase()} - ${size} - ${
                backup.collections
              } collections, ${backup.documents} documents`,
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
      if (!parsedArgv.functionId || (!parsedArgv.buildSpecification && !parsedArgv.runtimeSpecification)) {
        throw new Error(
          "Function ID and at least one of buildSpecification/runtimeSpecification are required for updating function specs"
        );
      }
      const buildSpec = parsedArgv.buildSpecification || parsedArgv.runtimeSpecification!;
      const runtimeSpec = parsedArgv.runtimeSpecification || parsedArgv.buildSpecification!;
      MessageFormatter.info(
        `Updating function specification for ${parsedArgv.functionId} to build=${buildSpec}, runtime=${runtimeSpec}`,
        { prefix: "Functions" }
      );
      const specifications = await listSpecifications(
        controller.appwriteServer!
      );
      const validSlugs = specifications.specifications.map((s: { slug: string }) => s.slug);
      if (!validSlugs.includes(buildSpec)) {
        MessageFormatter.error(
          `Build specification ${buildSpec} not found`,
          undefined,
          { prefix: "Functions" }
        );
        return;
      }
      if (!validSlugs.includes(runtimeSpec)) {
        MessageFormatter.error(
          `Runtime specification ${runtimeSpec} not found`,
          undefined,
          { prefix: "Functions" }
        );
        return;
      }
      await controller.updateFunctionSpecifications(
        parsedArgv.functionId,
        buildSpec as Specification,
        runtimeSpec as Specification
      );
    }

    // Add default databases if not specified (only if we need them for operations)
    const needsDatabases =
      options.doBackup ||
      options.wipeDatabase ||
      options.wipeDocumentStorage ||
      options.wipeUsers ||
      options.wipeCollections ||
      options.importData ||
      parsedArgv.sync ||
      parsedArgv.transfer;

    if (
      needsDatabases &&
      (!options.databases || options.databases.length === 0)
    ) {
      const allDatabases = await fetchAllDatabases(controller.database!);
      options.databases = allDatabases;
    }

    // Add default collections if not specified
    if (!options.collections || options.collections.length === 0) {
      if (controller.config && controller.config.collections) {
        options.collections = controller.config.collections.map(
          (c: any) => c.name
        );
      } else {
        options.collections = [];
      }
    }

    // Comprehensive backup (all databases + all buckets)
    if (parsedArgv.comprehensiveBackup) {
      const { comprehensiveBackup } = await import(
        "./backups/operations/comprehensiveBackup.js"
      );
      const { AdapterFactory } = await import("appwrite-utils-helpers");

      // Get tracking database ID (interactive prompt if not specified)
      let trackingDatabaseId = parsedArgv.trackingDatabaseId;

      if (!trackingDatabaseId) {
        // Fetch all databases for selection
        const allDatabases = await fetchAllDatabases(controller.database!);

        if (allDatabases.length === 0) {
          MessageFormatter.error(
            "No databases found. Cannot create comprehensive backup without a tracking database.",
            undefined,
            { prefix: "Backup" }
          );
          return;
        }

        if (allDatabases.length === 1) {
          trackingDatabaseId = allDatabases[0].$id;
          MessageFormatter.info(
            `Using only available database for tracking: ${allDatabases[0].name} (${trackingDatabaseId})`,
            { prefix: "Backup" }
          );
        } else {
          // Interactive selection
          const inquirer = (await import("inquirer")).default;
          const answer = await inquirer.prompt([
            {
              type: "list",
              name: "trackingDb",
              message: "Select database to store backup tracking metadata:",
              choices: allDatabases.map((db) => ({
                name: `${db.name} (${db.$id})`,
                value: db.$id,
              })),
            },
          ]);
          trackingDatabaseId = answer.trackingDb;
        }
      }

      // Ensure trackingDatabaseId is defined before proceeding
      if (!trackingDatabaseId) {
        throw new Error(
          "Tracking database ID is required for comprehensive backup"
        );
      }

      MessageFormatter.info(`Using tracking database: ${trackingDatabaseId}`, {
        prefix: "Backup",
      });

      // Create adapter for backup tracking
      const { adapter } = await AdapterFactory.create({
        appwriteEndpoint: controller.config!.appwriteEndpoint,
        appwriteProject: controller.config!.appwriteProject,
        appwriteKey: controller.config!.appwriteKey,
        sessionCookie: controller.config!.sessionCookie,
      });

      const result = await comprehensiveBackup(
        controller.config!,
        controller.database!,
        controller.storage!,
        adapter,
        {
          trackingDatabaseId,
          backupFormat: parsedArgv.backupFormat || "zip",
          parallelDownloads: parsedArgv.parallelDownloads || 10,
          onProgress: (message) => {
            MessageFormatter.info(message, { prefix: "Backup" });
          },
        }
      );

      operationStats.comprehensiveBackup = 1;
      operationStats.databasesBackedUp = result.databaseBackups.length;
      operationStats.bucketsBackedUp = result.bucketBackups.length;
      operationStats.totalBackupSize = result.totalSizeBytes;

      if (result.status === "completed") {
        MessageFormatter.success(
          `Comprehensive backup completed successfully (ID: ${result.backupId})`,
          { prefix: "Backup" }
        );
      } else if (result.status === "partial") {
        MessageFormatter.warning(
          `Comprehensive backup completed with errors (ID: ${result.backupId})`,
          { prefix: "Backup" }
        );
        result.errors.forEach((err) =>
          MessageFormatter.warning(err, { prefix: "Backup" })
        );
      } else {
        MessageFormatter.error(
          `Comprehensive backup failed (ID: ${result.backupId})`,
          undefined,
          { prefix: "Backup" }
        );
        result.errors.forEach((err) =>
          MessageFormatter.error(err, undefined, { prefix: "Backup" })
        );
      }
    }

    if (options.doBackup && options.databases) {
      MessageFormatter.info(
        `Creating backups for ${options.databases.length} database(s) in ${parsedArgv.backupFormat} format`,
        { prefix: "Backup" }
      );
      for (const db of options.databases) {
        await controller.backupDatabase(db, parsedArgv.backupFormat || "json");
      }
      operationStats.backups = options.databases.length;
      MessageFormatter.success(
        `Backup completed for ${options.databases.length} database(s)`,
        { prefix: "Backup" }
      );
    }

    if (
      options.wipeDatabase ||
      options.wipeDocumentStorage ||
      options.wipeUsers ||
      options.wipeCollections
    ) {
      // Confirm destructive operations
      const databaseNames = options.databases?.map((db) => db.name) || [];
      const confirmed = await ConfirmationDialogs.confirmDatabaseWipe(
        databaseNames,
        {
          includeStorage: options.wipeDocumentStorage,
          includeUsers: options.wipeUsers,
        }
      );

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
          const collectionNames = collectionsToWipe.map((c) => c.name);
          const collectionConfirmed =
            await ConfirmationDialogs.confirmCollectionWipe(
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
      if (
        wipeStats.databases > 0 ||
        wipeStats.collections > 0 ||
        wipeStats.users > 0 ||
        wipeStats.buckets > 0
      ) {
        operationStats.wipedDatabases = wipeStats.databases;
        operationStats.wipedCollections = wipeStats.collections;
        operationStats.wipedUsers = wipeStats.users;
        operationStats.wipedBuckets = wipeStats.buckets;
      }
    }

    if (parsedArgv.push) {
      await controller.init();
      if (!controller.database || !controller.config) {
        MessageFormatter.error("Database or config not initialized", undefined, { prefix: "Push" });
        return;
      }

      // Fetch available DBs from remote, then merge in local-only databases
      const remoteDatabases = await fetchAllDatabases(controller.database);
      const configuredDatabases = controller.config.databases || [];
      const remoteDbIds = new Set(remoteDatabases.map((db: any) => db.$id));
      const availableDatabases = [...remoteDatabases];

      for (const configDb of configuredDatabases) {
        const dbId = configDb.$id;
        if (dbId && !remoteDbIds.has(dbId)) {
          availableDatabases.push({
            $id: dbId,
            name: configDb.name || dbId,
            $createdAt: new Date().toISOString(),
            $updatedAt: new Date().toISOString(),
            enabled: true,
            _isLocalOnly: true,
          } as any);
          MessageFormatter.info(`Including local database "${configDb.name || dbId}" (not yet on server)`, { prefix: "Push" });
        }
      }

      if (availableDatabases.length === 0) {
        MessageFormatter.warning("No databases found in remote project or local config", { prefix: "Push" });
        return;
      }

      // Determine selected DBs
      let selectedDbIds: string[] = [];
      if (parsedArgv.dbIds) {
        selectedDbIds = parsedArgv.dbIds.split(/[,\s]+/).filter(Boolean);
      } else {
        selectedDbIds = await SelectionDialogs.selectDatabases(
          availableDatabases,
          configuredDatabases,
          { showSelectAll: false, allowNewOnly: false, defaultSelected: [] }
        );
      }

      if (selectedDbIds.length === 0) {
        MessageFormatter.warning("No databases selected for push", { prefix: "Push" });
        return;
      }

      // Build DatabaseSelection[] with tableIds per DB
      const databaseSelections: DatabaseSelection[] = [];
      const allConfigItems = [
        ...(controller.config.collections || []),
        ...(controller.config.tables || [])
      ];
      let lastSelectedTableIds: string[] | null = null;

      for (const dbId of selectedDbIds) {
        const db = availableDatabases.find(d => d.$id === dbId);
        if (!db) continue;

        // Filter config items eligible for this DB according to databaseId/databaseIds rule
        const eligibleConfigItems = (allConfigItems as any[]).filter(item => {
          const one = item.databaseId as string | undefined;
          const many = item.databaseIds as string[] | undefined;
          if (Array.isArray(many) && many.length > 0) return many.includes(dbId);
          if (one) return one === dbId;
          return true; // eligible everywhere if unspecified
        });

        // Fetch available tables from remote for status/context. Skip the
        // call for local-only databases (synthesized above when the DB exists
        // in config but not yet on the server) — fetchAllCollections would
        // 404 with "Database with the requested ID '<id>' could not be found"
        // because Appwrite has nothing to list under a not-yet-created DB.
        // selectivePush() / ensureDatabasesExist() create the DB downstream
        // before any collection writes happen, so we just treat the remote
        // table set as empty here.
        const availableTables = (db as any)._isLocalOnly
          ? []
          : await fetchAllCollections(dbId, controller.database);
        const remoteTableIds = new Set(availableTables.map(table => table.$id));
        const localItems = eligibleConfigItems;
        const localItemIds = localItems.map(item => item.$id || (item as any).id || (item as any).tableId || item.name);
        const localNewItems = localItems.filter(item => {
          const itemId = item.$id || (item as any).id || (item as any).tableId || item.name;
          return !remoteTableIds.has(itemId);
        });
        const localNewIds = localNewItems.map(item => item.$id || (item as any).id || (item as any).tableId || item.name);

        // Determine selected table IDs
        let selectedTableIds: string[] = [];
        if (parsedArgv.collectionIds) {
          // Non-interactive: respect provided table IDs as-is (apply to each selected DB)
          selectedTableIds = parsedArgv.collectionIds.split(/[\,\s]+/).filter(Boolean);
        } else {
          const inquirer = (await import("inquirer")).default;
          const choices: Array<{ name: string; value: string }> = [];

          if (lastSelectedTableIds && lastSelectedTableIds.length > 0) {
            choices.push({
              name: `Use same selection as previous (${lastSelectedTableIds.length} items)`,
              value: "same"
            });
          }

          if (localItemIds.length > 0) {
            choices.push({
              name: `Select all local items for ${db.name} (${localItemIds.length} items)`,
              value: "all_local"
            });
          }

          if (localNewIds.length > 0) {
            choices.push({
              name: `Select only new local items (not on remote) (${localNewIds.length} items)`,
              value: "new_only"
            });
          }

          choices.push({
            name: "Manual selection",
            value: "manual"
          });

          const { selectionMode } = await inquirer.prompt([
            {
              type: "list",
              name: "selectionMode",
              message: `How do you want to select tables for ${db.name}?`,
              choices,
              default: choices[0]?.value || "manual"
            }
          ]);

          if (selectionMode === "same") {
            selectedTableIds = [...(lastSelectedTableIds || [])];
          } else if (selectionMode === "all_local") {
            selectedTableIds = [...localItemIds];
          } else if (selectionMode === "new_only") {
            selectedTableIds = [...localNewIds];
          } else {
            if (localItems.length === 0) {
              MessageFormatter.warning(`No local tables/collections available for ${db.name}`, { prefix: "Push" });
              selectedTableIds = [];
            } else {
              selectedTableIds = await SelectionDialogs.selectTablesForDatabase(
                dbId,
                db.name,
                localItems as any[],
                availableTables as any[],
                { showSelectAll: localItems.length > 1, allowNewOnly: false, defaultSelected: lastSelectedTableIds || [] }
              );
            }
          }
        }

        databaseSelections.push({
          databaseId: db.$id,
          databaseName: db.name,
          tableIds: selectedTableIds,
          tableNames: [],
          isNew: false,
        });
        if (!parsedArgv.collectionIds) {
          lastSelectedTableIds = selectedTableIds;
        }
      }

      if (databaseSelections.every(sel => sel.tableIds.length === 0)) {
        MessageFormatter.warning("No tables/collections selected for push", { prefix: "Push" });
        return;
      }

      const pushSummary: Record<string, string | number | string[]> = {
        databases: databaseSelections.length,
        collections: databaseSelections.reduce((sum, s) => sum + s.tableIds.length, 0),
        details: databaseSelections.map(s => `${s.databaseId}: ${s.tableIds.length} items`),
      };
      // Skip confirmation if both dbIds and collectionIds are provided (non-interactive)
      if (!(parsedArgv.dbIds && parsedArgv.collectionIds)) {
        const confirmed = await ConfirmationDialogs.showOperationSummary('Push', pushSummary, { confirmationRequired: true });
        if (!confirmed) {
          MessageFormatter.info("Push operation cancelled", { prefix: "Push" });
          return;
        }
      }

      await controller.selectivePush(databaseSelections, []);
      operationStats.pushedDatabases = databaseSelections.length;
      operationStats.pushedCollections = databaseSelections.reduce((sum, s) => sum + s.tableIds.length, 0);
    } else if (parsedArgv.sync) {
      // Enhanced SYNC: Pull from remote with intelligent configuration detection
      if (parsedArgv.autoSync) {
        // Legacy behavior: sync everything without prompts
        MessageFormatter.info("Using auto-sync mode (legacy behavior)", { prefix: "Sync" });
        const databases =
          options.databases || (await fetchAllDatabases(controller.database!));
        await controller.synchronizeConfigurations(databases);
        operationStats.syncedDatabases = databases.length;
      } else {
        // Enhanced sync flow with selection dialogs
        const syncResult = await performEnhancedSync(controller, parsedArgv);
        if (syncResult) {
          operationStats.syncedDatabases = syncResult.databases.length;
          operationStats.syncedCollections = syncResult.totalTables;
          operationStats.syncedBuckets = syncResult.buckets.length;
        }
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
          MessageFormatter.error("Source database not found", undefined, {
            prefix: "Transfer",
          });
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
            MessageFormatter.error("Target database not found", undefined, {
              prefix: "Transfer",
            });
            return;
          }
        } else {
          toDb = (await controller.getDatabasesByIds([parsedArgv.toDbId]))?.[0];
          if (!toDb) {
            MessageFormatter.error("Target database not found", undefined, {
              prefix: "Transfer",
            });
            return;
          }
        }

        if (!fromDb || !toDb) {
          MessageFormatter.error(
            "Source or target database not found",
            undefined,
            { prefix: "Transfer" }
          );
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
      MessageFormatter.operationSummary(
        "CLI Operations",
        operationStats,
        duration
      );
    }
  }
}

main().catch((error) => {
  // Inquirer throws ExitPromptError when the user hits Ctrl+C during a prompt.
  // Surface a clean exit instead of dumping the stack.
  if (error && (error.name === "ExitPromptError" || error.code === "ERR_USE_AFTER_CLOSE")) {
    __awuExit(130);
    return;
  }
  MessageFormatter.error("CLI execution failed", error, { prefix: "CLI" });
  process.exit(1);
});
