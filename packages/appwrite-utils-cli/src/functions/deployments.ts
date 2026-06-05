import { Client, Functions, Runtime, type Models } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { create as createTarball } from "tar";
import { join, relative } from "node:path";
import fs from "node:fs";
import { platform, tmpdir } from "node:os";
import { type AppwriteFunction, type Specification } from "appwrite-utils";
import chalk from "chalk";
import cliProgress from "cli-progress";
import { execSync } from "child_process";
import {
  activateDeployment,
  createFunction,
  getFunction,
  updateFunction,
  updateFunctionSpecifications,
  waitForDeploymentReady,
  type WaitForDeploymentOptions,
} from "./methods.js";
import ignore from "ignore";
import { MessageFormatter } from "appwrite-utils-helpers";
import { resolveFunctionDirectory, validateFunctionDirectory } from 'appwrite-utils-helpers';

const DEFAULT_IGNORED = [
  "node_modules",
  ".git",
  ".vscode",
  ".DS_Store",
  "__pycache__",
  ".venv",
];

// Slimmer ignore list for `prebuilt: true` deploys: built artifacts
// (node_modules, .venv, __pycache__) MUST ship so Appwrite can skip its
// build step entirely. Only strip VCS/editor noise.
const PREBUILT_IGNORED = [".git", ".vscode", ".DS_Store"];

// Default `.fnconfig.yml#keep` applied when `prebuilt: true` and the user
// did not supply a `keep:` list. Any of these entries appearing in
// `ignore:` get filtered out, so build artifacts the prebuilt deploy
// depends on can't be stripped by a stale ignore block. Users can set
// `keep: [...]` to extend or replace, or `keep: []` to disable.
const DEFAULT_PREBUILT_KEEP = [
  // JS / TS (npm / pnpm / bun)
  "node_modules",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "out",
  // Rust (cargo)
  "target",
  // Go
  "bin",
  "vendor",
  // Python
  ".venv",
  "venv",
  "__pycache__",
  // Elixir / Erlang
  "_build",
  "deps",
  // Dart / Flutter
  ".dart_tool",
  // Java / Kotlin (Gradle wrapper)
  ".gradle",
];

/**
 * Best-effort filesystem flush + brief wait. Called after a prebuilt build
 * command (`bun install`, `npm install && npm run build`, etc.) and before
 * tar walks the directory. Bun's package installer in particular finishes
 * the foreground process before all its hardlink/cache writes have been
 * fully flushed by the kernel; tar's lstat-then-read pattern then trips
 * the size-mismatch check at write-entry.js:382 ("did not encounter
 * expected EOF") for one or two files. `sync(1)` flushes the pending
 * writes; the 2s wait covers userspace coordination in the installer.
 *
 * Wait is async (setTimeout) so the event loop stays responsive while we
 * pause. On Windows there is no `sync(1)` — only the wait runs.
 */
const settleFilesystem = async (): Promise<void> => {
  const isWindows = platform() === "win32";
  if (!isWindows) {
    try {
      execSync("sync", { stdio: "ignore", windowsHide: true });
    } catch {
      // sync unavailable / blocked; the wait below still helps.
    }
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 2000));
};

/**
 * Upload-only phase of a deployment: tars + uploads the function source and
 * creates the deployment record. Does NOT wait for the build to finish and
 * does NOT explicitly call activateDeployment — the returned deployment is
 * typically in "waiting" or "building" state.
 *
 * Pair with finalizeFunctionDeployment to wait+activate.
 */
