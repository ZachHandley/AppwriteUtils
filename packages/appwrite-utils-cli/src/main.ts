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
}

type ParsedArgv = ArgumentsCamelCase<CliOptions>;

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
    alias: ["collIds"],
    type: "string",
    description: "Comma-separated list of collection IDs to target (e.g., 'users,posts')",
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
      "⚠️  DESTRUCTIVE: Wipe specific collections (requires --collectionIds)",
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
  .parse() as ParsedArgv;

async function main() {
  const startTime = Date.now();
  const operationStats: Record<string, number> = {};
  
  if (argv.it) {
    const cli = new InteractiveCLI(process.cwd());
    await cli.run();
  } else {
    const directConfig =
      argv.endpoint || argv.projectId || argv.apiKey
        ? {
            appwriteEndpoint: argv.endpoint,
            appwriteProject: argv.projectId,
            appwriteKey: argv.apiKey,
          }
        : undefined;
    const controller = new UtilsController(process.cwd(), directConfig);
    await controller.init();

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

    if (!controller.config) {
      MessageFormatter.error("No Appwrite connection found", undefined, { prefix: "CLI" });
      return;
    }

    const parsedArgv = argv;

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

    // Add default databases if not specified
    if (!options.databases || options.databases.length === 0) {
      const allDatabases = await fetchAllDatabases(controller.database!);
      options.databases = allDatabases.filter(
        (db) => {
          const useMigrations = controller.config?.useMigrations ?? true;
          return useMigrations || db.name.toLowerCase() !== "migrations";
        }
      );
    }

    // Add default collections if not specified
    if (!options.collections || options.collections.length === 0) {
      if (controller.config && controller.config.collections) {
        options.collections = controller.config.collections.map((c) => c.name);
      } else {
        options.collections = [];
      }
    }

    if (options.doBackup && options.databases) {
      MessageFormatter.info(`Creating backups for ${options.databases.length} database(s)`, { prefix: "Backup" });
      for (const db of options.databases) {
        await controller.backupDatabase(db);
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
