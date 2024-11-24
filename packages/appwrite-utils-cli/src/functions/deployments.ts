import { Client, Functions, Runtime } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { create as createTarball } from "tar";
import { join } from "node:path";
import fs from "node:fs";
import { type AppwriteFunction, type Specification } from "appwrite-utils";
import chalk from "chalk";
import cliProgress from "cli-progress";
import { execSync } from "child_process";
import {
  createFunction,
  getFunction,
  updateFunctionSpecifications,
} from "./methods.js";

const findFunctionDirectory = (
  basePath: string,
  functionName: string
): string | undefined => {
  const normalizedName = functionName.toLowerCase().replace(/\s+/g, "-");
  const dirs = fs.readdirSync(basePath, { withFileTypes: true });

  for (const dir of dirs) {
    if (dir.isDirectory()) {
      const fullPath = join(basePath, dir.name);
      if (dir.name.toLowerCase() === normalizedName) {
        return fullPath;
      }

      const nestedResult = findFunctionDirectory(fullPath, functionName);
      if (nestedResult) {
        return nestedResult;
      }
    }
  }

  return undefined;
};

export const deployFunction = async (
  client: Client,
  functionId: string,
  codePath: string,
  activate: boolean = true,
  entrypoint: string = "index.js",
  commands: string = "npm install"
) => {
  const functions = new Functions(client);
  console.log(chalk.blue("📦 Preparing function deployment..."));

  const progressBar = new cliProgress.SingleBar({
    format:
      "Uploading |" +
      chalk.cyan("{bar}") +
      "| {percentage}% | {value}/{total} Chunks",
    barCompleteChar: "█",
    barIncompleteChar: "░",
    hideCursor: true,
  });

  const tarPath = join(process.cwd(), `function-${functionId}.tar.gz`);
  await createTarball(
    {
      gzip: true,
      file: tarPath,
      cwd: codePath,
    },
    ["."]
  );

  const fileBuffer = await fs.promises.readFile(tarPath);
  const fileObject = InputFile.fromBuffer(
    new Uint8Array(fileBuffer),
    `function-${functionId}.tar.gz`
  );

  try {
    console.log(chalk.blue("🚀 Creating deployment..."));
    const functionResponse = await functions.createDeployment(
      functionId,
      fileObject,
      activate,
      entrypoint,
      commands,
      (progress) => {
        const chunks = progress.chunksUploaded;
        const total = progress.chunksTotal;
        if (chunks && total) {
          if (chunks === 0) {
            progressBar.start(total, 0);
          } else if (chunks === total) {
            progressBar.update(total);
            progressBar.stop();
            console.log(chalk.green("✅ Upload complete!"));
          } else {
            progressBar.update(chunks);
          }
        }
      }
    );

    await fs.promises.unlink(tarPath);
    console.log(chalk.green("✨ Function deployed successfully!"));
    return functionResponse;
  } catch (error) {
    progressBar.stop();
    console.error(chalk.red("❌ Deployment failed:"), error);
    throw error;
  }
};

export const deployLocalFunction = async (
  client: Client,
  functionName: string,
  functionConfig: AppwriteFunction,
  functionPath?: string
) => {
  let functionExists = true;
  try {
    await getFunction(client, functionConfig.$id);
  } catch (error) {
    functionExists = false;
  }

  const resolvedPath =
    functionPath ||
    functionConfig.dirPath ||
    findFunctionDirectory(process.cwd(), functionName) ||
    join(
      process.cwd(),
      "functions",
      functionName.toLowerCase().replace(/\s+/g, "-")
    );

  if (functionConfig.predeployCommands?.length) {
    console.log(chalk.blue("Executing predeploy commands..."));
    for (const command of functionConfig.predeployCommands) {
      try {
        console.log(chalk.gray(`Executing: ${command}`));
        execSync(command, {
          cwd: resolvedPath,
          stdio: "inherit",
        });
      } catch (error) {
        console.error(
          chalk.red(`Failed to execute predeploy command: ${command}`)
        );
        throw error;
      }
    }
  }

  if (!functionExists) {
    await createFunction(
      client,
      functionConfig.$id,
      functionConfig.name,
      functionConfig.runtime as Runtime,
      functionConfig.execute,
      functionConfig.events,
      functionConfig.schedule,
      functionConfig.timeout,
      functionConfig.enabled,
      functionConfig.logging,
      functionConfig.entrypoint,
      functionConfig.commands
    );
  }

  if (functionConfig.specification) {
    await updateFunctionSpecifications(
      client,
      functionConfig.$id,
      functionConfig.specification
    );
  }

  const deployPath = functionConfig.deployDir
    ? join(resolvedPath, functionConfig.deployDir)
    : resolvedPath;

  return deployFunction(
    client,
    functionConfig.$id,
    deployPath,
    true,
    functionConfig.entrypoint,
    functionConfig.commands
  );
};
