import fs from "fs";
import path from "path";
import { resolve as resolvePath, dirname, isAbsolute } from "node:path";
import yaml from "js-yaml";
import { register } from "tsx/esm/api";
import { pathToFileURL } from "node:url";
import type { AppwriteConfig, Collection, CollectionCreate } from "appwrite-utils";
import { MessageFormatter } from "../../shared/messageFormatter.js";
import { normalizeYamlData } from "../../utils/yamlConverter.js";
import { loadYamlConfig, type YamlSessionOptions } from "../yamlConfig.js";
import {
  loadAppwriteProjectConfig,
  projectConfigToAppwriteConfig,
  getCollectionsFromProject,
  type AppwriteProjectConfig
} from "../../paths/projectConfig.js";
import {
  loadYamlCollection,
  loadYamlTable,
  type CollectionDiscoveryResult,
  type TableDiscoveryResult,
} from "../../utils/configDiscovery.js";
import { expandTildePath } from "../../paths/pathResolution.js";

/**
 * Options for loading collections or tables
 */
export interface CollectionLoadOptions {
  /**
   * Whether to mark loaded items as coming from tables directory
   */
  markAsTablesDir?: boolean;
  /**
   * Set of existing collection names to check for conflicts
   */
  existingNames?: Set<string>;
}

/**
 * Service for loading and parsing Appwrite configuration files.
 *
 * Supports:
 * - YAML configuration files (.appwrite/config.yaml)
 * - TypeScript configuration files (appwriteConfig.ts)
 * - JSON project configuration files (appwrite.json)
 * - Collection and table YAML/TypeScript definitions
 *
 * Features:
 * - Auto-detects configuration file type
 * - Converts between different configuration formats
 * - Loads collections and tables from directories
 * - Handles session preservation
 * - Validates and normalizes configuration data
 */
export class ConfigLoaderService {
  /**
   * Normalizes function dirPath to absolute path
   * @param func Function configuration object
   * @param configDir Directory containing the config file
   * @returns Function with normalized dirPath
   */
  private normalizeFunctionPath(func: any, configDir: string): any {
    if (!func.dirPath) {
      return func;
    }

    // Expand tilde first
    const expandedPath = expandTildePath(func.dirPath);

    // If already absolute, return as-is
    if (isAbsolute(expandedPath)) {
      return {
        ...func,
        dirPath: expandedPath
      };
    }

    // Resolve relative to config directory
    return {
      ...func,
      dirPath: resolvePath(configDir, expandedPath)
    };
  }

  /**
   * Loads configuration from a discovered path, auto-detecting the type
   * @param configPath Path to the configuration file
   * @param sessionOptions Optional session preservation options
   * @returns Parsed AppwriteConfig
   */
  public async loadFromPath(
    configPath: string,
    sessionOptions?: YamlSessionOptions
  ): Promise<AppwriteConfig> {
    const ext = path.extname(configPath).toLowerCase();

    // Determine file type and load accordingly
    if (ext === ".yaml" || ext === ".yml") {
      return this.loadYaml(configPath, sessionOptions);
    } else if (ext === ".ts") {
      return this.loadTypeScript(configPath);
    } else if (ext === ".json") {
      const partialConfig = await this.loadProjectConfig(configPath);

      // Convert partial config to full AppwriteConfig with sensible defaults
      if (!partialConfig.appwriteEndpoint || !partialConfig.appwriteProject) {
        throw new Error(
          "JSON project config must contain at minimum 'endpoint' and 'projectId' fields"
        );
      }

      const configDir = path.dirname(configPath);

      // Normalize function paths
      const normalizedFunctions = partialConfig.functions
        ? partialConfig.functions.map(func => this.normalizeFunctionPath(func, configDir))
        : [];

      return {
        appwriteEndpoint: partialConfig.appwriteEndpoint,
        appwriteProject: partialConfig.appwriteProject,
        appwriteKey: partialConfig.appwriteKey || "",
        apiMode: partialConfig.apiMode || "auto",
        appwriteClient: null,
        logging: partialConfig.logging || {
          enabled: false,
          level: "info",
          console: false,
        },
        enableBackups: partialConfig.enableBackups ?? true,
        backupInterval: partialConfig.backupInterval || 3600,
        backupRetention: partialConfig.backupRetention || 30,
        enableBackupCleanup: partialConfig.enableBackupCleanup ?? true,
        enableMockData: partialConfig.enableMockData || false,
        documentBucketId: partialConfig.documentBucketId || "documents",
        usersCollectionName: partialConfig.usersCollectionName || "Members",
        schemaConfig: partialConfig.schemaConfig || {
          outputDirectory: "schemas",
          yamlSchemaDirectory: ".yaml_schemas",
          importDirectory: "importData",
          collectionsDirectory: "collections",
          tablesDirectory: "tables",
        },
        databases: partialConfig.databases || [],
        buckets: partialConfig.buckets || [],
        functions: normalizedFunctions,
        collections: partialConfig.collections || [],
        sessionCookie: partialConfig.sessionCookie,
        authMethod: partialConfig.authMethod || "auto",
        sessionMetadata: partialConfig.sessionMetadata,
      };
    }

    throw new Error(`Unsupported configuration file type: ${ext}`);
  }

