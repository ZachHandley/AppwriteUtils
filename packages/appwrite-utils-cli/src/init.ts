#!/usr/bin/env node
import inquirer from "inquirer";
import { createEmptyCollection, setupDirsFiles } from "./utils/setupFiles.js";

console.log("Welcome to Appwrite Utils CLI Tool by Zach Handley");
console.log(
  "For more information, visit https://github.com/zachhandley/appwrite-utils"
);

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
      console.log(`Creating collection config file for '${collectionName}'...`);
      createEmptyCollection(collectionName);
      break;
    case "Create function (not available)":
      console.log("This feature is not available yet.");
      break;
    case "Setup directories and files":
      console.log("Setting up directories and files...");
      setupDirsFiles(false); // Assuming false means no example data
      break;
    case "Setup directories and files with example data":
      console.log("Setting up directories and files with example data...");
      setupDirsFiles(true); // Assuming false means no example data
      break;
    case "Exit":
      console.log("Exiting...");
      process.exit(0);
      break;
    default:
      console.log("Invalid option, please try again.");
      break;
  }
}

main().catch((error) => {
  console.error("An error occurred:", error);
  process.exit(1);
});
