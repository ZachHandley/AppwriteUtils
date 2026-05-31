import { Client, Functions, Runtime, ExecutionMethod, VCSReferenceType, ID, type Models, type Scopes } from "node-appwrite";
import { type AppwriteFunction, EventTypeSchema } from "appwrite-utils";
import { join, relative, resolve, basename } from "node:path";
import fs from "node:fs";
import chalk from "chalk";
import pLimit from "p-limit";
import { tryAwaitWithRetry } from "../utils/helperFunctions.js";
import { MessageFormatter } from "../shared/messageFormatter.js";

/**
 * Validates and filters events array for Appwrite functions
 * - Filters out empty/invalid strings
 * - Validates against EventTypeSchema
 * - Limits to 100 items maximum (Appwrite limit)
 * - Returns empty array if input is invalid
 */
const validateEvents = (events?: string[]): string[] => {
  if (!events || !Array.isArray(events)) return [];

  return events
    .filter(event => {
      if (!event || typeof event !== 'string' || event.trim().length === 0) {
        return false;
      }
      // Validate against EventTypeSchema
      const result = EventTypeSchema.safeParse(event);
      if (!result.success) {
        MessageFormatter.warning(`Invalid event type "${event}" will be filtered out`, { prefix: "Functions" });
        return false;
      }
      return true;
    })
    .slice(0, 100);
};

// Concurrency limits
const functionLimit = pLimit(5);    // Moderate limit for function operations
const queryLimit = pLimit(25);      // Higher limit for read operations

export interface FunctionSearchOptions {
  searchPaths?: string[];
  caseSensitive?: boolean;
  allowFuzzyMatch?: boolean;
  verbose?: boolean;
}

export interface BatchDeployItem {
  functionConfig: AppwriteFunction;
  functionPath: string;
  options?: FunctionDeploymentOptions;
}

export interface BatchDeployOptions {
  buildConcurrency?: number;
  verbose?: boolean;
  /** Default poll options applied to items that don't set their own. */
  pollOptions?: { intervalMs?: number; timeoutMs?: number };
}

export interface BatchDeployResult {
  functionName: string;
  functionId: string;
  status: "ready" | "failed";
  deploymentId?: string;
  error?: Error;
  durationMs: number;
}

export interface FunctionDeploymentOptions {
  activate?: boolean;
  entrypoint?: string;
  commands?: string;
  ignored?: string[];
  verbose?: boolean;
  /**
   * When true (or when `functionConfig.prebuilt === true`), run the function's
   * `commands` LOCALLY before tarring, ship the resulting build artifacts
   * inside the tarball (slim ignore list), and tell Appwrite to skip its
   * build step (empty commands sent to createDeployment). Bypasses Appwrite's
   * build container entirely so private GitHub deps don't need an
   * installation/GitHub token on Appwrite.
   */
  prebuilt?: boolean;
  /**
   * @deprecated The function config is now always pushed when the function
   * exists; this flag is retained for back-compat and is a no-op.
   */
  forceRedeploy?: boolean;
  /**
   * Polling knobs for the post-upload wait-until-ready loop that runs when
   * `activate !== false`. Defaults: `intervalMs=3000`, `timeoutMs=600000`.
   */
  pollOptions?: { intervalMs?: number; timeoutMs?: number };
}

export class FunctionManager {
  private client: Client;
  private functions: Functions;

  constructor(client: Client) {
    this.client = client;
    this.functions = new Functions(client);
  }

  /**
   * Improved function directory detection with multiple strategies
   */
  public async findFunctionDirectory(
    functionName: string,
    options: FunctionSearchOptions = {}
  ): Promise<string | null> {
    const {
      searchPaths = [process.cwd()],
      caseSensitive = false,
      allowFuzzyMatch = true,
      verbose = false
    } = options;

    if (verbose) {
      MessageFormatter.info(`Searching for function: ${functionName}`, { prefix: "Functions" });
    }

    // Normalize function name for comparison
    const normalizedName = caseSensitive ? functionName : functionName.toLowerCase();
    const nameVariations = this.generateNameVariations(normalizedName);

    // Strategy 1: Check standard locations first
    const standardPaths = this.getStandardFunctionPaths(searchPaths, functionName);
    for (const path of standardPaths) {
      if (await this.isValidFunctionDirectory(path)) {
        if (verbose) {
          MessageFormatter.success(`Found function at standard location: ${path}`, { prefix: "Functions" });
        }
        return path;
      }
    }

    // Strategy 2: Recursive directory search with fuzzy matching
    if (allowFuzzyMatch) {
      for (const searchPath of searchPaths) {
        const foundPath = await this.recursiveDirectorySearch(
          searchPath,
          nameVariations,
          { caseSensitive, verbose }
        );
        if (foundPath) {
          if (verbose) {
            MessageFormatter.success(`Found function via fuzzy search: ${foundPath}`, { prefix: "Functions" });
          }
          return foundPath;
        }
      }
    }

    if (verbose) {
      MessageFormatter.warning(`Function directory not found: ${functionName}`, { prefix: "Functions" });
    }
    return null;
  }

