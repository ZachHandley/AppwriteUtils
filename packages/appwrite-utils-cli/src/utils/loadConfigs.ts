import path from "path";
import fs from "fs";
import { type AppwriteConfig, type Collection, type CollectionCreate, type Table, type TableCreate } from "appwrite-utils";
import { register } from "tsx/esm/api"; // Import the register function
import { pathToFileURL } from "node:url";
import chalk from "chalk";
import { findYamlConfig, loadYamlConfig, loadYamlConfigWithSession, extractSessionOptionsFromConfig, type YamlSessionOptions } from "../config/yamlConfig.js";
import { detectAppwriteVersionCached, fetchServerVersion, isVersionAtLeast } from "./versionDetection.js";
import { MessageFormatter } from "../shared/messageFormatter.js";
import { validateCollectionsTablesConfig, reportValidationResults, type ValidationResult } from "../config/configValidation.js";
import { resolveCollectionsDir, resolveTablesDir } from "./pathResolvers.js";
import {
  findAppwriteConfig,
  findAppwriteConfigTS,
  findFunctionsDir,
  discoverCollections,
  discoverTables,
  discoverLegacyDirectory
} from "./configDiscovery.js";

/**
 * Session authentication preservation options for config loading
 */
export interface SessionPreservationOptions {
  sessionCookie?: string;
  authMethod?: "session" | "apikey" | "auto";
  sessionMetadata?: {
    email?: string;
    expiresAt?: string;
  };
}

/**
 * Configuration loading options
 */
export interface ConfigLoadingOptions {
  validate?: boolean;
  strictMode?: boolean;
  reportValidation?: boolean;
  preserveAuth?: SessionPreservationOptions;
}

/**
 * Helper function to create session preservation options from session data
 * @param sessionCookie The session cookie string
 * @param email Optional email associated with the session
 * @param expiresAt Optional expiration timestamp
 * @returns SessionPreservationOptions object
 */
export function createSessionPreservation(
  sessionCookie: string,
  email?: string,
  expiresAt?: string
): SessionPreservationOptions {
  return {
    sessionCookie,
    authMethod: "session",
    sessionMetadata: {
      ...(email && { email }),
      ...(expiresAt && { expiresAt })
    }
  };
}

// Re-export config discovery functions for backward compatibility
export { findAppwriteConfig, findFunctionsDir } from "./configDiscovery.js";

/**
 * Loads the Appwrite configuration and returns both config and the path where it was found.
 * @param configDir The directory to search for config files.
 * @param options Loading options including validation settings and session preservation.
 * @returns Object containing the config, path, and validation results.
 */