  /**
   * Loads a YAML configuration file
   * @param yamlPath Path to the YAML config file
   * @param sessionOptions Optional session preservation options
   * @returns Parsed AppwriteConfig
   */
  public async loadYaml(
    yamlPath: string,
    sessionOptions?: YamlSessionOptions
  ): Promise<AppwriteConfig> {
    if (!fs.existsSync(yamlPath)) {
      throw new Error(`YAML config file not found: ${yamlPath}`);
    }

    try {
      const config = await loadYamlConfig(yamlPath);

      if (!config) {
        throw new Error(`Failed to load YAML config from: ${yamlPath}`);
      }

      // Apply session preservation if provided
      if (sessionOptions) {
        if (sessionOptions.sessionCookie) {
          config.sessionCookie = sessionOptions.sessionCookie;
        }
        if (sessionOptions.authMethod) {
          config.authMethod = sessionOptions.authMethod;
        }
        if (sessionOptions.sessionMetadata) {
          config.sessionMetadata = {
            ...config.sessionMetadata,
            ...sessionOptions.sessionMetadata,
          };
        }
      }

      // Load collections and tables from their respective directories
      const configDir = path.dirname(yamlPath);

      // Normalize function paths
      if (config.functions) {
        config.functions = config.functions.map(func =>
          this.normalizeFunctionPath(func, configDir)
        );
      }
      const collectionsDir = path.join(configDir, config.schemaConfig?.collectionsDirectory || "collections");
      const tablesDir = path.join(configDir, config.schemaConfig?.tablesDirectory || "tables");

      // Detect API mode to determine priority order
      let apiMode: 'legacy' | 'tablesdb' = 'legacy';
      try {
        const { detectAppwriteVersionCached } = await import('../../utils/versionDetection.js');
        const detection = await detectAppwriteVersionCached(
          config.appwriteEndpoint,
          config.appwriteProject,
          config.appwriteKey
        );
        apiMode = detection.apiMode;
      } catch {
        // Fallback to legacy if detection fails
      }

      // Load with correct priority based on API mode
      const { items, conflicts, fromCollections, fromTables } = apiMode === 'tablesdb'
        ? await this.loadTablesFirst(tablesDir, collectionsDir)
        : await this.loadCollectionsAndTables(collectionsDir, tablesDir);

      config.collections = items;

      // Report what was loaded
      if (fromTables > 0 && fromCollections > 0) {
        MessageFormatter.success(
          `Loaded ${items.length} total items: ${fromCollections} from collections/, ${fromTables} from tables/`,
          { prefix: "Config" }
        );
      } else if (fromCollections > 0) {
        MessageFormatter.success(
          `Loaded ${fromCollections} collections from collections/`,
          { prefix: "Config" }
        );
      } else if (fromTables > 0) {
        MessageFormatter.success(
          `Loaded ${fromTables} tables from tables/`,
          { prefix: "Config" }
        );
      } else {
        // Zero items loaded from BOTH directories — almost always a path
        // misconfiguration (e.g. user set `schemas.tablesDirectory: appwrite/tables`
        // while their config.yaml is already inside `appwrite/`, producing a
        // doubled path that doesn't exist). Give the AI agent and the human
        // everything they need to fix it in one log block.
        const tablesDirRaw = config.schemaConfig?.tablesDirectory || "tables";
        const collectionsDirRaw = config.schemaConfig?.collectionsDirectory || "collections";
        const tablesExists = fs.existsSync(tablesDir);
        const collectionsExists = fs.existsSync(collectionsDir);
        const dirState = (abs: string, exists: boolean) => {
          if (!exists) return "does not exist";
          try {
            const entries = fs.readdirSync(abs).filter(f =>
              f.endsWith(".yaml") || f.endsWith(".yml") || f.endsWith(".ts")
            );
            return `exists, ${entries.length} schema file(s)`;
          } catch {
            return "exists, unreadable";
          }
        };
        MessageFormatter.warning(
          [
            `No tables or collections loaded from disk — push/pull will have nothing to operate on.`,
            `  Config file:        ${yamlPath}`,
            `  Resolved tables:    ${tablesDir}  (${dirState(tablesDir, tablesExists)})`,
            `    schemas.tablesDirectory in config: "${tablesDirRaw}"`,
            `  Resolved collections: ${collectionsDir}  (${dirState(collectionsDir, collectionsExists)})`,
            `    schemas.collectionsDirectory in config: "${collectionsDirRaw}"`,
            `  Hint: schemas.* paths are resolved relative to the CONFIG FILE'S directory (${configDir}), not the repo root.`,
            `        If your YAML schemas live at "${path.join(configDir, "tables")}", set schemas.tablesDirectory to "tables" (NOT "appwrite/tables").`,
          ].join("\n"),
          { prefix: "Config" }
        );
      }

      // Report conflicts
      if (conflicts.length > 0) {
        MessageFormatter.warning(
          `Found ${conflicts.length} naming conflicts`,
          { prefix: "Config" }
        );
        conflicts.forEach(conflict => {
          MessageFormatter.info(
            `  - '${conflict.name}': ${conflict.source1} (used) vs ${conflict.source2} (skipped)`,
            { prefix: "Config" }
          );
        });
      }

      MessageFormatter.success(`Loaded YAML config from: ${yamlPath}`, {
        prefix: "Config",
      });

      return config;
    } catch (error) {
      MessageFormatter.error(
        `Error loading YAML config from ${yamlPath}`,
        error instanceof Error ? error : undefined,
        { prefix: "Config" }
      );
      throw error;
    }
  }

