import { Client, Functions, Runtime, type Models } from "node-appwrite";
import { type AppwriteFunction } from "appwrite-utils";
import { join, relative, resolve, basename } from "node:path";
import fs from "node:fs";
import chalk from "chalk";
import pLimit from "p-limit";
import { tryAwaitWithRetry } from "../utils/helperFunctions.js";

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
      console.log(chalk.blue(`🔍 Searching for function: ${functionName}`));
    }

    // Normalize function name for comparison
    const normalizedName = caseSensitive ? functionName : functionName.toLowerCase();
    const nameVariations = this.generateNameVariations(normalizedName);

    // Strategy 1: Check standard locations first
    const standardPaths = this.getStandardFunctionPaths(searchPaths, functionName);
    for (const path of standardPaths) {
      if (await this.isValidFunctionDirectory(path)) {
        if (verbose) {
          console.log(chalk.green(`✓ Found function at standard location: ${path}`));
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
            console.log(chalk.green(`✓ Found function via fuzzy search: ${foundPath}`));
          }
          return foundPath;
        }
      }
    }

    if (verbose) {
      console.log(chalk.yellow(`⚠ Function directory not found: ${functionName}`));
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
        console.log(chalk.gray(`Skipping inaccessible directory: ${searchPath}`));
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
      entrypoint = functionConfig.entrypoint || "index.js",
      commands = functionConfig.commands || "npm install",
      ignored = ["node_modules", ".git", ".vscode", ".DS_Store", "__pycache__", ".venv"],
      verbose = false,
      forceRedeploy = false
    } = options;

    return await functionLimit(async () => {
      if (verbose) {
        console.log(chalk.blue(`🚀 Deploying function: ${functionConfig.name}`));
        console.log(chalk.gray(`   Path: ${functionPath}`));
        console.log(chalk.gray(`   Entrypoint: ${entrypoint}`));
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
          console.log(chalk.yellow(`Function ${functionConfig.$id} does not exist, creating...`));
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
        console.log(chalk.green(`✅ Function ${functionConfig.name} deployed successfully`));
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
      console.log(chalk.blue(`Creating function: ${functionConfig.name}`));
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
        functionConfig.providerRootDirectory,
        functionConfig.templateRepository,
        functionConfig.templateOwner,
        functionConfig.templateRootDirectory,
        functionConfig.templateVersion,
        functionConfig.specification
      );
    });
  }

  private async updateFunction(
    functionConfig: AppwriteFunction,
    options: { verbose?: boolean } = {}
  ): Promise<Models.Function> {
    const { verbose = false } = options;

    if (verbose) {
      console.log(chalk.blue(`Updating function: ${functionConfig.name}`));
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
      console.log(chalk.blue("Executing pre-deploy commands..."));
    }

    const isWindows = platform() === "win32";

    for (const command of commands) {
      if (verbose) {
        console.log(chalk.gray(`  $ ${command}`));
      }

      try {
        execSync(command, {
          cwd: workingDir,
          stdio: verbose ? "inherit" : "pipe",
          shell: isWindows ? "cmd.exe" : "/bin/sh",
          windowsHide: true,
        });
      } catch (error) {
        console.error(chalk.red(`Failed to execute command: ${command}`));
        throw error;
      }
    }

    if (verbose) {
      console.log(chalk.green("✓ Pre-deploy commands completed"));
    }
  }

  private async createDeployment(
    functionId: string,
    codePath: string,
    options: FunctionDeploymentOptions & { verbose?: boolean } = {}
  ): Promise<Models.Deployment> {
    const { activate = true, entrypoint = "index.js", commands = "npm install", ignored = [], verbose = false } = options;
    
    const { InputFile } = await import("node-appwrite/file");
    const { create: createTarball } = await import("tar");

    const tarPath = join(process.cwd(), `function-${functionId}-${Date.now()}.tar.gz`);

    try {
      if (verbose) {
        console.log(chalk.blue("Creating deployment archive..."));
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
              console.log(chalk.gray(`  Ignoring: ${path}`));
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
        console.log(chalk.blue("Uploading deployment..."));
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