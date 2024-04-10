#!/usr/bin/env node
import { UtilsController } from "./utilsController.js";
export type { AppwriteConfig } from "@/migrations/schema.js";
export type { ConverterFunctions } from "@/migrations/converters.js";
export type { ValidationRules } from "@/migrations/validationRules.js";
export type { AfterImportActions } from "@/migrations/afterImportActions.js";

const args = process.argv.slice(2);

async function main() {
  const controller = new UtilsController();
  await controller.init();

  let runProd = false;
  let runStaging = false;
  let runDev = false;
  let doBackup = false;
  let wipeDatabases = false;
  let generateSchemas = false;
  let importData = false;
  if (args.includes("--prod")) {
    runProd = true;
  }
  if (args.includes("--staging")) {
    runStaging = true;
  }
  if (args.includes("--dev")) {
    runDev = true;
  }
  if (args.includes("--wipe")) {
    wipeDatabases = true;
  }
  if (args.includes("--generate")) {
    generateSchemas = true;
  }
  if (args.includes("--import")) {
    importData = true;
  }
  if (args.includes("--backup")) {
    doBackup = true;
  }
  if (args.includes("--init")) {
    await controller.run({
      runProd: runProd,
      runStaging: runStaging,
      runDev: runDev,
      doBackup: doBackup,
      wipeDatabases: wipeDatabases,
      generateSchemas: true,
      generateMockData: false,
      importData: false,
      checkDuplicates: false,
    });
  } else {
    await controller.run({
      runProd: runProd,
      runStaging: runStaging,
      runDev: runDev,
      doBackup: doBackup,
      wipeDatabases: wipeDatabases,
      generateSchemas: generateSchemas,
      generateMockData: false,
      importData: importData,
      checkDuplicates: false,
    });
  }
}

main().catch(console.error);
