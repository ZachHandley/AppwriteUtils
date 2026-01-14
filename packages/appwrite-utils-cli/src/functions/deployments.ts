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
import { MessageFormatter } from "appwrite-utils-helpers";
import { resolveFunctionDirectory, validateFunctionDirectory } from 'appwrite-utils-helpers';

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
  MessageFormatter.processing("Preparing function deployment...", { prefix: "Deployment" });

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

  MessageFormatter.processing(`Creating tarball from ${codePath}`, { prefix: "Deployment" });

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
          MessageFormatter.debug(`Ignoring ${path}`, undefined, { prefix: "Deployment" });
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
    MessageFormatter.processing("Creating deployment...", { prefix: "Deployment" });
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
              MessageFormatter.success("Upload complete!", { prefix: "Deployment" });
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
    MessageFormatter.error("Deployment failed", error instanceof Error ? error : undefined, { prefix: "Deployment" });
    throw error;
  }
};

export const deployLocalFunction = async (
  client: Client,
  functionName: string,
  functionConfig: AppwriteFunction,
  functionPath?: string,
  configDirPath?: string
) => {
  let functionExists = true;
  let functionThatExists: Models.Function;
  try {
    functionThatExists = await getFunction(client, functionConfig.$id);
  } catch (error) {
    functionExists = false;
  }

  const resolvedConfigDir = configDirPath ?? process.cwd();
  const resolvedPath = resolveFunctionDirectory(
    functionName,
    resolvedConfigDir,
    functionConfig.dirPath,
    functionPath
  );

  if (!validateFunctionDirectory(resolvedPath)) {
    throw new Error(`Function directory is invalid or missing required files: ${resolvedPath}`);
  }

  if (functionConfig.predeployCommands?.length) {
    MessageFormatter.processing("Executing predeploy commands...", { prefix: "Deployment" });
    const isWindows = platform() === "win32";

    for (const command of functionConfig.predeployCommands) {
      try {
        MessageFormatter.debug(`Executing: ${command}`, undefined, { prefix: "Deployment" });
        execSync(command, {
          cwd: resolvedPath,
          stdio: "inherit",
          shell: isWindows ? "cmd.exe" : "/bin/sh",
          windowsHide: true,
        });
      } catch (error) {
        MessageFormatter.error(
          `Failed to execute predeploy command: ${command}`,
          error instanceof Error ? error : undefined,
          { prefix: "Deployment" }
        );
        throw new Error(``);
      }
    }
  }

  // Only create function if it doesn't exist
  if (!functionExists) {
    await createFunction(client, functionConfig);
  } else {
    MessageFormatter.processing("Updating function...", { prefix: "Deployment" });
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
