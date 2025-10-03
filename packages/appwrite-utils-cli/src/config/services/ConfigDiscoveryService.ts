import fs from "fs";
import path from "path";
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
 * Search Priority:
 * 1. YAML configs (.appwrite/config.yaml, .appwrite/config.yml, etc.)
 * 2. TypeScript configs (appwriteConfig.ts)
 * 3. JSON configs (appwrite.json, appwrite.config.json)
 *
 * Features:
 * - Searches up directory tree (max 5 levels)
 * - Ignores common directories (node_modules, .git, etc.)
 * - Discovers both collections/ and tables/ directories
 * - Recursive subdirectory scanning for .appwrite folders
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
   * TypeScript configuration file names to search for
   */
  private readonly TS_FILENAMES = ["appwriteConfig.ts"];

  /**
   * JSON configuration file names to search for
   */
  private readonly JSON_FILENAMES = ["appwrite.json", "appwrite.config.json"];

  /**
   * Maximum levels to search up the directory tree
   */
  private readonly MAX_SEARCH_DEPTH = 5;

  /**
   * Finds any configuration file with priority: YAML → TypeScript → JSON
   * @param startDir The directory to start searching from
   * @returns Path to the configuration file or null if not found
   */
  public findConfig(startDir: string): string | null {
    // Try YAML first (highest priority)
    const yamlConfig = this.findYamlConfig(startDir);
    if (yamlConfig) {
      return yamlConfig;
    }

    // Try TypeScript second
    const tsConfig = this.findTypeScriptConfig(startDir);
    if (tsConfig) {
      return tsConfig;
    }

    // Try JSON last (lowest priority)
    const jsonConfig = this.findProjectConfig(startDir);
    if (jsonConfig) {
      return jsonConfig;
    }

    return null;
  }

  /**
   * Finds YAML configuration files
   * Searches current directory, subdirectories, and parent directory
   * @param startDir The directory to start searching from
   * @returns Path to the YAML config file or null if not found
   */
  public findYamlConfig(startDir: string): string | null {
    // First check current directory for YAML configs
    for (const fileName of this.YAML_FILENAMES) {
      const configPath = path.join(startDir, fileName);
      if (fs.existsSync(configPath)) {
        return configPath;
      }
    }

    // Recursively search subdirectories for .appwrite folders
    const yamlConfigInSubdirs = this.findYamlConfigRecursive(startDir);
    if (yamlConfigInSubdirs) {
      return yamlConfigInSubdirs;
    }

    // Check one level up to avoid infinite traversal
    const parentDir = path.dirname(startDir);
    if (parentDir !== startDir && path.basename(parentDir) !== "node_modules") {
      for (const fileName of this.YAML_FILENAMES) {
        const configPath = path.join(parentDir, fileName);
        if (fs.existsSync(configPath)) {
          return configPath;
        }
      }
    }

    return null;
  }

  /**
   * Recursively searches for YAML configs in .appwrite subdirectories
   * @param dir The directory to search
   * @param depth Current search depth
   * @returns Path to YAML config or null
   */
  private findYamlConfigRecursive(dir: string, depth: number = 0): string | null {
    // Limit search depth to prevent infinite recursion
    if (depth > this.MAX_SEARCH_DEPTH) {
      return null;
    }

    if (shouldIgnoreDirectory(path.basename(dir))) {
      return null;
    }

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && !shouldIgnoreDirectory(entry.name)) {
          const fullPath = path.join(dir, entry.name);

          // Check if this is an .appwrite directory
          if (entry.name === ".appwrite") {
            const configPaths = [
              path.join(fullPath, "config.yaml"),
              path.join(fullPath, "config.yml"),
              path.join(fullPath, "appwriteConfig.yaml"),
              path.join(fullPath, "appwriteConfig.yml"),
            ];

            for (const configPath of configPaths) {
              if (fs.existsSync(configPath)) {
                return configPath;
              }
            }
          }

          // Recurse into other directories with increased depth
          const result = this.findYamlConfigRecursive(fullPath, depth + 1);
          if (result) return result;
        }
      }
    } catch (error) {
      // Ignore directory access errors
    }

    return null;
  }

  /**
   * Finds TypeScript configuration files (appwriteConfig.ts)
   * @param startDir The directory to start searching from
   * @returns Path to the TypeScript config file or null if not found
   */
  public findTypeScriptConfig(startDir: string): string | null {
    return this.findTypeScriptConfigRecursive(startDir);
  }

  /**
   * Recursively searches for TypeScript configuration files
   * @param dir The directory to search
   * @param depth Current search depth
   * @returns Path to TypeScript config or null
   */
  private findTypeScriptConfigRecursive(dir: string, depth: number = 0): string | null {
    // Limit search depth to prevent infinite recursion
    if (depth > 10) {
      return null;
    }

    if (shouldIgnoreDirectory(path.basename(dir))) {
      return null;
    }

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      // First check current directory for appwriteConfig.ts
      for (const entry of entries) {
        if (entry.isFile() && this.TS_FILENAMES.includes(entry.name)) {
          return path.join(dir, entry.name);
        }
      }

      // Then search subdirectories
      for (const entry of entries) {
        if (entry.isDirectory() && !shouldIgnoreDirectory(entry.name)) {
          const result = this.findTypeScriptConfigRecursive(
            path.join(dir, entry.name),
            depth + 1
          );
          if (result) return result;
        }
      }
    } catch (error) {
      // Ignore directory access errors
    }

    return null;
  }

  /**
   * Finds project configuration JSON files (appwrite.json, appwrite.config.json)
   * Searches up to 5 levels up the directory tree
   * @param startDir The directory to start searching from
   * @returns Path to the JSON config file or null if not found
   */
  public findProjectConfig(startDir: string = process.cwd()): string | null {
    let currentDir = startDir;

    // Search up to MAX_SEARCH_DEPTH levels up the directory tree
    for (let i = 0; i < this.MAX_SEARCH_DEPTH; i++) {
      for (const configName of this.JSON_FILENAMES) {
        const configPath = path.join(currentDir, configName);
        if (fs.existsSync(configPath)) {
          return configPath;
        }
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break; // Reached filesystem root
      }
      currentDir = parentDir;
    }

    return null;
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
  public findAppwriteDirectory(startDir: string): string | null {
    let currentDir = startDir;

    // Search up to MAX_SEARCH_DEPTH levels up the directory tree
    for (let i = 0; i < this.MAX_SEARCH_DEPTH; i++) {
      const appwriteDir = path.join(currentDir, ".appwrite");
      if (fs.existsSync(appwriteDir) && fs.statSync(appwriteDir).isDirectory()) {
        return appwriteDir;
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break; // Reached filesystem root
      }
      currentDir = parentDir;
    }

    return null;
  }

  /**
   * Finds the functions directory
   * @param startDir The directory to start searching from
   * @returns Path to functions directory or null if not found
   */
  public findFunctionsDirectory(startDir: string): string | null {
    return this.findFunctionsDirectoryRecursive(startDir);
  }

  /**
   * Recursively searches for the functions directory
   * @param dir The directory to search
   * @param depth Current search depth
   * @returns Path to functions directory or null
   */
  private findFunctionsDirectoryRecursive(dir: string, depth: number = 0): string | null {
    // Limit search depth to prevent infinite recursion
    if (depth > this.MAX_SEARCH_DEPTH) {
      return null;
    }

    if (shouldIgnoreDirectory(path.basename(dir))) {
      return null;
    }

    try {
      const files = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of files) {
        if (!entry.isDirectory() || shouldIgnoreDirectory(entry.name)) {
          continue;
        }

        if (entry.name === "functions") {
          return path.join(dir, entry.name);
        }

        const result = this.findFunctionsDirectoryRecursive(
          path.join(dir, entry.name),
          depth + 1
        );
        if (result) return result;
      }
    } catch (error) {
      // Ignore directory access errors
    }

    return null;
  }

  /**
   * Gets a summary of all discoverable configuration files
   * Useful for debugging configuration issues
   * @param startDir The directory to start searching from
   * @returns Object containing paths to all discovered config types
   */
  public getConfigurationSummary(startDir: string): {
    yaml: string | null;
    typescript: string | null;
    json: string | null;
    appwriteDirectory: string | null;
    functionsDirectory: string | null;
    selectedConfig: string | null;
  } {
    return {
      yaml: this.findYamlConfig(startDir),
      typescript: this.findTypeScriptConfig(startDir),
      json: this.findProjectConfig(startDir),
      appwriteDirectory: this.findAppwriteDirectory(startDir),
      functionsDirectory: this.findFunctionsDirectory(startDir),
      selectedConfig: this.findConfig(startDir),
    };
  }
}
