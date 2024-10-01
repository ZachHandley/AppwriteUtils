#!/usr/bin/env node
import yargs from "yargs";
import { type ArgumentsCamelCase } from "yargs";
import { hideBin } from "yargs/helpers";
import { InteractiveCLI } from "./interactiveCLI.js";
import { UtilsController, type SetupOptions } from "./utilsController.js";
import type { TransferOptions } from "./migrations/transfer.js";
import { Databases, Storage, type Models } from "node-appwrite";
import { getClient } from "./utils/getClientFromConfig.js";

interface CliOptions {
  it?: boolean;
  dbIds?: string;
  collectionIds?: string;
  bucketIds?: string;
  wipe?: "all" | "docs" | "users";
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
}

type ParsedArgv = ArgumentsCamelCase<CliOptions>;

const argv = yargs(hideBin(process.argv))
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
    alias: ["fromDb"],
    type: "string",
    description: "Set the source database ID for transfer",
  })
  .option("toDbId", {
    alias: ["toDb"],
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
    alias: ["fromBucket"],
    type: "string",
    description: "Set the source bucket ID for transfer",
  })
  .option("toBucketId", {
    alias: ["toBucket"],
    type: "string",
    description: "Set the destination bucket ID for transfer",
  })
  .option("remoteEndpoint", {
    type: "string",
    description: "Set the remote Appwrite endpoint for transfers",
  })
  .option("remoteProjectId", {
    type: "string",
    description: "Set the remote Appwrite project ID for transfers",
  })
  .option("remoteApiKey", {
    type: "string",
    description: "Set the remote Appwrite API key for transfers",
  })
  .option("setup", {
    type: "boolean",
    description: "Setup the project with example data",
  })
  .help()
  .parse();

async function main() {
  const parsedArgv = (await argv) as ParsedArgv;
  let controller: UtilsController | undefined;

  if (parsedArgv.it) {
    try {
      controller = new UtilsController(process.cwd());
      await controller.init();
    } catch (error: any) {
      // If it fails, that means there's no config, more than likely
      console.log(
        "No config found, you probably need to create the setup files"
      );
    }
    const cli = new InteractiveCLI(process.cwd());
    await cli.run();
  } else {
    if (!controller) {
      controller = new UtilsController(process.cwd());
      await controller.init();
    }
    // Handle non-interactive mode with the new options
    const options: SetupOptions = {
      databases: parsedArgv.dbIds
        ? await controller.getDatabasesByIds(
            parsedArgv.dbIds.replace(" ", "").split(",")
          )
        : undefined,
      collections: parsedArgv.collectionIds
        ? parsedArgv.collectionIds.replace(" ", "").split(",")
        : undefined,
      doBackup: parsedArgv.backup,
      wipeDatabase: parsedArgv.wipe === "all" || parsedArgv.wipe === "docs",
      wipeDocumentStorage: parsedArgv.wipe === "all",
      wipeUsers: parsedArgv.wipe === "all" || parsedArgv.wipe === "users",
      generateSchemas: parsedArgv.generate,
      importData: parsedArgv.import,
      checkDuplicates: false,
      shouldWriteFile: parsedArgv.writeData,
    };

    if (parsedArgv.push) {
      await controller.syncDb();
    }

    if (
      options.wipeDatabase ||
      options.wipeDocumentStorage ||
      options.wipeUsers
    ) {
      if (options.wipeDatabase) {
        for (const db of options.databases || []) {
          await controller.wipeDatabase(db);
        }
      }
      if (options.wipeDocumentStorage && parsedArgv.bucketIds) {
        for (const bucketId of parsedArgv.bucketIds.split(",")) {
          await controller.wipeDocumentStorage(bucketId);
        }
      }
      if (options.wipeUsers) {
        await controller.wipeUsers();
      }
    }

    if (options.doBackup) {
      for (const db of options.databases || []) {
        await controller.backupDatabase(db);
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
      const fromDb = await controller.getDatabasesByIds([parsedArgv.fromDbId!]);
      let toDb: Models.Database | undefined;
      let targetDatabases: Databases | undefined;
      let targetStorage: Storage | undefined;

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
        const remoteDbs = await targetDatabases.list();
        toDb = remoteDbs.databases.find((db) => db.$id === parsedArgv.toDbId);
      } else {
        toDb = (await controller.getDatabasesByIds([parsedArgv.toDbId!]))[0];
      }

      if (!fromDb[0] || !toDb) {
        throw new Error("Source or target database not found");
      }

      let sourceBucket, targetBucket;
      if (parsedArgv.fromBucketId) {
        sourceBucket = await controller.storage?.getBucket(
          parsedArgv.fromBucketId
        );
      }
      if (parsedArgv.toBucketId) {
        if (isRemote) {
          targetBucket = await targetStorage?.getBucket(parsedArgv.toBucketId);
        } else {
          targetBucket = await controller.storage?.getBucket(
            parsedArgv.toBucketId
          );
        }
      }

      const transferOptions: TransferOptions = {
        isRemote,
        fromDb: fromDb[0],
        targetDb: toDb,
        transferEndpoint: parsedArgv.remoteEndpoint,
        transferProject: parsedArgv.remoteProjectId,
        transferKey: parsedArgv.remoteApiKey,
        sourceBucket: sourceBucket,
        targetBucket: targetBucket,
      };

      await controller.transferData(transferOptions);
    }

    if (parsedArgv.sync) {
      await controller.synchronizeConfigurations(options.databases);
    }
  }
}

main().catch((error) => {
  console.error("An error occurred:", error);
  process.exit(1);
});