  private generateNameVariations(name: string): Set<string> {
    const variations = new Set<string>([
      name,
      name.toLowerCase(),
      name.replace(/\s+/g, "-"),
      name.replace(/\s+/g, "_"),
      name.replace(/[^a-z0-9]/gi, ""),
      name.replace(/[-_\s]+/g, ""),
      name.replace(/[-_\s]+/g, "-").toLowerCase(),
      name.replace(/[-_\s]+/g, "_").toLowerCase(),
    ]);

    return variations;
  }

  private getStandardFunctionPaths(searchPaths: string[], functionName: string): string[] {
    const normalizedName = functionName.toLowerCase().replace(/\s+/g, "-");
    const paths: string[] = [];

    for (const basePath of searchPaths) {
      paths.push(
        join(basePath, "functions", functionName),
        join(basePath, "functions", normalizedName),
        join(basePath, "src", "functions", functionName),
        join(basePath, "src", "functions", normalizedName),
        join(basePath, functionName),
        join(basePath, normalizedName),
        join(basePath, "appwrite", "functions", functionName),
        join(basePath, "appwrite", "functions", normalizedName)
      );
    }

    return paths;
  }

  private async recursiveDirectorySearch(
    searchPath: string,
    nameVariations: Set<string>,
    options: { caseSensitive: boolean; verbose: boolean }
  ): Promise<string | null> {
    const { caseSensitive, verbose } = options;

    try {
      const stats = await fs.promises.stat(searchPath);
      if (!stats.isDirectory()) return null;

      const entries = await fs.promises.readdir(searchPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // Skip common directories that won't contain functions
        if (this.shouldSkipDirectory(entry.name)) continue;

        const entryPath = join(searchPath, entry.name);

        // Check if this directory matches our function name
        const entryNameToCheck = caseSensitive ? entry.name : entry.name.toLowerCase();
        if (nameVariations.has(entryNameToCheck)) {
          if (await this.isValidFunctionDirectory(entryPath)) {
            return entryPath;
          }
        }

        // Recursively search subdirectories
        const result = await this.recursiveDirectorySearch(entryPath, nameVariations, options);
        if (result) return result;
      }
    } catch (error) {
      if (verbose) {
        MessageFormatter.debug(`Skipping inaccessible directory: ${searchPath}`, undefined, { prefix: "Functions" });
      }
    }

    return null;
  }

  private shouldSkipDirectory(dirName: string): boolean {
    const skipDirs = new Set([
      'node_modules',
      '.git',
      '.vscode',
      '.idea',
      'dist',
      'build',
      'coverage',
      '.nyc_output',
      'tmp',
      'temp',
      '.cache',
      '__pycache__',
      '.pytest_cache',
      'venv',
      '.venv',
      'env',
      '.env'
    ]);

    return skipDirs.has(dirName) || dirName.startsWith('.');
  }

