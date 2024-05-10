#!/usr/bin/env node
import { program } from "commander";
import { UtilsController } from "./utilsController.js";

// Setup the main CLI program
program
  .version("1.0.0")
  .description("Utility CLI for Appwrite configurations and operations")
  .option("--endpoint <endpoint>", "Set the Appwrite endpoint", undefined)
  .option("--project <project>", "Set the Appwrite project ID", undefined)
  .option("--key <key>", "Set the Appwrite API key", undefined)
  .option("--backup", "Perform a backup before executing the command", false)
  .option("--dev", "Run in development environment", false)
  .option("--prod", "Run in production environment", false)
  .option("--staging", "Run in staging environment", false)
  .option("--sync", "Synchronize configurations", false)
  .option("--wipe", "Wipe databases", false)
  .option("--wipe-docs", "Wipe documents", false)
  .option("--wipe-users", "Wipe users", false)
  .option("--generate", "Generate schemas", false)
  .option("--import", "Import data", false)
  .option("--write-data", "Write data to file", false)
  .option("-h, --help", "Display help for command", false);

program.on("--help", () => {
  console.log("");
  console.log("Examples:");
  console.log(
    "  $ npx appwrite-utils-cli appwrite-migrate --sync --endpoint https://appwrite.example.com --project 123456 --key 7890"
  );
  console.log(
    "  $ npx appwrite-utils-cli appwrite-migrate --sync --dev --backup"
  );
  console.log(
    "  $ npx appwrite-utils-cli appwrite-migrate --wipe --wipe-docs --wipe-users --dev"
  );
  console.log(
    "  $ npx appwrite-utils-cli appwrite-migrate --generate --import --write-data --dev"
  );
  console.log(
    "  $ npx appwrite-utils-cli appwrite-migrate --sync --generate --import --write-data --dev --backup"
  );
  console.log("  $ npx appwrite-utils-cli appwrite-create");
  console.log(
    "For more information, visit https://github.com/zachhandley/appwrite-utils"
  );
  console.log("");
});

// Parse and handle options
program.action(async (options) => {
  const currentUserDir = process.cwd();
  const controller = new UtilsController(currentUserDir);
  try {
    // Convert Commander options to the format expected by UtilsController
    const setupOptions = {
      sync: options.sync,
      runProd: options.prod,
      runStaging: options.staging,
      runDev: options.dev,
      doBackup: options.backup,
      wipeDatabases: options.wipe,
      wipeDocumentStorage: options.wipeDocs,
      wipeUsers: options.wipeUsers,
      generateSchemas: options.generate,
      generateMockData: false, // Assuming this needs to be set based on other conditions
      importData: options.import,
      checkDuplicates: false, // Assuming this needs to be set based on other conditions
      shouldWriteFile: options.writeData,
      endpoint: options.endpoint,
      project: options.project,
      key: options.key,
    };
    console.log("Running operation...", setupOptions);

    await controller.run(setupOptions);
    console.log("Operation completed successfully.");
  } catch (error) {
    console.error("Error during operation:", error);
  }
});

program.parse(process.argv);