export const loadConfigWithPath = async (
  configDir: string,
  options: ConfigLoadingOptions = {}
): Promise<{
  config: AppwriteConfig;
  actualConfigPath: string;
  validation?: ValidationResult;
}> => {
  const { validate = true, strictMode = false, reportValidation = true } = options;
  let config: AppwriteConfig | null = null;
  let actualConfigPath: string | null = null;

  // Convert session preservation options to YAML format
  const yamlSessionOptions: YamlSessionOptions | undefined = options.preserveAuth ? {
    sessionCookie: options.preserveAuth.sessionCookie,
    authMethod: options.preserveAuth.authMethod,
    sessionMetadata: options.preserveAuth.sessionMetadata,
  } : undefined;

  // Check if we're given the .appwrite directory directly
  if (configDir.endsWith('.appwrite')) {
    // Look for config files directly in this directory
    const possibleYamlFiles = ['config.yaml', 'config.yml', 'appwriteConfig.yaml', 'appwriteConfig.yml'];
    for (const fileName of possibleYamlFiles) {
      const yamlPath = path.join(configDir, fileName);
      if (fs.existsSync(yamlPath)) {
        config = yamlSessionOptions
          ? await loadYamlConfigWithSession(yamlPath, yamlSessionOptions)
          : await loadYamlConfig(yamlPath);
        actualConfigPath = yamlPath;
        break;
      }
    }
  } else {
    // Original logic: search for .appwrite directories
    const yamlConfigPath = findYamlConfig(configDir);
    if (yamlConfigPath) {
      config = yamlSessionOptions
        ? await loadYamlConfigWithSession(yamlConfigPath, yamlSessionOptions)
        : await loadYamlConfig(yamlConfigPath);
      actualConfigPath = yamlConfigPath;
    }
  }

  // Fall back to TypeScript config if YAML not found or failed to load
  if (!config) {
    const configPath = path.join(configDir, "appwriteConfig.ts");
    
    // Only try to load TypeScript config if the file exists
    if (fs.existsSync(configPath)) {
      const unregister = register(); // Register tsx enhancement

      try {
        const configUrl = pathToFileURL(configPath).href;
        const configModule = (await import(configUrl));
        config = configModule.default?.default || configModule.default || configModule;
        if (!config) {
          throw new Error("Failed to load config");
        }
        actualConfigPath = configPath;
      } finally {
        unregister(); // Unregister tsx when done
      }
    }
  }

  if (!config || !actualConfigPath) {
    throw new Error("No valid configuration found");
  }

  // Preserve session authentication if provided
  // This allows maintaining session context when config is reloaded during CLI operations
  if (options.preserveAuth) {
    const { sessionCookie, authMethod, sessionMetadata } = options.preserveAuth;

    // Inject session cookie into the loaded config
    if (sessionCookie) {
      config.sessionCookie = sessionCookie;
    }

    // Set or override authentication method preference
    if (authMethod) {
      config.authMethod = authMethod;
    }

    // Merge session metadata (email, expiration, etc.) with existing metadata
    if (sessionMetadata) {
      config.sessionMetadata = {
        ...config.sessionMetadata,
        ...sessionMetadata
      };
    }

    // Auto-detect authentication method if not explicitly provided
    // If we have a session cookie but no auth method specified, prefer session auth
    if (!authMethod && sessionCookie) {
      config.authMethod = "session";
    }
  }

  // Enhanced dual folder support: Load from BOTH collections/ AND tables/ directories
  const configFileDir = path.dirname(actualConfigPath);
  // Look for collections/tables directories in the same directory as the config file
  const collectionsDir = resolveCollectionsDir(configFileDir);
  const tablesDir = resolveTablesDir(configFileDir);

  // Initialize collections array
  config.collections = [];

  // Load from collections/ directory first (higher priority)
  const collectionsResult = await discoverCollections(collectionsDir);
  config.collections.push(...collectionsResult.collections);

  // Load from tables/ directory second (lower priority, check for conflicts)
  const tablesResult = await discoverTables(tablesDir, collectionsResult.loadedNames);
  config.collections.push(...tablesResult.tables);

  // Combine conflicts from both discovery operations
  const allConflicts = [...collectionsResult.conflicts, ...tablesResult.conflicts];

  // Report conflicts if any
  if (allConflicts.length > 0) {
    MessageFormatter.warning(`Found ${allConflicts.length} naming conflicts between collections/ and tables/`, { prefix: "Config" });
    allConflicts.forEach(conflict => {
      MessageFormatter.info(`  - '${conflict.name}': ${conflict.source1} (used) vs ${conflict.source2} (skipped)`, { prefix: "Config" });
    });
  }

  // Fallback: If neither directory exists, try legacy single-directory detection
  if (!fs.existsSync(collectionsDir) && !fs.existsSync(tablesDir)) {
    // Determine directory (collections or tables) based on server version / API mode
    let dirName: 'collections' | 'tables' = "collections";
    try {
      const det = await detectAppwriteVersionCached(config.appwriteEndpoint, config.appwriteProject, config.appwriteKey);
      if (det.apiMode === 'tablesdb' || isVersionAtLeast(det.serverVersion, '1.8.0')) {
        dirName = 'tables';
      } else {
        // Try health version if not provided
        const ver = await fetchServerVersion(config.appwriteEndpoint);
        if (isVersionAtLeast(ver || undefined, '1.8.0')) dirName = 'tables';
      }
    } catch {}

    const legacyItems = await discoverLegacyDirectory(configFileDir, dirName);
    config.collections.push(...legacyItems);
  }

  // Ensure array exists even if empty
  config.collections = config.collections || [];

  // Log the final result
  const allCollections = config.collections || [];
  const fromCollectionsDir = allCollections.filter((c: any) => !c._isFromTablesDir).length;
  const fromTablesDir = allCollections.filter((c: any) => c._isFromTablesDir).length;
  const totalLoaded = allCollections.length;

  if (totalLoaded > 0) {
    if (fromTablesDir > 0) {
      MessageFormatter.success(`Successfully loaded ${totalLoaded} items total: ${fromCollectionsDir} from collections/ and ${fromTablesDir} from tables/`, { prefix: "Config" });
    } else {
      MessageFormatter.success(`Successfully loaded ${totalLoaded} collections from collections/`, { prefix: "Config" });
    }
  }

  // Validate configuration if requested
  let validation: ValidationResult | undefined;
  if (validate) {
    validation = validateCollectionsTablesConfig(config);

    // In strict mode, treat warnings as errors
    if (strictMode && validation.warnings.length > 0) {
      const strictValidation = {
        ...validation,
        isValid: false,
        errors: [...validation.errors, ...validation.warnings.map(w => ({ ...w, severity: "error" as const }))],
        warnings: []
      };
      validation = strictValidation;
    }

    // Report validation results if requested
    if (reportValidation) {
      reportValidationResults(validation, { verbose: true });
    }

    // Throw error if validation fails in strict mode
    if (strictMode && !validation.isValid) {
      throw new Error(`Configuration validation failed in strict mode. Found ${validation.errors.length} validation errors.`);
    }
  }

  return { config, actualConfigPath, validation };
};

