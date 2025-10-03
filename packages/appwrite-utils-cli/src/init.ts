#!/usr/bin/env node
import inquirer from "inquirer";
import { createEmptyCollection, setupDirsFiles } from "./utils/setupFiles.js";
import { MessageFormatter } from "./shared/messageFormatter.js";

MessageFormatter.banner("Appwrite Utils CLI Tool by Zach Handley", "For more information, visit https://github.com/zachhandley/appwrite-utils");

async function main() {
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "What would you like to do?",
      choices: [
        "Create collection config file",
        "Create function (not available)",
        "Setup directories and files",
        "Setup directories and files with example data",
        "Exit",
      ],
    },
  ]);

  switch (answers.action) {
    case "Create collection config file":
      const { collectionName } = await inquirer.prompt([
        {
          type: "input",
          name: "collectionName",
          message: "Enter the name of the collection:",
          validate: (input) =>
            input.trim() !== "" || "Collection name cannot be empty.",
        },
      ]);
      MessageFormatter.progress(`Creating collection config file for '${collectionName}'...`, { prefix: "Init" });
      createEmptyCollection(collectionName);
      break;
    case "Create function (not available)":
      MessageFormatter.warning("This feature is not available yet.", { prefix: "Init" });
      break;
    case "Setup directories and files":
      MessageFormatter.progress("Setting up directories and files...", { prefix: "Init" });
      setupDirsFiles(false); // Assuming false means no example data
      break;
    case "Setup directories and files with example data":
      MessageFormatter.progress("Setting up directories and files with example data...", { prefix: "Init" });
      setupDirsFiles(true); // Assuming false means no example data
      break;
    case "Exit":
      MessageFormatter.info("Exiting...", { prefix: "Init" });
      process.exit(0);
      break;
    default:
      MessageFormatter.warning("Invalid option, please try again.", { prefix: "Init" });
      break;
  }
}

main().catch((error) => {
  MessageFormatter.error("An error occurred", error instanceof Error ? error : new Error(String(error)), { prefix: "Init" });
  process.exit(1);
});