export const uploadFunctionDeployment = async (
  client: Client,
  functionId: string,
  codePath: string,
  activate: boolean = true,
  entrypoint: string = "main.js",
  commands: string = "npm install",
  ignored: string[] = DEFAULT_IGNORED
): Promise<Models.Deployment> => {
  const functions = new Functions(client);
  MessageFormatter.processing("Preparing function deployment...", { prefix: "Deployment" });

  const ignoredLower = ignored.map((pattern) => pattern.toLowerCase());
  // Write the tarball into the OS temp dir, not the cwd we are tarring.
  // Otherwise tar's recursive walk visits the output file while it is still
  // being written, the size grows mid-read, and node-tar throws
  // "did not encounter expected EOF" (write-entry.js:382). The function's
  // own `ignore` list typically doesn't list `function-*.tar.gz` because it
  // is implementation detail of this CLI, so the only safe fix is to move
  // the output entirely out of the walked tree.
  const tarPath = join(tmpdir(), `function-${functionId}-${Date.now()}.tar.gz`);

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

  let ignoredCount = 0;
  try {
    await createTarball(
      {
        gzip: true,
        file: tarPath,
        cwd: codePath,
        filter: (path, _stat) => {
          const relativePath = relative(
            codePath,
            join(codePath, path)
          ).toLowerCase();
          if (
            ignoredLower.some(
              (pattern) =>
                relativePath.startsWith(pattern) ||
                relativePath.includes(`/${pattern}`) ||
                relativePath.includes(`\\${pattern}`)
            )
          ) {
            ignoredCount++;
            return false;
          }
          return true;
        },
      },
      ["."]
    );
    MessageFormatter.info(
      `Tarball written; ignored ${ignoredCount} entries`,
      { prefix: "Deployment" }
    );
  } catch (error) {
    // node-tar errors carry the offending file on `err.path`. Rewrite the
    // error message so it survives the BatchDeploy re-log path and operators
    // can see WHICH file tripped checks like "did not encounter expected EOF".
    if (error && typeof error === "object" && "path" in error) {
      const path = (error as { path: unknown }).path;
      if (typeof path === "string" && error instanceof Error) {
        error.message = `${error.message} (file: ${path})`;
      }
    }
    throw error;
  }

  // Stream the tarball from disk via InputFile.fromPath instead of buffering
  // the whole file into memory. This avoids the 2x peak-memory hit
  // (readFile Buffer + Uint8Array copy) and removes a silent OOM exit vector
  // on large prebuilt deploys (node_modules + dist can be hundreds of MiB).
  let tarballBytes = 0;
  try {
    const stat = await fs.promises.stat(tarPath);
    tarballBytes = stat.size;
  } catch (error) {
    MessageFormatter.error(
      `Tarball stat failed at ${tarPath}`,
      error instanceof Error ? error : undefined,
      { prefix: "Deployment" }
    );
    throw error;
  }
  if (tarballBytes === 0) {
    const empty = new Error(
      `Tarball is empty (${tarPath}) — createTarball resolved without writing bytes`
    );
    MessageFormatter.error(empty.message, empty, { prefix: "Deployment" });
    throw empty;
  }
  MessageFormatter.info(
    `Tarball ${(tarballBytes / 1024 / 1024).toFixed(1)} MiB ready for upload`,
    { prefix: "Deployment" }
  );

  let fileObject;
  try {
    fileObject = InputFile.fromPath(
      tarPath,
      `function-${functionId}.tar.gz`
    );
  } catch (error) {
    MessageFormatter.error(
      `InputFile.fromPath failed for ${tarPath}`,
      error instanceof Error ? error : undefined,
      { prefix: "Deployment" }
    );
    throw error;
  }

  try {
    MessageFormatter.processing("Creating deployment...", { prefix: "Deployment" });
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
          if (chunks === 0) {
            progressBar.start(total || 100, 0);
          } else {
            progressBar.update(chunks);

            if (chunks === total) {
              progressBar.update(total);
              progressBar.stop();
              MessageFormatter.success("Upload complete!", { prefix: "Deployment" });
            }
          }
        }
      }
    );

    if (progressBar.getProgress() === 0) {
      progressBar.update(1);
      progressBar.stop();
    }

    return functionResponse;
  } catch (error) {
    progressBar.stop();
    // Tar/node-fs errors carry the offending file path on `err.path`. Surface it
    // so failures like "did not encounter expected EOF" name the file that
    // tripped the size-mismatch check instead of leaving the operator guessing.
    const errPath =
      error && typeof error === "object" && "path" in error && typeof (error as { path: unknown }).path === "string"
        ? ` (file: ${(error as { path: string }).path})`
        : "";
    MessageFormatter.error(`Upload failed${errPath}`, error instanceof Error ? error : undefined, { prefix: "Deployment" });
    throw error;
  } finally {
    try {
      await fs.promises.unlink(tarPath);
    } catch {
      // Ignore cleanup errors
    }
  }
};

/**
 * Finalize phase of a deployment: polls until the build is ready, then
 * explicitly activates the deployment. Safe to run concurrently for many
 * deployments because the underlying calls are just polling getDeployment
 * and a single updateFunctionDeployment per call.
 */
export const finalizeFunctionDeployment = async (
  client: Client,
  functionId: string,
  deploymentId: string,
  pollOptions?: WaitForDeploymentOptions
): Promise<Models.Deployment> => {
  MessageFormatter.processing(
    `Waiting for deployment ${deploymentId} (function ${functionId}) to finish building...`,
    { prefix: "Deployment" }
  );
  const readyDeployment = await waitForDeploymentReady(
    client,
    functionId,
    deploymentId,
    pollOptions
  );
  await activateDeployment(client, functionId, readyDeployment.$id);
  MessageFormatter.success(
    `Activated deployment ${readyDeployment.$id} (function ${functionId})`,
    { prefix: "Deployment" }
  );
  return readyDeployment;
};

/**
 * Thin wrapper preserving the original single-function deploy semantics:
 * upload then (if activate) wait+activate inline.
 */
export const deployFunction = async (
  client: Client,
  functionId: string,
  codePath: string,
  activate: boolean = true,
  entrypoint: string = "main.js",
  commands: string = "npm install",
  ignored: string[] = DEFAULT_IGNORED
) => {
  const deployment = await uploadFunctionDeployment(
    client,
    functionId,
    codePath,
    activate,
    entrypoint,
    commands,
    ignored
  );

  if (!activate) {
    return deployment;
  }

  return await finalizeFunctionDeployment(client, functionId, deployment.$id);
};