/**
 * Loads the Appwrite configuration and all collection configurations from a specified directory.
 * Supports both YAML and TypeScript config formats with backward compatibility.
 * @param configDir The directory containing the config file and collections folder.
 * @param options Loading options including validation settings and session preservation.
 * @returns The loaded Appwrite configuration including collections.
 */
export const loadConfig = async (
  configDir: string,
  options: ConfigLoadingOptions = {}
): Promise<AppwriteConfig> => {
  const { validate = false, strictMode = false, reportValidation = false } = options;
  let config: AppwriteConfig | null = null;
  let actualConfigPath: string | null = null;

  // Convert session preservation options to YAML format
  const yamlSessionOptions: YamlSessionOptions | undefined = options.preserveAuth ? {
    sessionCookie: options.preserveAuth.sessionCookie,
    authMethod: options.preserveAuth.authMethod,
    sessionMetadata: options.preserveAuth.sessionMetadata,
  } : undefined;

  // First try to find and load YAML config
  const yamlConfigPath = findYamlConfig(configDir);
  if (yamlConfigPath) {
    config = yamlSessionOptions
      ? await loadYamlConfigWithSession(yamlConfigPath, yamlSessionOptions)
      : await loadYamlConfig(yamlConfigPath);
    actualConfigPath = yamlConfigPath;
  }

  // Fall back to TypeScript config if YAML not found or failed to load
  if (!config) {
    const configPath = path.join(configDir, "appwriteConfig.ts");
    
    // Only try to load TypeScript config if the file exists
    if (fs.existsSync(configPath)) {
      const unregister = register(); // Register tsx enhancement

      try {
        const configUrl = pathToFileURL(configPath).href;
        const configModule = (await import(configUrl));
        config = configModule.default?.default || configModule.default || configModule;
        if (!config) {
          throw new Error("Failed to load config");
        }
        actualConfigPath = configPath;
      } finally {
        unregister(); // Unregister tsx when done
      }
    }
  }

  if (!config) {
    throw new Error("No valid configuration found");
  }

  // Preserve session authentication if provided
  // This allows maintaining session context when config is reloaded during CLI operations
  if (options.preserveAuth) {
    const { sessionCookie, authMethod, sessionMetadata } = options.preserveAuth;

    // Inject session cookie into the loaded config
    if (sessionCookie) {
      config.sessionCookie = sessionCookie;
    }

    // Set or override authentication method preference
    if (authMethod) {
      config.authMethod = authMethod;
    }

    // Merge session metadata (email, expiration, etc.) with existing metadata
    if (sessionMetadata) {
      config.sessionMetadata = {
        ...config.sessionMetadata,
        ...sessionMetadata
      };
    }

    // Auto-detect authentication method if not explicitly provided
    // If we have a session cookie but no auth method specified, prefer session auth
    if (!authMethod && sessionCookie) {
      config.authMethod = "session";
    }
  }

  // Enhanced dual folder support: Load from BOTH collections/ AND tables/ directories
  const configFileDir = actualConfigPath ? path.dirname(actualConfigPath) : configDir;
  // Look for collections/tables directories in the same directory as the config file
  const collectionsDir = resolveCollectionsDir(configFileDir);
  const tablesDir = resolveTablesDir(configFileDir);

  // Initialize collections array
  config.collections = [];

  // Load from collections/ directory first (higher priority)
  const collectionsResult = await discoverCollections(collectionsDir);
  config.collections.push(...collectionsResult.collections);

  // Load from tables/ directory second (lower priority, check for conflicts)
  const tablesResult = await discoverTables(tablesDir, collectionsResult.loadedNames);
  config.collections.push(...tablesResult.tables);

  // Combine conflicts from both discovery operations
  const allConflicts = [...collectionsResult.conflicts, ...tablesResult.conflicts];

  // Report conflicts if any
  if (allConflicts.length > 0) {
    MessageFormatter.warning(`Found ${allConflicts.length} naming conflicts between collections/ and tables/`, { prefix: "Config" });
    allConflicts.forEach(conflict => {
      MessageFormatter.info(`  - '${conflict.name}': ${conflict.source1} (used) vs ${conflict.source2} (skipped)`, { prefix: "Config" });
    });
  }

  // Fallback: If neither directory exists, try legacy single-directory detection
  if (!fs.existsSync(collectionsDir) && !fs.existsSync(tablesDir)) {
    // Determine directory (collections or tables) based on server version / API mode
    let dirName: 'collections' | 'tables' = "collections";
    try {
      const det = await detectAppwriteVersionCached(config.appwriteEndpoint, config.appwriteProject, config.appwriteKey);
      if (det.apiMode === 'tablesdb' || isVersionAtLeast(det.serverVersion, '1.8.0')) {
        dirName = 'tables';
      } else {
        const ver = await fetchServerVersion(config.appwriteEndpoint);
        if (isVersionAtLeast(ver || undefined, '1.8.0')) dirName = 'tables';
      }
    } catch {}

    const legacyItems = await discoverLegacyDirectory(configFileDir, dirName);
    config.collections.push(...legacyItems);
  }

  // Ensure array exists even if empty
  config.collections = config.collections || [];

  // Log the final result
  const allCollections = config.collections || [];
  const fromCollectionsDir = allCollections.filter((c: any) => !c._isFromTablesDir).length;
  const fromTablesDir = allCollections.filter((c: any) => c._isFromTablesDir).length;
  const totalLoaded = allCollections.length;

  if (totalLoaded > 0) {
    if (fromTablesDir > 0) {
      MessageFormatter.success(`Successfully loaded ${totalLoaded} items total: ${fromCollectionsDir} from collections/ and ${fromTablesDir} from tables/`, { prefix: "Config" });
    } else {
      MessageFormatter.success(`Successfully loaded ${totalLoaded} collections from collections/`, { prefix: "Config" });
    }
  }

  // Log successful config loading
  if (actualConfigPath) {
    MessageFormatter.success(`Loaded config from: ${actualConfigPath}`, { prefix: "Config" });
  }

  // Validate configuration if requested
  if (validate) {
    let validation = validateCollectionsTablesConfig(config);

    // In strict mode, treat warnings as errors
    if (strictMode && validation.warnings.length > 0) {
      validation = {
        ...validation,
        isValid: false,
        errors: [...validation.errors, ...validation.warnings.map(w => ({ ...w, severity: "error" as const }))],
        warnings: []
      };
    }

    // Report validation results if requested
    if (reportValidation) {
      reportValidationResults(validation, { verbose: true });
    }

    // Throw error if validation fails in strict mode
    if (strictMode && !validation.isValid) {
      throw new Error(`Configuration validation failed in strict mode. Found ${validation.errors.length} validation errors.`);
    }
  }

  return config;
};
