import { Client, Functions, Runtime, type Models } from "node-appwrite";
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

export interface FunctionDeploymentOptions {
  activate?: boolean;
  entrypoint?: string;
  commands?: string;
  ignored?: string[];
  verbose?: boolean;
  forceRedeploy?: boolean;
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
    const {
      activate = true,
      entrypoint = functionConfig.entrypoint || "main.js",
      commands = functionConfig.commands || "npm install",
      ignored = ["node_modules", ".git", ".vscode", ".DS_Store", "__pycache__", ".venv"],
      verbose = false,
      forceRedeploy = false
    } = options;

    return await functionLimit(async () => {
      if (verbose) {
        MessageFormatter.processing(`Deploying function: ${functionConfig.name}`, { prefix: "Functions" });
        MessageFormatter.debug(`Path: ${functionPath}`, undefined, { prefix: "Functions" });
        MessageFormatter.debug(`Entrypoint: ${entrypoint}`, undefined, { prefix: "Functions" });
      }

      // Validate function directory
      if (!await this.isValidFunctionDirectory(functionPath)) {
        throw new Error(`Invalid function directory: ${functionPath}`);
      }

      // Ensure function exists
      let functionExists = false;
      try {
        await this.getFunction(functionConfig.$id);
        functionExists = true;
      } catch (error) {
        if (verbose) {
          MessageFormatter.info(`Function ${functionConfig.$id} does not exist, creating...`, { prefix: "Functions" });
        }
      }

      // Create function if it doesn't exist
      if (!functionExists) {
        await this.createFunction(functionConfig, { verbose });
      } else if (forceRedeploy) {
        await this.updateFunction(functionConfig, { verbose });
      }

      // Execute pre-deploy commands if specified
      if (functionConfig.predeployCommands?.length) {
        await this.executePredeployCommands(functionConfig.predeployCommands, functionPath, { verbose });
      }

      // Deploy the function
      const deployment = await this.createDeployment(
        functionConfig.$id,
        functionPath,
        { activate, entrypoint, commands, ignored, verbose }
      );

      if (verbose) {
        MessageFormatter.success(`Function ${functionConfig.name} deployed successfully`, { prefix: "Functions" });
      }

      return deployment;
    });
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
        functionConfig.scopes || [],
        functionConfig.installationId,
        functionConfig.providerRepositoryId,
        functionConfig.providerBranch,
        functionConfig.providerSilentMode,
        functionConfig.providerRootDirectory
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
        functionConfig.scopes || [],
        functionConfig.installationId,
        functionConfig.providerRepositoryId,
        functionConfig.providerBranch,
        functionConfig.providerSilentMode,
        functionConfig.providerRootDirectory,
        functionConfig.specification
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

  private async createDeployment(
    functionId: string,
    codePath: string,
    options: FunctionDeploymentOptions & { verbose?: boolean } = {}
  ): Promise<Models.Deployment> {
    const { activate = true, entrypoint = "main.js", commands = "npm install", ignored = [], verbose = false } = options;

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

      return deployment;
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
}