  /**
   * Loads a TypeScript configuration file
   * @param tsPath Path to the TypeScript config file
   * @returns Parsed AppwriteConfig
   */
  public async loadTypeScript(tsPath: string): Promise<AppwriteConfig> {
    if (!fs.existsSync(tsPath)) {
      throw new Error(`TypeScript config file not found: ${tsPath}`);
    }

    const unregister = register(); // Register tsx enhancement

    try {
      const configUrl = pathToFileURL(tsPath).href;
      const configModule = await import(configUrl);
      const config: AppwriteConfig =
        configModule.default?.default || configModule.default || configModule;

      if (!config) {
        throw new Error(`Failed to load TypeScript config from: ${tsPath}`);
      }

      // Normalize function paths
      const configDir = path.dirname(tsPath);
      if (config.functions) {
        config.functions = config.functions.map(func =>
          this.normalizeFunctionPath(func, configDir)
        );
      }

      MessageFormatter.success(`Loaded TypeScript config from: ${tsPath}`, {
        prefix: "Config",
      });

      return config;
    } catch (error) {
      MessageFormatter.error(
        `Error loading TypeScript config from ${tsPath}`,
        error instanceof Error ? error : undefined,
        { prefix: "Config" }
      );
      throw error;
    } finally {
      unregister(); // Unregister tsx when done
    }
  }

