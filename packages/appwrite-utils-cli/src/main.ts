#!/usr/bin/env node
import yargs from "yargs";
import { type ArgumentsCamelCase } from "yargs";
import { hideBin } from "yargs/helpers";
import { InteractiveCLI } from "./interactiveCLI.js";
import { UtilsController, type SetupOptions } from "./utilsController.js";
import type { TransferOptions } from "./migrations/transfer.js";
import { Databases, Storage, type Models } from "node-appwrite";
import { getClient } from "./utils/getClientFromConfig.js";
import { fetchAllDatabases } from "./migrations/databases.js";
import { setupDirsFiles } from "./utils/setupFiles.js";
import { fetchAllCollections } from "./collections/methods.js";
import type { Specification } from "appwrite-utils";
import chalk from "chalk";
import { listSpecifications } from "./functions/methods.js";

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
}

type ParsedArgv = ArgumentsCamelCase<CliOptions>;

const argv = yargs(hideBin(process.argv))
  .option("config", {
    type: "string",
    description: "Appwrite Config file name",
  })
  .option("it", {
    alias: ["interactive", "i"],
    type: "boolean",
    description: "Run in interactive mode",
  })
  .option("dbIds", {
    type: "string",
    description: "Comma-separated list of database IDs to operate on",
  })
  .option("collectionIds", {
    alias: ["collIds"],
    type: "string",
    description: "Comma-separated list of collection IDs to operate on",
  })
  .option("bucketIds", {
    type: "string",
    description: "Comma-separated list of bucket IDs to operate on",
  })
  .option("wipe", {
    choices: ["all", "docs", "users"] as const,
    description:
      "Wipe data (all: everything, docs: only documents, users: only user data)",
  })
  .option("wipeCollections", {
    type: "boolean",
    description:
      "Wipe collections, uses collectionIds option to get the collections to wipe",
  })
  .option("transferUsers", {
    type: "boolean",
    description: "Transfer users between projects",
  })
  .option("generate", {
    type: "boolean",
    description: "Generate TypeScript schemas from database schemas",
  })
  .option("import", {
    type: "boolean",
    description: "Import data into your databases",
  })
  .option("backup", {
    type: "boolean",
    description: "Perform a backup of your databases",
  })
  .option("writeData", {
    type: "boolean",
    description: "Write converted imported data to file",
  })
  .option("push", {
    type: "boolean",
    description:
      "Push your local Appwrite config to your configured Appwrite Project",
  })
  .option("sync", {
    type: "boolean",
    description:
      "Synchronize by pulling your Appwrite config from your configured Appwrite Project",
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
    description: "Transfer data between databases or collections",
  })
  .option("fromDbId", {
    alias: ["fromDb", "sourceDbId", "sourceDb"],
    type: "string",
    description: "Set the source database ID for transfer",
  })
  .option("toDbId", {
    alias: ["toDb", "targetDbId", "targetDb"],
    type: "string",
    description: "Set the destination database ID for transfer",
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
    description: "Setup directories and files",
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
  .parse() as ParsedArgv;

async function main() {
  if (argv.it) {
    const cli = new InteractiveCLI(process.cwd());
    await cli.run();
  } else {
    const controller = new UtilsController(process.cwd());
    await controller.init();

    if (argv.setup) {
      await setupDirsFiles(false, process.cwd());
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
      console.log(
        chalk.yellow(
          `Updating function specification for ${parsedArgv.functionId} to ${parsedArgv.specification}, checking if specification exists...`
        )
      );
      const specifications = await listSpecifications(
        controller.appwriteServer!
      );
      if (
        !specifications.specifications.some(
          (s: { slug: string }) => s.slug === parsedArgv.specification
        )
      ) {
        console.log(
          chalk.red(`Specification ${parsedArgv.specification} not found`)
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
        (db) => db.name.toLowerCase() !== "migrations"
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
      for (const db of options.databases) {
        await controller.backupDatabase(db);
      }
    }

    if (
      options.wipeDatabase ||
      options.wipeDocumentStorage ||
      options.wipeUsers ||
      options.wipeCollections
    ) {
      if (parsedArgv.wipe === "all") {
        if (options.databases) {
          for (const db of options.databases) {
            await controller.wipeDatabase(db, true); // true to wipe associated buckets
          }
        }
        await controller.wipeUsers();
      } else if (parsedArgv.wipe === "docs") {
        if (options.databases) {
          for (const db of options.databases) {
            await controller.wipeBucketFromDatabase(db);
          }
        }
        if (parsedArgv.bucketIds) {
          for (const bucketId of parsedArgv.bucketIds.split(",")) {
            await controller.wipeDocumentStorage(bucketId);
          }
        }
      } else if (parsedArgv.wipe === "users") {
        await controller.wipeUsers();
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
          for (const collection of collectionsToWipe) {
            await controller.wipeCollection(db, collection);
          }
        }
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
      } else if (parsedArgv.sync) {
        await controller.synchronizeConfigurations(databases);
      }
    }

    if (options.generateSchemas) {
      await controller.generateSchemas();
    }

    if (options.importData) {
      await controller.importData(options);
    }

    if (parsedArgv.transfer) {
      const isRemote = !!parsedArgv.remoteEndpoint;
      let fromDb, toDb: Models.Database | undefined;
      let targetDatabases: Databases | undefined;
      let targetStorage: Storage | undefined;

      // Only fetch databases if database IDs are provided
      if (parsedArgv.fromDbId && parsedArgv.toDbId) {
        console.log(
          chalk.blue(
            `Starting database transfer from ${parsedArgv.fromDbId} to ${parsedArgv.toDbId}`
          )
        );
        fromDb = (await controller.getDatabasesByIds([parsedArgv.fromDbId]))[0];

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
        } else {
          toDb = (await controller.getDatabasesByIds([parsedArgv.toDbId]))[0];
        }

        if (!fromDb || !toDb) {
          throw new Error("Source or target database not found");
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
    }
  }
}

main().catch((error) => {
  console.error("An error occurred:", error);
  process.exit(1);
});
