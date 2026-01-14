import fs from "fs";
import path from "path";
import { findUp } from "find-up";
import { MessageFormatter } from "../../shared/messageFormatter.js";
import { shouldIgnoreDirectory } from "../../utils/directoryUtils.js";

/**
 * Result of discovering configuration files or collections/tables
 */
export interface DiscoveryResult {
  found: boolean;
  path?: string;
  type: "yaml" | "typescript" | "json" | "none";
  files?: string[];
}

/**
 * Service for discovering Appwrite configuration files and collection/table definitions.
 *
 * Uses find-up for intelligent searching with git repository boundary detection:
 * 1. Finds .git directory to establish repo root boundary
 * 2. Searches UP from current directory to repo root
 * 3. Searches DOWN recursively within repo root
 *
 * Search Priority:
 * 1. YAML configs (.appwrite/config.yaml, .appwrite/config.yml, etc.)
 * 2. JSON configs (appwrite.config.json, appwrite.json)
 * 3. TypeScript configs (appwriteConfig.ts)
 */
export class ConfigDiscoveryService {
  /**
   * YAML configuration file names to search for
   */
  private readonly YAML_FILENAMES = [
    ".appwrite/config.yaml",
    ".appwrite/config.yml",
    ".appwrite/appwriteConfig.yaml",
    ".appwrite/appwriteConfig.yml",
    "appwrite.yaml",
    "appwrite.yml",
  ];

  /**
   * JSON configuration file names to search for
   */
  private readonly JSON_FILENAMES = ["appwrite.config.json", "appwrite.json"];

  /**
   * TypeScript configuration file names to search for
   */
  private readonly TS_FILENAMES = ["appwriteConfig.ts"];

  /**
   * Finds the git repository root directory
   * @param startDir The directory to start searching from
   * @returns Path to the repository root, or startDir if no .git found
   */
  private async findRepoRoot(startDir: string): Promise<string> {
    const gitDir = await findUp(".git", {
      cwd: startDir,
      type: "directory",
    });

    return gitDir ? path.dirname(gitDir) : startDir;
  }

  /**
   * Recursively searches downward for files matching patterns
   * @param dir Directory to search in
   * @param patterns File patterns to match
   * @param maxDepth Maximum depth to search
   * @param currentDepth Current recursion depth
   * @returns First matching file path or null
   */
  private async searchDownward(
    dir: string,
    patterns: string[],
    maxDepth: number = 5,
    currentDepth: number = 0
  ): Promise<string | null> {
    if (currentDepth > maxDepth) return null;
    if (shouldIgnoreDirectory(path.basename(dir))) return null;

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      // Check current directory for matches
      for (const pattern of patterns) {
        const fullPath = path.join(dir, pattern);
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }

      // Recurse into subdirectories
      for (const entry of entries) {
        if (entry.isDirectory() && !shouldIgnoreDirectory(entry.name)) {
          const result = await this.searchDownward(
            path.join(dir, entry.name),
            patterns,
            maxDepth,
            currentDepth + 1
          );
          if (result) return result;
        }
      }
    } catch (error) {
      // Ignore permission errors
    }

