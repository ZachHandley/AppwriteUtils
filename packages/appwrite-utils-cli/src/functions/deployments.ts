import { Client, Functions, Runtime, type Models } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { create as createTarball } from "tar";
import { join, relative } from "node:path";
import fs from "node:fs";
import { platform } from "node:os";
import { type AppwriteFunction, type Specification } from "appwrite-utils";
import chalk from "chalk";
import cliProgress from "cli-progress";
import { execSync } from "child_process";
import {
  createFunction,
  getFunction,
  updateFunction,
  updateFunctionSpecifications,
} from "./methods.js";
import ignore from "ignore";

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
  commands: string = "npm install",
  ignored: string[] = [
    "node_modules",
    ".git",
    ".vscode",
    ".DS_Store",
    "__pycache__",
    ".venv",
  ]
) => {
  const functions = new Functions(client);
  console.log(chalk.blue("Preparing function deployment..."));

  // Convert ignored patterns to lowercase for case-insensitive comparison
  const ignoredLower = ignored.map((pattern) => pattern.toLowerCase());

  const tarPath = join(process.cwd(), `function-${functionId}.tar.gz`);

  // Verify codePath exists and is a directory
  if (!fs.existsSync(codePath)) {
    throw new Error(`Function directory not found at ${codePath}`);
  }

  const stats = await fs.promises.stat(codePath);
  if (!stats.isDirectory()) {
    throw new Error(`${codePath} is not a directory`);
  }

  console.log(chalk.blue(`Creating tarball from ${codePath}`));

  const progressBar = new cliProgress.SingleBar({
    format:
      "Uploading |" +
      chalk.cyan("{bar}") +
      "| {percentage}% | {value}/{total} Chunks",
    barCompleteChar: "█",
    barIncompleteChar: "░",
    hideCursor: true,
  });

  await createTarball(
    {
      gzip: true,
      file: tarPath,
      cwd: codePath,
      filter: (path, stat) => {
        const relativePath = relative(
          codePath,
          join(codePath, path)
        ).toLowerCase();
        // Skip if path matches any ignored pattern
        if (
          ignoredLower.some(
            (pattern) =>
              relativePath.startsWith(pattern) ||
              relativePath.includes(`/${pattern}`) ||
              relativePath.includes(`\\${pattern}`)
          )
        ) {
          console.log(chalk.gray(`Ignoring ${path}`));
          return false;
        }
        return true;
      },
    },
    ["."] // This now only includes contents of codePath since we set cwd to codePath
  );

  const fileBuffer = await fs.promises.readFile(tarPath);
  const fileObject = InputFile.fromBuffer(
    new Uint8Array(fileBuffer),
    `function-${functionId}.tar.gz`
  );

  try {
    console.log(chalk.blue("🚀 Creating deployment..."));
    // Start with 1 as default total since we don't know the chunk size yet
    progressBar.start(1, 0);

    const functionResponse = await functions.createDeployment(
      functionId,
      fileObject,
      activate,
      entrypoint,
      commands,
      (progress) => {
        const chunks = progress.chunksUploaded;
        const total = progress.chunksTotal;

        if (chunks !== undefined && total !== undefined) {
          // First chunk, initialize the bar with correct total
          if (chunks === 0) {
            progressBar.start(total || 100, 0);
          } else {
            progressBar.update(chunks);

            // Check if upload is complete
            if (chunks === total) {
              progressBar.update(total);
              progressBar.stop();
              console.log(chalk.green("✅ Upload complete!"));
            }
          }
        }
      }
    );

    // Ensure progress bar completes even if callback never fired
    if (progressBar.getProgress() === 0) {
      progressBar.update(1);
      progressBar.stop();
    }

    await fs.promises.unlink(tarPath);
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
  let functionThatExists: Models.Function;
  try {
    functionThatExists = await getFunction(client, functionConfig.$id);
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

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Function directory not found at ${resolvedPath}`);
  }

  if (functionConfig.predeployCommands?.length) {
    console.log(chalk.blue("Executing predeploy commands..."));
    const isWindows = platform() === "win32";

    for (const command of functionConfig.predeployCommands) {
      try {
        console.log(chalk.gray(`Executing: ${command}`));
        execSync(command, {
          cwd: resolvedPath,
          stdio: "inherit",
          shell: isWindows ? "cmd.exe" : "/bin/sh",
          windowsHide: true,
        });
      } catch (error) {
        console.error(
          chalk.red(`Failed to execute predeploy command: ${command}`),
          error
        );
        throw new Error(``);
      }
    }
  }

  // Only create function if it doesn't exist
  if (!functionExists) {
    await createFunction(client, functionConfig);
  } else {
    console.log(chalk.blue("Updating function..."));
    await updateFunction(client, functionConfig);
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
    functionConfig.commands,
    functionConfig.ignore
  );
};