  private async isValidFunctionDirectory(path: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(path);
      if (!stats.isDirectory()) return false;

      const files = await fs.promises.readdir(path);

      // Check for common function indicators
      const hasPackageJson = files.includes('package.json');
      const hasMainFile = files.some(file =>
        file.match(/^(index|main|app)\.(js|ts|py)$/i) ||
        file === 'src' ||
        file === 'lib'
      );
      const hasRequirements = files.includes('requirements.txt');
      const hasPyProject = files.includes('pyproject.toml');

      return hasPackageJson || hasMainFile || hasRequirements || hasPyProject;
    } catch {
      return false;
    }
  }

  /**
   * Enhanced function deployment with better error handling and validation
   */
  public async deployFunction(
    functionConfig: AppwriteFunction,
    functionPath: string,
    options: FunctionDeploymentOptions = {}
  ): Promise<Models.Deployment> {
    return await functionLimit(async () => {
      const deployment = await this.uploadDeployment(functionConfig, functionPath, options);
      const { activate = true, verbose = false, pollOptions } = options;

      if (!activate) {
        if (verbose) {
          MessageFormatter.success(`Function ${functionConfig.name} uploaded (activate=false)`, { prefix: "Functions" });
        }
        return deployment;
      }

      const ready = await this.finalizeDeployment(functionConfig.$id, deployment.$id, pollOptions);

      if (verbose) {
        MessageFormatter.success(`Function ${functionConfig.name} deployed successfully`, { prefix: "Functions" });
      }

      return ready;
    });
  }

  /**
   * Run the upload phase only: validate directory, push function config,
   * run predeploy commands, and call createDeployment without waiting for
   * the build or activating. Returns the deployment in its initial state.
   *
   * Used by deployFunctionsBatch so multiple uploads can serialize while
   * many builds wait/activate in parallel.
   */
  public async uploadDeployment(
    functionConfig: AppwriteFunction,
    functionPath: string,
    options: FunctionDeploymentOptions = {}
  ): Promise<Models.Deployment> {
    const prebuilt =
      options.prebuilt === true || functionConfig.prebuilt === true;
    const {
      activate = true,
      entrypoint = functionConfig.entrypoint || "main.js",
      verbose = false,
    } = options;
    // commands/ignored have prebuilt-aware defaults: empty commands so Appwrite
    // skips its build, slim ignore so built artifacts ship.
    const commands =
      options.commands ??
      (prebuilt ? "" : functionConfig.commands || "npm install");
    const ignored =
      options.ignored ??
      (prebuilt
        ? [".git", ".vscode", ".DS_Store"]
        : ["node_modules", ".git", ".vscode", ".DS_Store", "__pycache__", ".venv"]);

    if (verbose) {
      MessageFormatter.processing(`Uploading function: ${functionConfig.name}`, { prefix: "Functions" });
      MessageFormatter.debug(`Path: ${functionPath}`, undefined, { prefix: "Functions" });
      MessageFormatter.debug(`Entrypoint: ${entrypoint}`, undefined, { prefix: "Functions" });
      if (prebuilt) {
        MessageFormatter.debug(`Mode: prebuilt (local build; Appwrite skips build step)`, undefined, { prefix: "Functions" });
      }
    }

    if (!await this.isValidFunctionDirectory(functionPath)) {
      throw new Error(`Invalid function directory: ${functionPath}`);
    }

    let functionExists = false;
    try {
      await this.getFunction(functionConfig.$id);
      functionExists = true;
    } catch (error) {
      if (verbose) {
        MessageFormatter.info(`Function ${functionConfig.$id} does not exist, creating...`, { prefix: "Functions" });
      }
    }

    if (!functionExists) {
      await this.createFunction(functionConfig, { verbose });
    } else {
      await this.updateFunction(functionConfig, { verbose });
    }

    if (functionConfig.predeployCommands?.length) {
      await this.executePredeployCommands(functionConfig.predeployCommands, functionPath, { verbose });
    }

    // Prebuilt: run the build LOCALLY in functionPath so artifacts land
    // alongside source before tarring.
    if (prebuilt && functionConfig.commands && functionConfig.commands.trim().length > 0) {
      if (verbose) {
        MessageFormatter.processing(
          `[prebuilt] Running build locally: ${functionConfig.commands}`,
          { prefix: "Functions" }
        );
      }
      await this.executePredeployCommands([functionConfig.commands], functionPath, { verbose });
      // Some installers (notably bun) leak hardlink/cache writes past the
      // foreground process exit; tar's lstat-then-read then trips
      // "did not encounter expected EOF" on a tail file. Flush + brief wait.
      await this.settleFilesystem();
    }

    return await this.createDeployment(
      functionConfig.$id,
      functionPath,
      { activate, entrypoint, commands, ignored, verbose, waitForReady: false }
    );
  }

  /**
   * Finalize phase of a deployment: wait until built, then explicitly
   * activate. Safe to run concurrently for many deployments.
   */
  public async finalizeDeployment(
    functionId: string,
    deploymentId: string,
    pollOptions?: { intervalMs?: number; timeoutMs?: number }
  ): Promise<Models.Deployment> {
    const ready = await this.waitForDeploymentReady(functionId, deploymentId, pollOptions);
    await this.activateDeployment(functionId, ready.$id);
    return ready;
  }

  private async createFunction(
    functionConfig: AppwriteFunction,
    options: { verbose?: boolean } = {}
  ): Promise<Models.Function> {
    const { verbose = false } = options;

    if (verbose) {
      MessageFormatter.processing(`Creating function: ${functionConfig.name}`, { prefix: "Functions" });
    }

    return await tryAwaitWithRetry(async () => {
      return await this.functions.create(
        functionConfig.$id,
        functionConfig.name,
        functionConfig.runtime as Runtime,
        functionConfig.execute || [],
        functionConfig.events || [],
        functionConfig.schedule || "",
        functionConfig.timeout || 15,
        functionConfig.enabled !== false,
        functionConfig.logging !== false,
        functionConfig.entrypoint,
        functionConfig.commands,
        (functionConfig.scopes || []) as Scopes[],
        functionConfig.installationId,
        functionConfig.providerRepositoryId,
        functionConfig.providerBranch,
        functionConfig.providerSilentMode,
        functionConfig.providerRootDirectory,
        functionConfig.buildSpecification,
        functionConfig.runtimeSpecification
      );
    });
  }

  private async updateFunction(
    functionConfig: AppwriteFunction,
    options: { verbose?: boolean } = {}
  ): Promise<Models.Function> {
    const { verbose = false } = options;

    if (verbose) {
      MessageFormatter.processing(`Updating function: ${functionConfig.name}`, { prefix: "Functions" });
    }

    return await tryAwaitWithRetry(async () => {
      return await this.functions.update(
        functionConfig.$id,
        functionConfig.name,
        functionConfig.runtime as Runtime,
        functionConfig.execute || [],
        functionConfig.events || [],
        functionConfig.schedule || "",
        functionConfig.timeout || 15,
        functionConfig.enabled !== false,
        functionConfig.logging !== false,
        functionConfig.entrypoint,
        functionConfig.commands,
        (functionConfig.scopes || []) as Scopes[],
        functionConfig.installationId,
        functionConfig.providerRepositoryId,
        functionConfig.providerBranch,
        functionConfig.providerSilentMode,
        functionConfig.providerRootDirectory,
        functionConfig.buildSpecification,
        functionConfig.runtimeSpecification
      );
    });
  }

  private async executePredeployCommands(
    commands: string[],
    workingDir: string,
    options: { verbose?: boolean } = {}
  ): Promise<void> {
    const { verbose = false } = options;
    const { execSync } = await import("child_process");
    const { platform } = await import("node:os");

    if (verbose) {
      MessageFormatter.processing("Executing pre-deploy commands...", { prefix: "Functions" });
    }

    const isWindows = platform() === "win32";

    for (const command of commands) {
      if (verbose) {
        MessageFormatter.debug(`$ ${command}`, undefined, { prefix: "Functions" });
      }

      try {
        execSync(command, {
          cwd: workingDir,
          stdio: verbose ? "inherit" : "pipe",
          shell: isWindows ? "cmd.exe" : "/bin/sh",
          windowsHide: true,
        });
      } catch (error) {
        MessageFormatter.error(`Failed to execute command: ${command}`, error as Error, { prefix: "Functions" });
        throw error;
      }
    }

    if (verbose) {
      MessageFormatter.success("Pre-deploy commands completed", { prefix: "Functions" });
    }
  }

  /**
   * Best-effort filesystem flush + brief wait. Called after a prebuilt
   * build command and before tar walks the directory. Bun's installer
   * (and a handful of build watchers) leave hardlink/cache writes
   * pending after the foreground process exits, causing tar to fail
   * with "did not encounter expected EOF" on a tail file. `sync(1)`
   * flushes the kernel; the 2s wait covers userspace coordination.
   * Windows lacks `sync(1)` — only the wait runs.
   */
  private async settleFilesystem(): Promise<void> {
    const { execSync } = await import("child_process");
    const { platform } = await import("node:os");
    if (platform() !== "win32") {
      try {
        execSync("sync", { stdio: "ignore", windowsHide: true });
      } catch {
        // sync unavailable / blocked; the wait below still helps.
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 2000));
  }

  private async createDeployment(
    functionId: string,
    codePath: string,
    options: FunctionDeploymentOptions & { verbose?: boolean; waitForReady?: boolean } = {}
  ): Promise<Models.Deployment> {
    const {
      activate = true,
      entrypoint = "main.js",
      commands = "npm install",
      ignored = [],
      verbose = false,
      pollOptions,
      waitForReady = true,
    } = options;

    const { InputFile } = await import("node-appwrite/file");
    const { create: createTarball } = await import("tar");

    const tarPath = join(process.cwd(), `function-${functionId}-${Date.now()}.tar.gz`);

    try {
      if (verbose) {
        MessageFormatter.processing("Creating deployment archive...", { prefix: "Functions" });
      }

      // Create tarball
      await createTarball(
        {
          gzip: true,
          file: tarPath,
          cwd: codePath,
          filter: (path) => {
            const relativePath = relative(codePath, join(codePath, path)).toLowerCase();
            const shouldIgnore = ignored.some(pattern =>
              relativePath.startsWith(pattern.toLowerCase()) ||
              relativePath.includes(`/${pattern.toLowerCase()}`) ||
              relativePath.includes(`\\${pattern.toLowerCase()}`)
            );

            if (shouldIgnore && verbose) {
              MessageFormatter.debug(`Ignoring: ${path}`, undefined, { prefix: "Functions" });
            }

            return !shouldIgnore;
          },
        },
        ["."]
      );

      // Read and upload
      const fileBuffer = await fs.promises.readFile(tarPath);
      const fileObject = InputFile.fromBuffer(
        new Uint8Array(fileBuffer),
        `function-${functionId}.tar.gz`
      );

      if (verbose) {
        MessageFormatter.processing("Uploading deployment...", { prefix: "Functions" });
      }

      const deployment = await tryAwaitWithRetry(async () => {
        return await this.functions.createDeployment(
          functionId,
          fileObject,
          activate,
          entrypoint,
          commands
        );
      });

      if (!activate || !waitForReady) {
        return deployment;
      }

      if (verbose) {
        MessageFormatter.processing(
          `Waiting for deployment ${deployment.$id} to finish building...`,
          { prefix: "Functions" }
        );
      }
      const readyDeployment = await this.waitForDeploymentReady(
        functionId,
        deployment.$id,
        pollOptions
      );
      await this.activateDeployment(functionId, readyDeployment.$id);
      if (verbose) {
        MessageFormatter.success(
          `Activated deployment ${readyDeployment.$id}`,
          { prefix: "Functions" }
        );
      }
      return readyDeployment;
    } finally {
      // Clean up tarball
      try {
        await fs.promises.unlink(tarPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  public async getFunction(functionId: string): Promise<Models.Function> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () => await this.functions.get(functionId))
    );
  }

  public async waitForDeploymentReady(
    functionId: string,
    deploymentId: string,
    options: { intervalMs?: number; timeoutMs?: number } = {}
  ): Promise<Models.Deployment> {
    const intervalMs = options.intervalMs ?? 3000;
    const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
    const startedAt = Date.now();

    while (true) {
      const deployment = await tryAwaitWithRetry(async () =>
        await this.functions.getDeployment(functionId, deploymentId)
      );
      const status = deployment.status;

      if (status === "ready") {
        return deployment;
      }

      if (status === "failed" || status === "canceled") {
        const log = (deployment.buildLogs ?? "").slice(-2000);
        throw new Error(
          `Deployment ${deploymentId} ended with status "${status}".${
            log ? `\nBuild log (tail):\n${log}` : ""
          }`
        );
      }

      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(
          `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for deployment ${deploymentId} to become ready (last status: "${status}").`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  public async activateDeployment(
    functionId: string,
    deploymentId: string
  ): Promise<Models.Function> {
    return await tryAwaitWithRetry(async () =>
      await this.functions.updateFunctionDeployment(functionId, deploymentId)
    );
  }

  /**
   * Pipelined multi-function deploy.
   *   - Uploads sequentially (clean upload UX, no createDeployment rate-limit churn).
   *   - As each upload completes, its wait+activate task is enqueued on a
   *     pLimit(buildConcurrency) worker pool and runs in parallel with the
   *     next upload.
   *   - At the end, all pending wait+activate tasks are awaited together via
   *     Promise.allSettled so one bad build does not abort the rest.
   *
   * Returns a per-function result array.
   */
  public async deployFunctionsBatch(
    items: BatchDeployItem[],
    options: BatchDeployOptions = {}
  ): Promise<BatchDeployResult[]> {
    if (items.length === 0) {
      return [];
    }

    const buildConcurrency = options.buildConcurrency ?? 5;
    const verbose = options.verbose ?? false;
    const finalizeLimit = pLimit(buildConcurrency);
    const overallStart = Date.now();

    if (verbose) {
      MessageFormatter.info(
        `Deploying ${items.length} function${items.length === 1 ? "" : "s"} (build concurrency: ${buildConcurrency})...`,
        { prefix: "Functions" }
      );
    }

    type Pending = {
      functionName: string;
      functionId: string;
      startedAt: number;
      promise: Promise<BatchDeployResult>;
    };

    const pending: Pending[] = [];
    const earlyFailures: BatchDeployResult[] = [];

    for (const item of items) {
      const startedAt = Date.now();
      let deploymentId: string;
      try {
        if (verbose) {
          MessageFormatter.progress(
            `[${item.functionConfig.name}] Uploading...`,
            { prefix: "Functions" }
          );
        }
        const uploaded = await this.uploadDeployment(
          item.functionConfig,
          item.functionPath,
          { ...item.options, verbose }
        );
        deploymentId = uploaded.$id;
        if (verbose) {
          MessageFormatter.success(
            `[${item.functionConfig.name}] Upload complete (${deploymentId}); build queued.`,
            { prefix: "Functions" }
          );
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        MessageFormatter.error(
          `[${item.functionConfig.name}] Upload failed`,
          err,
          { prefix: "Functions" }
        );
        earlyFailures.push({
          functionName: item.functionConfig.name,
          functionId: item.functionConfig.$id,
          status: "failed",
          error: err,
          durationMs: Date.now() - startedAt,
        });
        continue;
      }

      // If the caller passed activate=false, skip wait+activate entirely.
      const shouldFinalize = item.options?.activate !== false;
      const functionName = item.functionConfig.name;
      const functionId = item.functionConfig.$id;
      const itemStartedAt = startedAt;
      const pollOptions = item.options?.pollOptions ?? options.pollOptions;

      if (!shouldFinalize) {
        pending.push({
          functionName,
          functionId,
          startedAt: itemStartedAt,
          promise: Promise.resolve({
            functionName,
            functionId,
            status: "ready",
            deploymentId,
            durationMs: Date.now() - itemStartedAt,
          }),
        });
        continue;
      }

      const promise = finalizeLimit(async (): Promise<BatchDeployResult> => {
        try {
          const ready = await this.finalizeDeployment(functionId, deploymentId, pollOptions);
          return {
            functionName,
            functionId,
            status: "ready",
            deploymentId: ready.$id,
            durationMs: Date.now() - itemStartedAt,
          };
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          MessageFormatter.error(
            `[${functionName}] Build/activation failed`,
            err,
            { prefix: "Functions" }
          );
          return {
            functionName,
            functionId,
            status: "failed",
            deploymentId,
            error: err,
            durationMs: Date.now() - itemStartedAt,
          };
        }
      });

      pending.push({ functionName, functionId, startedAt: itemStartedAt, promise });
    }

    const settled = await Promise.allSettled(pending.map((p) => p.promise));
    const finalizeResults: BatchDeployResult[] = settled.map((s, idx) => {
      const slot = pending[idx];
      if (s.status === "fulfilled") return s.value;
      const err = s.reason instanceof Error ? s.reason : new Error(String(s.reason));
      return {
        functionName: slot.functionName,
        functionId: slot.functionId,
        status: "failed",
        error: err,
        durationMs: Date.now() - slot.startedAt,
      };
    });

    const results: BatchDeployResult[] = [...earlyFailures, ...finalizeResults];

    if (verbose) {
      const ready = results.filter((r) => r.status === "ready").length;
      const failed = results.length - ready;
      MessageFormatter.info(
        `Batch deploy summary: ${ready} ready, ${failed} failed in ${((Date.now() - overallStart) / 1000).toFixed(1)}s`,
        { prefix: "Functions" }
      );
    }

    return results;
  }

  public async listFunctions(): Promise<Models.FunctionList> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () => await this.functions.list())
    );
  }

  public async deleteFunction(functionId: string): Promise<void> {
    await functionLimit(() =>
      tryAwaitWithRetry(async () => await this.functions.delete(functionId))
    );
  }

  /**
   * List function executions. Supports Appwrite query strings to filter results.
   * Note: the `search` parameter is accepted for API symmetry but the underlying
   * Functions service exposes filtering via the `queries` array — callers that
   * pass `search` should encode it as a Query.search(...) string in `queries`.
   */
  public async listExecutions(
    functionId: string,
    queries?: string[],
    search?: string
  ): Promise<Models.ExecutionList> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () => {
        const params: { functionId: string; queries?: string[] } = { functionId };
        const mergedQueries: string[] = [];
        if (queries && queries.length > 0) mergedQueries.push(...queries);
        if (search && search.trim().length > 0) {
          // The Functions.listExecutions endpoint does not accept a `search`
          // argument directly; encode it as a Query.search filter so callers
          // get a consistent UX.
          const { Query } = await import("node-appwrite");
          mergedQueries.push(Query.search("requestPath", search));
        }
        if (mergedQueries.length > 0) params.queries = mergedQueries;
        return await this.functions.listExecutions(params);
      })
    );
  }

  /**
   * Get a single function execution by ID.
   */
  public async getExecution(
    functionId: string,
    executionId: string
  ): Promise<Models.Execution> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.functions.getExecution({ functionId, executionId })
      )
    );
  }

  /**
   * Trigger a function execution.
   */
  public async createExecution(
    functionId: string,
    body?: string,
    async?: boolean,
    path?: string,
    method?: ExecutionMethod,
    headers?: object,
    scheduledAt?: string
  ): Promise<Models.Execution> {
    return await functionLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.functions.createExecution({
          functionId,
          body,
          async,
          xpath: path,
          method,
          headers,
          scheduledAt,
        })
      )
    );
  }

  /**
   * Delete a function execution by ID.
   */
  public async deleteExecution(
    functionId: string,
    executionId: string
  ): Promise<void> {
    await functionLimit(() =>
      tryAwaitWithRetry(async () => {
        await this.functions.deleteExecution({ functionId, executionId });
      })
    );
  }

  /**
   * List code deployments for a function. Supports Appwrite query strings to
   * filter results and an optional free-text search.
   */
  public async listDeployments(
    functionId: string,
    queries?: string[],
    search?: string
  ): Promise<Models.DeploymentList> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () => {
        const params: { functionId: string; queries?: string[]; search?: string } = { functionId };
        if (queries && queries.length > 0) params.queries = queries;
        if (search && search.trim().length > 0) params.search = search;
        return await this.functions.listDeployments(params);
      })
    );
  }

  /**
   * Get a single function deployment by ID.
   */
  public async getDeployment(
    functionId: string,
    deploymentId: string
  ): Promise<Models.Deployment> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.functions.getDeployment({ functionId, deploymentId })
      )
    );
  }

  /**
   * Delete a function deployment by ID.
   */
  public async deleteDeployment(
    functionId: string,
    deploymentId: string
  ): Promise<void> {
    await functionLimit(() =>
      tryAwaitWithRetry(async () => {
        await this.functions.deleteDeployment({ functionId, deploymentId });
      })
    );
  }

  /**
   * Create a deployment for a VCS-connected function from a branch or commit
   * reference. This is the "redeploy from current branch HEAD" path used for
   * VCS-connected functions.
   */
  public async createVcsDeployment(
    functionId: string,
    reference: string,
    options?: { type?: "branch" | "commit"; activate?: boolean }
  ): Promise<Models.Deployment> {
    const type = options?.type ?? "branch";
    const activate = options?.activate ?? true;
    const vcsType =
      type === "commit" ? VCSReferenceType.Commit : VCSReferenceType.Branch;

    return await functionLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.functions.createVcsDeployment({
          functionId,
          type: vcsType,
          reference,
          activate,
        })
      )
    );
  }

  /**
   * List all per-function (function-scoped) environment variables for a
   * function. These are distinct from project-level variables: function-scoped
   * variables override project-level variables for the specific function.
   */
  public async listVariables(
    functionId: string,
    queries?: string[]
  ): Promise<Models.VariableList> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () => {
        const params: { functionId: string; queries?: string[] } = { functionId };
        if (queries && queries.length > 0) params.queries = queries;
        return await this.functions.listVariables(params);
      })
    );
  }

  /**
   * Get a single per-function (function-scoped) environment variable by ID.
   */
  public async getVariable(
    functionId: string,
    variableId: string
  ): Promise<Models.Variable> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.functions.getVariable({ functionId, variableId })
      )
    );
  }

  /**
   * Create a new per-function (function-scoped) environment variable. The
   * variable ID is generated server-side by Appwrite — unlike project-level
   * variables, function-scoped variables are not user-id-able by the caller.
   */
  public async createVariable(
    functionId: string,
    key: string,
    value: string,
    options: { secret?: boolean } = {}
  ): Promise<Models.Variable> {
    const secret = options.secret ?? false;

    return await functionLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.functions.createVariable({
          functionId,
          key,
          value,
          secret,
        })
      )
    );
  }

  /**
   * Update an existing per-function (function-scoped) environment variable.
   * All patch fields are optional at the caller surface. The underlying SDK
   * requires `key`, so when the caller omits it we issue a GET to read the
   * existing variable's key and forward that to the update call. The
   * GET-then-update flow runs inside a single `tryAwaitWithRetry` block so a
   * transient network failure retries the whole sequence.
   */
  public async updateVariable(
    functionId: string,
    variableId: string,
    patch: { key?: string; value?: string; secret?: boolean }
  ): Promise<Models.Variable> {
    return await functionLimit(() =>
      tryAwaitWithRetry(async () => {
        let key = patch.key;
        if (key === undefined) {
          const existing = await this.functions.getVariable({ functionId, variableId });
          key = existing.key;
        }
        return await this.functions.updateVariable({
          functionId,
          variableId,
          key,
          value: patch.value,
          secret: patch.secret,
        });
      })
    );
  }

  /**
   * Delete a per-function (function-scoped) environment variable by ID.
   */
  public async deleteVariable(
    functionId: string,
    variableId: string
  ): Promise<void> {
    await functionLimit(() =>
      tryAwaitWithRetry(async () => {
        await this.functions.deleteVariable({ functionId, variableId });
      })
    );
  }

  /**
   * Upsert a per-function variable BY KEY: update the existing variable with
   * that key, or create it if absent. Appwrite enforces unique keys per
   * function scope, so the key is the natural idempotency anchor (the
   * variableId is server-generated and not caller-stable).
   */
  public async upsertVariable(
    functionId: string,
    key: string,
    value: string,
    options: { secret?: boolean } = {}
  ): Promise<Models.Variable> {
    const existing = await this.listVariables(functionId);
    const match = existing.variables.find((v) => v.key === key);
    if (match) {
      return await this.updateVariable(functionId, match.$id, {
        key,
        value,
        secret: options.secret,
      });
    }
    return await this.createVariable(functionId, key, value, options);
  }

  /**
   * Bulk upsert per-function variables by key. Lists once up front, then
   * routes each entry to update-or-create. Concurrency is bounded by the
   * shared functionLimit via the underlying create/update calls.
   */
  public async upsertVariables(
    functionId: string,
    vars: Array<{ key: string; value: string; secret?: boolean }>
  ): Promise<Models.Variable[]> {
    const existing = await this.listVariables(functionId);
    const byKey = new Map(existing.variables.map((v) => [v.key, v]));
    return await Promise.all(
      vars.map((entry) => {
        const match = byKey.get(entry.key);
        if (match) {
          return this.updateVariable(functionId, match.$id, {
            key: entry.key,
            value: entry.value,
            secret: entry.secret,
          });
        }
        return this.createVariable(functionId, entry.key, entry.value, {
          secret: entry.secret,
        });
      })
    );
  }

  /**
   * Bulk delete per-function variables. Accepts variable IDs and/or keys;
   * keys are resolved to IDs via a single list call. Returns the IDs that
   * were actually deleted (unknown keys are skipped, not errored).
   */
  public async deleteVariables(
    functionId: string,
    selector: { variableIds?: string[]; keys?: string[] }
  ): Promise<{ deleted: string[]; skipped: string[] }> {
    const ids = new Set(selector.variableIds ?? []);
    const skipped: string[] = [];

    if (selector.keys && selector.keys.length > 0) {
      const existing = await this.listVariables(functionId);
      const byKey = new Map(existing.variables.map((v) => [v.key, v.$id]));
      for (const key of selector.keys) {
        const id = byKey.get(key);
        if (id) ids.add(id);
        else skipped.push(key);
      }
    }

    const deleted: string[] = [];
    await Promise.all(
      [...ids].map(async (id) => {
        await this.deleteVariable(functionId, id);
        deleted.push(id);
      })
    );
    return { deleted, skipped };
  }

  /**
   * Validate function configuration
   */
  public validateFunctionConfig(functionConfig: AppwriteFunction): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!functionConfig.$id) {
      errors.push("Function ID is required");
    }

    if (!functionConfig.name) {
      errors.push("Function name is required");
    }

    if (!functionConfig.runtime) {
      errors.push("Function runtime is required");
    }

    if (!functionConfig.entrypoint) {
      errors.push("Function entrypoint is required");
    }

    // Validate timeout
    if (functionConfig.timeout && (functionConfig.timeout < 1 || functionConfig.timeout > 900)) {
      errors.push("Function timeout must be between 1 and 900 seconds");
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Deploy a function via the official Appwrite CLI (`appwrite push function`).
   * Alternative to deployFunction() — uses the official tooling instead of the SDK directly.
   * See packages/appwrite-utils-helpers/src/functions/cliFunctionDeploy.ts for details.
   */
  public async deployFunctionViaCli(
    functionConfig: AppwriteFunction,
    opts?: import("./cliFunctionDeploy.js").DeployFunctionViaCliOptions
  ): Promise<import("../cli/appwriteCliRunner.js").AppwriteCliResult> {
    const { deployFunctionViaCli } = await import("./cliFunctionDeploy.js");
    return deployFunctionViaCli(functionConfig, opts);
  }
}