/**
 * Result of prepareFunctionDeployment: the resolved code directory and the
 * effective config, ready to be passed to uploadFunctionDeployment.
 */
export interface PreparedFunctionDeployment {
  functionId: string;
  functionName: string;
  deployPath: string;
  entrypoint: string;
  /**
   * Commands string sent to Appwrite's createDeployment. Empty when the
   * function is prebuilt — Appwrite skips the build step entirely.
   */
  commands: string;
  ignored: string[];
  prebuilt: boolean;
}

/**
 * Runs everything that must happen BEFORE the tarball upload:
 *  - resolves the on-disk code directory
 *  - creates the function on Appwrite if missing, otherwise pushes the
 *    config (specs, scopes, schedule, etc.)
 *  - runs predeployCommands
 *
 * Returns the info needed to call uploadFunctionDeployment.
 */
export const prepareFunctionDeployment = async (
  client: Client,
  functionName: string,
  functionConfig: AppwriteFunction,
  functionPath?: string,
  configDirPath?: string
): Promise<PreparedFunctionDeployment> => {
  let functionExists = true;
  try {
    await getFunction(client, functionConfig.$id);
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

  const isWindows = platform() === "win32";

  if (functionConfig.predeployCommands?.length) {
    MessageFormatter.processing("Executing predeploy commands...", { prefix: "Deployment" });

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

  if (!functionExists) {
    await createFunction(client, functionConfig);
  } else {
    MessageFormatter.processing("Updating function...", { prefix: "Deployment" });
    await updateFunction(client, functionConfig);
  }

  const deployPath = functionConfig.deployDir
    ? join(resolvedPath, functionConfig.deployDir)
    : resolvedPath;

  // Prebuilt mode: run the function's build commands locally now (in deployPath
  // so the built artifacts land alongside the source we're about to tar), then
  // tell Appwrite to skip its build step by passing empty commands.
  const prebuilt = functionConfig.prebuilt === true;
  if (prebuilt && functionConfig.commands && functionConfig.commands.trim().length > 0) {
    MessageFormatter.processing(
      `[prebuilt] Running build locally: ${functionConfig.commands}`,
      { prefix: "Deployment" }
    );
    try {
      execSync(functionConfig.commands, {
        cwd: deployPath,
        stdio: "inherit",
        shell: isWindows ? "cmd.exe" : "/bin/sh",
        windowsHide: true,
      });
    } catch (error) {
      MessageFormatter.error(
        `[prebuilt] Local build failed: ${functionConfig.commands}`,
        error instanceof Error ? error : undefined,
        { prefix: "Deployment" }
      );
      throw error;
    }

    // Bun's installer (and some other tools) settle lazily: hardlink and
    // cache materializations can leak past the foreground process exit.
    // If tar starts walking immediately, lstat sees size N but the read
    // returns more bytes than that, failing with
    // "did not encounter expected EOF" (tar/dist/.../write-entry.js:382).
    // Flush pending FS writes and give the kernel a moment before tarring.
    await settleFilesystem();
  }

  // Pick the ignore list. User-supplied `ignore` wins, except when
  // `prebuilt: true` — then we filter out entries that appear in `keep`
  // (defaulting to DEFAULT_PREBUILT_KEEP) so a legacy `ignore:` block can't
  // accidentally strip the very artifacts the prebuilt deploy depends on.
  let ignored: string[];
  if (functionConfig.ignore) {
    if (prebuilt) {
      const keep = new Set(functionConfig.keep ?? DEFAULT_PREBUILT_KEEP);
      ignored = functionConfig.ignore.filter((entry) => !keep.has(entry));
    } else {
      ignored = functionConfig.ignore;
    }
  } else {
    ignored = prebuilt ? PREBUILT_IGNORED : DEFAULT_IGNORED;
  }

  return {
    functionId: functionConfig.$id,
    functionName,
    deployPath,
    entrypoint: functionConfig.entrypoint ?? "main.js",
    commands: prebuilt ? "" : (functionConfig.commands ?? "npm install"),
    ignored,
    prebuilt,
  };
};

/**
 * Thin wrapper preserving the original single-function deploy semantics:
 * prepare + upload + wait + activate inline.
 */
export const deployLocalFunction = async (
  client: Client,
  functionName: string,
  functionConfig: AppwriteFunction,
  functionPath?: string,
  configDirPath?: string
) => {
  const prepared = await prepareFunctionDeployment(
    client,
    functionName,
    functionConfig,
    functionPath,
    configDirPath
  );

  return deployFunction(
    client,
    prepared.functionId,
    prepared.deployPath,
    true,
    prepared.entrypoint,
    prepared.commands,
    prepared.ignored
  );
};