  /**
   * Loads an appwrite.json project configuration file
   * Converts projectId → appwriteProject and detects API mode
   * @param jsonPath Path to the JSON config file
   * @returns Partial AppwriteConfig (requires merging with defaults)
   */
  public async loadProjectConfig(jsonPath: string): Promise<Partial<AppwriteConfig>> {
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`JSON config file not found: ${jsonPath}`);
    }

    try {
      const projectConfig = loadAppwriteProjectConfig(jsonPath);

      if (!projectConfig) {
        throw new Error(`Failed to load project config from: ${jsonPath}`);
      }

      // Convert project config to AppwriteConfig format (includes function path normalization)
      const appwriteConfig = projectConfigToAppwriteConfig(projectConfig, jsonPath);

      // Get collections from project config
      const collections = getCollectionsFromProject(projectConfig);
      if (collections.length > 0) {
        appwriteConfig.collections = collections;
      }

      MessageFormatter.success(`Loaded project config from: ${jsonPath}`, {
        prefix: "Config",
      });

      return appwriteConfig;
    } catch (error) {
      MessageFormatter.error(
        `Error loading project config from ${jsonPath}`,
        error instanceof Error ? error : undefined,
        { prefix: "Config" }
      );
      throw error;
    }
  }

  /**
   * Loads all collections from a collections/ directory
   * Supports both YAML (.yaml, .yml) and TypeScript (.ts) files
   * @param collectionsDir Path to the collections directory
   * @param options Loading options
   * @returns Array of loaded Collection objects
   */
  public async loadCollections(
    collectionsDir: string,
    options: CollectionLoadOptions = {}
  ): Promise<Collection[]> {
    if (!fs.existsSync(collectionsDir)) {
      MessageFormatter.debug(
        `Collections directory not found: ${collectionsDir}`,
        { prefix: "Config" }
      );
      return [];
    }

    const collections: Collection[] = [];
    const unregister = register(); // Register tsx for TypeScript collections

    try {
      const collectionFiles = fs.readdirSync(collectionsDir);
      MessageFormatter.success(
        `Loading from collections directory: ${collectionFiles.length} files found`,
        { prefix: "Config" }
      );

      for (const file of collectionFiles) {
        if (file === "index.ts") {
          continue;
        }

        const filePath = path.join(collectionsDir, file);
        let collection: CollectionCreate | null = null;

        // Handle YAML collections
        if (file.endsWith(".yaml") || file.endsWith(".yml")) {
          collection = loadYamlCollection(filePath);
        }

        // Handle TypeScript collections
        else if (file.endsWith(".ts")) {
          try {
            const fileUrl = pathToFileURL(filePath).href;
            const collectionModule = await import(fileUrl);
            const importedCollection: Collection | undefined =
              collectionModule.default?.default ||
              collectionModule.default ||
              collectionModule;

            if (importedCollection) {
              collection = importedCollection as CollectionCreate;
              // Ensure importDefs are properly loaded
              if (collectionModule.importDefs || collection.importDefs) {
                collection.importDefs =
                  collectionModule.importDefs || collection.importDefs;
              }
            }
          } catch (error) {
            MessageFormatter.error(
              `Error loading TypeScript collection: ${file}`,
              error instanceof Error ? error : undefined,
              { prefix: "Config" }
            );
          }
        }

        if (collection) {
          const collectionName = collection.name || collection.$id || file;

          // Check for naming conflicts if existingNames provided
          if (options.existingNames?.has(collectionName)) {
            MessageFormatter.warning(
              `Skipping duplicate collection '${collectionName}' (already loaded)`,
              { prefix: "Config" }
            );
            continue;
          }

          // Mark as tables if requested
          if (options.markAsTablesDir) {
            (collection as any)._isFromTablesDir = true;
          }

          collections.push(collection as Collection);
        }
      }

      MessageFormatter.success(
        `Loaded ${collections.length} collection(s) from ${collectionsDir}`,
        { prefix: "Config" }
      );
    } catch (error) {
      MessageFormatter.error(
        `Error loading collections from ${collectionsDir}`,
        error instanceof Error ? error : undefined,
        { prefix: "Config" }
      );
    } finally {
      unregister(); // Unregister tsx when done
    }

    return collections;
  }

  /**
   * Loads all tables from a tables/ directory
   * Supports both YAML (.yaml, .yml) and TypeScript (.ts) files
   * @param tablesDir Path to the tables directory
   * @param options Loading options
   * @returns Array of loaded table objects
   */
  public async loadTables(
    tablesDir: string,
    options: CollectionLoadOptions = {}
  ): Promise<any[]> {
    if (!fs.existsSync(tablesDir)) {
      MessageFormatter.debug(`Tables directory not found: ${tablesDir}`, {
        prefix: "Config",
      });
      return [];
    }

    const tables: any[] = [];
    const unregister = register(); // Register tsx for TypeScript tables

    try {
      const tableFiles = fs.readdirSync(tablesDir);
      MessageFormatter.success(
        `Loading from tables directory: ${tableFiles.length} files found`,
        { prefix: "Config" }
      );

      for (const file of tableFiles) {
        if (file === "index.ts") {
          continue;
        }

        const filePath = path.join(tablesDir, file);
        let table: any | null = null;

        // Handle YAML tables
        if (file.endsWith(".yaml") || file.endsWith(".yml")) {
          table = loadYamlTable(filePath);
        }

        // Handle TypeScript tables
        else if (file.endsWith(".ts")) {
          try {
            const fileUrl = pathToFileURL(filePath).href;
            const tableModule = await import(fileUrl);
            const importedTable: any =
              tableModule.default?.default || tableModule.default || tableModule;

            if (importedTable) {
              table = importedTable;
              // Ensure importDefs are properly loaded
              if (tableModule.importDefs || table.importDefs) {
                table.importDefs = tableModule.importDefs || table.importDefs;
              }
            }
          } catch (error) {
            MessageFormatter.error(
              `Error loading TypeScript table: ${file}`,
              error instanceof Error ? error : undefined,
              { prefix: "Config" }
            );
          }
        }

        if (table) {
          const tableName = table.name || table.tableId || table.$id || file;

          // Check for naming conflicts if existingNames provided
          if (options.existingNames?.has(tableName)) {
            MessageFormatter.warning(
              `Skipping duplicate table '${tableName}' (already loaded from collections/)`,
              { prefix: "Config" }
            );
            continue;
          }

          // Always mark tables as coming from tables directory
          table._isFromTablesDir = true;

          tables.push(table);
        }
      }

      MessageFormatter.success(
        `Loaded ${tables.length} table(s) from ${tablesDir}`,
        { prefix: "Config" }
      );
    } catch (error) {
      MessageFormatter.error(
        `Error loading tables from ${tablesDir}`,
        error instanceof Error ? error : undefined,
        { prefix: "Config" }
      );
    } finally {
      unregister(); // Unregister tsx when done
    }

    return tables;
  }

  /**
   * Loads collections and tables with conflict detection
   * Collections take priority over tables when names conflict
   * @param collectionsDir Path to collections directory
   * @param tablesDir Path to tables directory
   * @returns Object containing combined arrays and conflict information
   */
  public async loadCollectionsAndTables(
    collectionsDir: string,
    tablesDir: string
  ): Promise<{
    items: Collection[];
    fromCollections: number;
    fromTables: number;
    conflicts: Array<{ name: string; source1: string; source2: string }>;
  }> {
    const items: Collection[] = [];
    const loadedNames = new Set<string>();
    const conflicts: Array<{ name: string; source1: string; source2: string }> = [];

    // Load from collections/ directory first (higher priority)
    if (fs.existsSync(collectionsDir)) {
      const collections = await this.loadCollections(collectionsDir);
      for (const collection of collections) {
        const name = collection.name || collection.$id || "";
        loadedNames.add(name);
        items.push(collection);
      }
    }

    // Load from tables/ directory second (lower priority, check for conflicts)
    if (fs.existsSync(tablesDir)) {
      const tables = await this.loadTables(tablesDir, {
        existingNames: loadedNames,
        markAsTablesDir: true,
      });

      for (const table of tables) {
        const name = table.name || table.tableId || table.$id || "";

        // Check for conflicts
        if (loadedNames.has(name)) {
          conflicts.push({
            name,
            source1: "collections/",
            source2: "tables/",
          });
        } else {
          loadedNames.add(name);
          items.push(table);
        }
      }
    }

    const fromCollections = items.filter((item: any) => !item._isFromTablesDir)
      .length;
    const fromTables = items.filter((item: any) => item._isFromTablesDir).length;

    return {
      items,
      fromCollections,
      fromTables,
      conflicts,
    };
  }

  /**
   * Loads tables first (higher priority), then collections (backward compatibility)
   * Used for TablesDB projects (>= 1.8.0)
   * @param tablesDir Path to the tables directory
   * @param collectionsDir Path to the collections directory
   * @returns Loading result with items, counts, and conflicts
   */
  public async loadTablesFirst(
    tablesDir: string,
    collectionsDir: string
  ): Promise<{
    items: Collection[];
    fromCollections: number;
    fromTables: number;
    conflicts: Array<{ name: string; source1: string; source2: string }>;
  }> {
    const items: Collection[] = [];
    const loadedNames = new Set<string>();
    const conflicts: Array<{ name: string; source1: string; source2: string }> = [];

    // Load from tables/ directory first (HIGHER priority for TablesDB)
    if (fs.existsSync(tablesDir)) {
      const tables = await this.loadTables(tablesDir, { markAsTablesDir: true });
      for (const table of tables) {
        const name = table.name || table.tableId || table.$id || "";
        loadedNames.add(name);
        items.push(table);
      }
    }

    // Load from collections/ directory second (LOWER priority, backward compatibility)
    if (fs.existsSync(collectionsDir)) {
      const collections = await this.loadCollections(collectionsDir);
      for (const collection of collections) {
        const name = collection.name || collection.$id || "";

        // Check for conflicts - tables win
        if (loadedNames.has(name)) {
          conflicts.push({
            name,
            source1: "tables/",
            source2: "collections/",
          });
        } else {
          loadedNames.add(name);
          items.push(collection);
        }
      }
    }

    const fromTables = items.filter((item: any) => item._isFromTablesDir).length;
    const fromCollections = items.filter((item: any) => !item._isFromTablesDir).length;

    return {
      items,
      fromCollections,
      fromTables,
      conflicts,
    };
  }

  /**
   * Validates that a configuration file can be loaded
   * @param configPath Path to the configuration file
   * @returns True if the file can be loaded, false otherwise
   */
  public canLoadConfig(configPath: string): boolean {
    if (!fs.existsSync(configPath)) {
      return false;
    }

    const ext = path.extname(configPath).toLowerCase();
    return ext === ".yaml" || ext === ".yml" || ext === ".ts" || ext === ".json";
  }

  /**
   * Gets the type of a configuration file
   * @param configPath Path to the configuration file
   * @returns Configuration type or null if unknown
   */
  public getConfigType(
    configPath: string
  ): "yaml" | "typescript" | "json" | null {
    const ext = path.extname(configPath).toLowerCase();

    if (ext === ".yaml" || ext === ".yml") {
      return "yaml";
    } else if (ext === ".ts") {
      return "typescript";
    } else if (ext === ".json") {
      return "json";
    }

    return null;
  }
}
