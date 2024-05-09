#!/usr/bin/env node
import { UtilsController } from "./utilsController.js";

const args = process.argv.slice(2);

async function main() {
  const controller = new UtilsController();

  let sync = false;
  let runProd = false;
  let runStaging = false;
  let runDev = false;
  let doBackup = false;
  let wipeDatabases = false;
  let wipeUsers = false;
  let generateSchemas = false;
  let importData = false;
  let wipeDocuments = false;
  let shouldWriteFile = false;
  let endpoint: string | undefined;
  let project: string | undefined;
  let key: string | undefined;
  if (args.includes("--sync")) {
    sync = true;
  }
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
  if (args.includes("--wipe-docs") || args.includes("--wipeDocs")) {
    wipeDocuments = true;
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
  if (args.includes("--wipe-users") || args.includes("--wipeUsers")) {
    wipeUsers = true;
  }
  if (args.includes("--write-data") || args.includes("--writeData")) {
    shouldWriteFile = true;
  }
  if (args.includes("--endpoint")) {
    endpoint = args[args.indexOf("--endpoint") + 1];
  }
  if (args.includes("--project")) {
    project = args[args.indexOf("--project") + 1];
  }
  if (args.includes("--key")) {
    key = args[args.indexOf("--key") + 1];
  }
  if (args.includes("--init")) {
    await controller.run({
      sync: sync,
      runProd: runProd,
      runStaging: runStaging,
      runDev: runDev,
      doBackup: doBackup,
      wipeDatabases: wipeDatabases,
      wipeUsers: wipeUsers,
      wipeDocumentStorage: wipeDocuments,
      generateSchemas: true,
      generateMockData: false,
      importData: false,
      checkDuplicates: false,
      shouldWriteFile: shouldWriteFile,
      endpoint: endpoint,
      project: project,
      key: key,
    });
  } else {
    await controller.run({
      sync: sync,
      runProd: runProd,
      runStaging: runStaging,
      runDev: runDev,
      doBackup: doBackup,
      wipeDatabases: wipeDatabases,
      wipeDocumentStorage: wipeDocuments,
      generateSchemas: generateSchemas,
      generateMockData: false,
      wipeUsers: wipeUsers,
      importData: importData,
      checkDuplicates: false,
      shouldWriteFile: shouldWriteFile,
      endpoint: endpoint,
      project: project,
      key: key,
    });
  }
}

main().catch(console.error);
