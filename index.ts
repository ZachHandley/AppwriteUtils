import { UtilsController, type SetupOptions } from "./src/utilsController";

const args = process.argv.slice(2);

async function main() {
  const controller = new UtilsController();
  await controller.init();

  let runProd = false;
  let wipeDatabases = false;
  let generateSchemas = false;
  let importData = false;
  if (args.includes("--prod")) {
    runProd = true;
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
  if (args.includes("--init")) {
    await controller.run({
      runProd: runProd,
      wipeDatabases: wipeDatabases,
      generateSchemas: true,
      generateMockData: false,
      importData: false,
      checkDuplicates: false,
    });
  } else {
    await controller.run({
      runProd: runProd,
      wipeDatabases: wipeDatabases,
      generateSchemas: generateSchemas,
      generateMockData: false,
      importData: importData,
      checkDuplicates: false,
    });
  }
}

main().catch(console.error);