    return null;
  }

  /**
   * Finds any configuration file with configurable priority
   * @param startDir The directory to start searching from
   * @param preferJson If true, prioritizes appwrite.config.json over YAML (default: false)
   * @returns Path to the configuration file or null if not found
   *
   * Default priority: YAML → JSON → TypeScript
   * With preferJson=true: JSON → YAML → TypeScript
   */
  public async findConfig(startDir: string, preferJson: boolean = false): Promise<string | null> {
    // Find repo root to establish boundary
    const repoRoot = await this.findRepoRoot(startDir);

    if (preferJson) {
      // Try JSON first when --appwrite-config flag is used
      const jsonConfig = await this.findProjectConfig(startDir, repoRoot);
      if (jsonConfig) return jsonConfig;

      // Try YAML second
      const yamlConfig = await this.findYamlConfig(startDir, repoRoot);
      if (yamlConfig) return yamlConfig;

      // Try TypeScript last (lowest priority)
      const tsConfig = await this.findTypeScriptConfig(startDir, repoRoot);
      if (tsConfig) return tsConfig;
    } else {
      // Default priority: YAML → JSON → TypeScript
      const yamlConfig = await this.findYamlConfig(startDir, repoRoot);
      if (yamlConfig) return yamlConfig;

      const jsonConfig = await this.findProjectConfig(startDir, repoRoot);
      if (jsonConfig) return jsonConfig;

      const tsConfig = await this.findTypeScriptConfig(startDir, repoRoot);
      if (tsConfig) return tsConfig;
    }

    return null;
  }

  /**
   * Finds YAML configuration files
   * Searches UP to repo root, then DOWN from repo root
   * @param startDir The directory to start searching from
   * @param repoRoot The repository root boundary
   * @returns Path to the YAML config file or null if not found
   */
  public async findYamlConfig(
    startDir: string,
    repoRoot?: string
  ): Promise<string | null> {
    const boundary = repoRoot || (await this.findRepoRoot(startDir));

    // Search UP to repo root
    const upwardResult = await findUp(this.YAML_FILENAMES, {
      cwd: startDir,
      stopAt: boundary,
    });

    if (upwardResult) return upwardResult;

    // Search DOWN from repo root
    return await this.searchDownward(boundary, this.YAML_FILENAMES);
  }

  /**
   * Finds JSON project configuration files (appwrite.config.json, appwrite.json)
   * @param startDir The directory to start searching from
   * @param repoRoot The repository root boundary
   * @returns Path to the JSON config file or null if not found
   */
  public async findProjectConfig(
    startDir: string,
    repoRoot?: string
  ): Promise<string | null> {
    const boundary = repoRoot || (await this.findRepoRoot(startDir));

    // Search UP to repo root
    const upwardResult = await findUp(this.JSON_FILENAMES, {
      cwd: startDir,
      stopAt: boundary,
    });

    if (upwardResult) return upwardResult;

    // Search DOWN from repo root
    return await this.searchDownward(boundary, this.JSON_FILENAMES);
  }

  /**
   * Finds TypeScript configuration files (appwriteConfig.ts)
   * @param startDir The directory to start searching from
   * @param repoRoot The repository root boundary
   * @returns Path to the TypeScript config file or null if not found
   */
  public async findTypeScriptConfig(
    startDir: string,
    repoRoot?: string
  ): Promise<string | null> {
    const boundary = repoRoot || (await this.findRepoRoot(startDir));

    // Search UP to repo root
    const upwardResult = await findUp(this.TS_FILENAMES, {
      cwd: startDir,
      stopAt: boundary,
    });

    if (upwardResult) return upwardResult;

    // Search DOWN from repo root
    return await this.searchDownward(boundary, this.TS_FILENAMES);
  }

  /**
   * Discovers collection YAML files in a collections/ directory
   * @param collectionsDir Path to the collections directory
   * @returns Discovery result with file paths
   */
  public async discoverCollections(collectionsDir: string): Promise<DiscoveryResult> {
    if (!fs.existsSync(collectionsDir)) {
      return {
        found: false,
        type: "none",
        files: [],
      };
    }

    try {
      const files = fs.readdirSync(collectionsDir);
      const collectionFiles = files.filter(
        (file) =>
          (file.endsWith(".yaml") ||
            file.endsWith(".yml") ||
            file.endsWith(".ts")) &&
          file !== "index.ts"
      );

      if (collectionFiles.length === 0) {
        return {
          found: false,
          type: "none",
          files: [],
        };
      }

      MessageFormatter.success(
        `Discovered ${collectionFiles.length} collection file(s) in ${collectionsDir}`,
        { prefix: "Discovery" }
      );

      return {
        found: true,
        path: collectionsDir,
        type: "yaml",
        files: collectionFiles,
      };
    } catch (error) {
      MessageFormatter.error(
        `Error discovering collections in ${collectionsDir}`,
        error instanceof Error ? error : undefined,
        { prefix: "Discovery" }
      );
      return {
        found: false,
        type: "none",
        files: [],
      };
    }
  }

  /**
   * Discovers table YAML files in a tables/ directory
   * @param tablesDir Path to the tables directory
   * @returns Discovery result with file paths
   */
  public async discoverTables(tablesDir: string): Promise<DiscoveryResult> {
    if (!fs.existsSync(tablesDir)) {
      return {
        found: false,
        type: "none",
        files: [],
      };
    }

    try {
      const files = fs.readdirSync(tablesDir);
      const tableFiles = files.filter(
        (file) =>
          (file.endsWith(".yaml") ||
            file.endsWith(".yml") ||
            file.endsWith(".ts")) &&
          file !== "index.ts"
      );

      if (tableFiles.length === 0) {
        return {
          found: false,
          type: "none",
          files: [],
        };
      }

      MessageFormatter.success(
        `Discovered ${tableFiles.length} table file(s) in ${tablesDir}`,
        { prefix: "Discovery" }
      );

      return {
        found: true,
        path: tablesDir,
        type: "yaml",
        files: tableFiles,
      };
    } catch (error) {
      MessageFormatter.error(
        `Error discovering tables in ${tablesDir}`,
        error instanceof Error ? error : undefined,
        { prefix: "Discovery" }
      );
      return {
        found: false,
        type: "none",
        files: [],
      };
    }
  }

  /**
   * Finds the .appwrite configuration directory
   * @param startDir The directory to start searching from
   * @returns Path to .appwrite directory or null if not found
   */
  public async findAppwriteDirectory(startDir: string): Promise<string | null> {
    const repoRoot = await this.findRepoRoot(startDir);

    // Search UP to repo root
    const upwardResult = await findUp(".appwrite", {
      cwd: startDir,
      type: "directory",
      stopAt: repoRoot,
    });

    if (upwardResult) return upwardResult;

    // Search DOWN from repo root
    return await this.searchDownward(repoRoot, [".appwrite"]);
  }

  /**
   * Finds the functions directory
   * @param startDir The directory to start searching from
   * @returns Path to functions directory or null if not found
   */
  public async findFunctionsDirectory(startDir: string): Promise<string | null> {
    const repoRoot = await this.findRepoRoot(startDir);

    // Search UP to repo root
    const upwardResult = await findUp("functions", {
      cwd: startDir,
      type: "directory",
      stopAt: repoRoot,
    });

    if (upwardResult) return upwardResult;

    // Search DOWN from repo root
    return await this.searchDownward(repoRoot, ["functions"]);
  }

  /**
   * Gets a summary of all discoverable configuration files
   * Useful for debugging configuration issues
   * @param startDir The directory to start searching from
   * @returns Object containing paths to all discovered config types
   */
  public async getConfigurationSummary(startDir: string): Promise<{
    yaml: string | null;
    typescript: string | null;
    json: string | null;
    appwriteDirectory: string | null;
    functionsDirectory: string | null;
    selectedConfig: string | null;
    repoRoot: string;
  }> {
    const repoRoot = await this.findRepoRoot(startDir);

    return {
      yaml: await this.findYamlConfig(startDir, repoRoot),
      typescript: await this.findTypeScriptConfig(startDir, repoRoot),
      json: await this.findProjectConfig(startDir, repoRoot),
      appwriteDirectory: await this.findAppwriteDirectory(startDir),
      functionsDirectory: await this.findFunctionsDirectory(startDir),
      selectedConfig: await this.findConfig(startDir),
      repoRoot,
    };
  }
}
