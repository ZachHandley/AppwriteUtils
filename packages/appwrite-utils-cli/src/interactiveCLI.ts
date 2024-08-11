import inquirer from "inquirer";
import { UtilsController } from "./utilsController.js";
import { createEmptyCollection, setupDirsFiles } from "./utils/setupFiles.js";
import { fetchAllDatabases } from "./databases/methods.js";
import { fetchAllCollections } from "./collections/methods.js";
import { listBuckets } from "./storage/methods.js";

export async function runInteractiveCLI() {
  console.log("Welcome to Appwrite Utils CLI Tool by Zach Handley");
  console.log(
    "For more information, visit https://github.com/zachhandley/appwrite-utils"
  );

  const controller = new UtilsController(process.cwd());
  await controller.init({});

  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do?",
        choices: [
          "Create collection config file",
          "Setup directories and files",
          "Setup directories and files with example data",
          "Synchronize configurations",
          "Transfer data",
          "Backup database",
          "Wipe database",
          "Generate schemas",
          "Import data",
          "Exit",
        ],
      },
    ]);

    switch (action) {
      case "Create collection config file":
        await createCollectionConfig();
        break;
      case "Setup directories and files":
        await setupDirsFiles(false);
        break;
      case "Setup directories and files with example data":
        await setupDirsFiles(true);
        break;
      case "Synchronize configurations":
        await synchronizeConfigurations(controller);
        break;
      case "Transfer data":
        await transferData(controller);
        break;
      case "Backup database":
        await backupDatabase(controller);
        break;
      case "Wipe database":
        await wipeDatabase(controller);
        break;
      case "Generate schemas":
        await generateSchemas(controller);
        break;
      case "Import data":
        await importData(controller);
        break;
      case "Exit":
        console.log("Exiting...");
        return;
    }
  }
}

async function createCollectionConfig() {
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

async function synchronizeConfigurations(controller: UtilsController) {
  const databases = await fetchAllDatabases(controller.database);

  const { selectedDatabases } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selectedDatabases",
      message:
        "Select databases to synchronize (or select none to synchronize all):",
      choices: databases.map((db) => ({ name: db.name, value: db.$id })),
    },
  ]);

  console.log("Synchronizing configurations...");
  await controller.run({ sync: true, databases: selectedDatabases });
}

async function transferData(controller: UtilsController) {
  const databases = await fetchAllDatabases(controller.database);

  const { fromDbId } = await inquirer.prompt([
    {
      type: "list",
      name: "fromDbId",
      message: "Select the source database:",
      choices: databases.map((db) => ({ name: db.name, value: db.$id })),
    },
  ]);

  const { targetDbId } = await inquirer.prompt([
    {
      type: "list",
      name: "targetDbId",
      message: "Select the target database:",
      choices: databases.map((db) => ({ name: db.name, value: db.$id })),
    },
  ]);

  const fromCollections = await fetchAllCollections(
    fromDbId,
    controller.database
  );
  const { selectedCollections } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selectedCollections",
      message:
        "Select collections to transfer (or select none to transfer all):",
      choices: fromCollections.map((col) => ({
        name: col.name,
        value: col.$id,
      })),
    },
  ]);

  const { isRemote } = await inquirer.prompt([
    {
      type: "confirm",
      name: "isRemote",
      message: "Is this a remote transfer?",
      default: false,
    },
  ]);

  let transferOptions: any = { fromDbId, targetDbId, isRemote };

  if (selectedCollections.length > 0) {
    transferOptions.collections = selectedCollections;
  }

  if (isRemote) {
    const remoteOptions = await inquirer.prompt([
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
    transferOptions = { ...transferOptions, ...remoteOptions };
  }

  console.log("Transferring data...");
  await controller.run({ ...transferOptions, transfer: true });
}

async function backupDatabase(controller: UtilsController) {
  const databases = await fetchAllDatabases(controller.database);

  const { selectedDatabases } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selectedDatabases",
      message: "Select databases to backup (or select none to backup all):",
      choices: databases.map((db) => ({ name: db.name, value: db.$id })),
    },
  ]);

  console.log("Backing up database...");
  await controller.run({ doBackup: true, databases: selectedDatabases });
}

async function wipeDatabase(controller: UtilsController) {
  const databases = await fetchAllDatabases(controller.database);
  const storage = await listBuckets(controller.storage);

  const { selectedDatabases } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selectedDatabases",
      message:
        "Select databases to wipe (or select none to skip database wipe):",
      choices: databases.map((db) => ({ name: db.name, value: db.$id })),
    },
  ]);

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
    await controller.run({
      wipeDatabases: selectedDatabases.length > 0 ? selectedDatabases : false,
      wipeDocumentStorage: selectedStorage.length > 0 ? selectedStorage : false,
      wipeUsers,
    });
  } else {
    console.log("Wipe operation cancelled.");
  }
}

async function generateSchemas(controller: UtilsController) {
  const databases = await fetchAllDatabases(controller.database);

  const { selectedDatabases } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selectedDatabases",
      message:
        "Select databases to generate schemas for (or select none to generate for all):",
      choices: databases.map((db) => ({ name: db.name, value: db.$id })),
    },
  ]);

  console.log("Generating schemas...");
  await controller.run({ generateSchemas: true, databases: selectedDatabases });
}

async function importData(controller: UtilsController) {
  const databases = await fetchAllDatabases(controller.database);

  const { selectedDatabase } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedDatabase",
      message: "Select the database to import data into:",
      choices: databases.map((db) => ({ name: db.name, value: db.$id })),
    },
  ]);

  const collections = await fetchAllCollections(
    selectedDatabase,
    controller.database
  );
  const { selectedCollections } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selectedCollections",
      message:
        "Select collections to import data into (or select none to import into all):",
      choices: collections.map((col) => ({ name: col.name, value: col.$id })),
    },
  ]);

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
  await controller.run({
    importData: true,
    database: selectedDatabase,
    collections:
      selectedCollections.length > 0 ? selectedCollections : undefined,
    shouldWriteFile,
    checkDuplicates,
  });
}
