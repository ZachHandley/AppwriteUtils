import { Client, Sites, type Models } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { create as createTarball } from "tar";
import { join, relative } from "node:path";
import fs from "node:fs";
import { platform } from "node:os";
import { type AppwriteSite } from "appwrite-utils";
import chalk from "chalk";
import cliProgress from "cli-progress";
import { execSync } from "child_process";
import {
  activateSiteDeployment,
  createSite,
  getSite,
  updateSite,
  waitForSiteDeploymentReady,
} from "./methods.js";
import { MessageFormatter } from "appwrite-utils-helpers";
import { resolveFunctionDirectory, validateFunctionDirectory } from "appwrite-utils-helpers";

const DEFAULT_SITE_IGNORED = [
  "node_modules",
  ".git",
  ".vscode",
  ".DS_Store",
  "__pycache__",
  ".venv",
];

// Slim ignore for prebuilt site deploys: ship built artifacts.
const PREBUILT_SITE_IGNORED = [".git", ".vscode", ".DS_Store"];

export const deploySite = async (
  client: Client,
  siteId: string,
  codePath: string,
  activate: boolean = true,
  installCommand?: string,
  buildCommand?: string,
  outputDirectory?: string,
  ignored: string[] = DEFAULT_SITE_IGNORED
) => {
  const sites = new Sites(client);
  MessageFormatter.processing("Preparing site deployment...", { prefix: "Deployment" });

  // Convert ignored patterns to lowercase for case-insensitive comparison
  const ignoredLower = ignored.map((pattern) => pattern.toLowerCase());

  const tarPath = join(process.cwd(), `site-${siteId}.tar.gz`);

  // Verify codePath exists and is a directory
  if (!fs.existsSync(codePath)) {
    throw new Error(`Site directory not found at ${codePath}`);
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
    barCompleteChar: "\u2588",
    barIncompleteChar: "\u2591",
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
    ["."]
  );

  const fileBuffer = await fs.promises.readFile(tarPath);
  const fileObject = InputFile.fromBuffer(
    new Uint8Array(fileBuffer),
    `site-${siteId}.tar.gz`
  );

  try {
    MessageFormatter.processing("Creating deployment...", { prefix: "Deployment" });
    // Start with 1 as default total since we don't know the chunk size yet
    progressBar.start(1, 0);

    const siteResponse = await sites.createDeployment({
      siteId,
      code: fileObject as any,
      activate,
      installCommand,
      buildCommand,
      outputDirectory,
      onProgress: (progress) => {
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
      },
    });

    // Ensure progress bar completes even if callback never fired
    if (progressBar.getProgress() === 0) {
      progressBar.update(1);
      progressBar.stop();
    }

    await fs.promises.unlink(tarPath);

    if (activate) {
      MessageFormatter.processing(
        `Waiting for site deployment ${siteResponse.$id} to finish building...`,
        { prefix: "Deployment" }
      );
      const readyDeployment = await waitForSiteDeploymentReady(
        client,
        siteId,
        siteResponse.$id
      );
      await activateSiteDeployment(client, siteId, readyDeployment.$id);
      MessageFormatter.success(
        `Activated site deployment ${readyDeployment.$id}`,
        { prefix: "Deployment" }
      );
      return readyDeployment;
    }

    return siteResponse;
  } catch (error) {
    progressBar.stop();
    MessageFormatter.error("Deployment failed", error instanceof Error ? error : undefined, { prefix: "Deployment" });
    throw error;
  }
};

export const deployLocalSite = async (
  client: Client,
  siteName: string,
  siteConfig: AppwriteSite,
  sitePath?: string,
  configDirPath?: string
) => {
  let siteExists = true;
  let siteThatExists: Models.Site;
  try {
    siteThatExists = await getSite(client, siteConfig.$id);
  } catch (error) {
    siteExists = false;
  }

  const resolvedConfigDir = configDirPath ?? process.cwd();
  // Reuse function directory resolution logic -- sites follow the same
  // convention: sites/<siteName> directories walking up to git root.
  const resolvedPath = resolveFunctionDirectory(
    siteName,
    resolvedConfigDir,
    siteConfig.dirPath,
    sitePath
  );

  if (!validateFunctionDirectory(resolvedPath)) {
    throw new Error(`Site directory is invalid or missing required files: ${resolvedPath}`);
  }

  const isWindows = platform() === "win32";

  if (siteConfig.predeployCommands?.length) {
    MessageFormatter.processing("Executing predeploy commands...", { prefix: "Deployment" });

    for (const command of siteConfig.predeployCommands) {
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
        throw new Error(`Failed to execute predeploy command: ${command}`);
      }
    }
  }

  // Only create site if it doesn't exist
  if (!siteExists) {
    await createSite(client, siteConfig);
  } else {
    MessageFormatter.processing("Updating site...", { prefix: "Deployment" });
    await updateSite(client, siteConfig);
  }

  const deployPath = siteConfig.deployDir
    ? join(resolvedPath, siteConfig.deployDir)
    : resolvedPath;

  // Prebuilt mode: run installCommand then buildCommand locally in deployPath
  // so the build output (dist/, .output/, etc.) lands inside the tarball.
  // Appwrite is then told to skip its build step (empty install+build commands).
  const prebuilt = siteConfig.prebuilt === true;
  if (prebuilt) {
    const localSteps: Array<{ label: string; command?: string }> = [
      { label: "install", command: siteConfig.installCommand },
      { label: "build", command: siteConfig.buildCommand },
    ];
    for (const step of localSteps) {
      if (!step.command || step.command.trim().length === 0) continue;
      MessageFormatter.processing(
        `[prebuilt] Running ${step.label} locally: ${step.command}`,
        { prefix: "Deployment" }
      );
      try {
        execSync(step.command, {
          cwd: deployPath,
          stdio: "inherit",
          shell: isWindows ? "cmd.exe" : "/bin/sh",
          windowsHide: true,
        });
      } catch (error) {
        MessageFormatter.error(
          `[prebuilt] Local ${step.label} failed: ${step.command}`,
          error instanceof Error ? error : undefined,
          { prefix: "Deployment" }
        );
        throw error;
      }
    }
  }

  return deploySite(
    client,
    siteConfig.$id,
    deployPath,
    true,
    prebuilt ? "" : siteConfig.installCommand,
    prebuilt ? "" : siteConfig.buildCommand,
    siteConfig.outputDirectory,
    siteConfig.ignore ?? (prebuilt ? PREBUILT_SITE_IGNORED : DEFAULT_SITE_IGNORED)
  );
};
