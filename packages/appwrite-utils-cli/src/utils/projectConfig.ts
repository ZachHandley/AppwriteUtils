import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { MessageFormatter } from "../shared/messageFormatter.js";
import type { AppwriteConfig } from "appwrite-utils";

export interface AppwriteProjectConfig {
  projectId: string;
  endpoint?: string;
  projectName?: string;
  settings?: {
    services?: Record<string, boolean>;
    auth?: {
      methods?: Record<string, boolean>;
      security?: Record<string, any>;
    };
  };
  functions?: Array<{
    $id: string;
    name: string;
    runtime: string;
    entrypoint?: string;
    path?: string;
    commands?: string;
    events?: string[];
  }>;
  // Legacy Collections API support
  databases?: Array<{
    $id: string;
    name: string;
    enabled?: boolean;
  }>;
  collections?: Array<{
    $id: string;
    $permissions?: string[];
    databaseId: string;
    name: string;
    enabled?: boolean;
    documentSecurity?: boolean;
    attributes: Array<{
      key: string;
      type: string;
      required?: boolean;
      array?: boolean;
      size?: number;
      default?: any;
      encrypt?: boolean;
      [key: string]: any;
    }>;
    indexes?: Array<{
      key: string;
      type: string;
      attributes: string[];
      orders?: string[];
    }>;
  }>;
  // TablesDB API support
  tablesDB?: Array<{
    $id: string;
    name: string;
    enabled?: boolean;
  }>;
  tables?: Array<{
    $id: string;
    $permissions?: string[];
    databaseId: string;
    name: string;
    enabled?: boolean;
    rowSecurity?: boolean;
    columns: Array<{
      key: string;
      type: string;
      required?: boolean;
      array?: boolean;
      size?: number;
      default?: any;
      encrypt?: boolean;
      unique?: boolean;
      [key: string]: any;
    }>;
    indexes?: Array<{
      key: string;
      type: string;
      attributes: string[];
      orders?: string[];
    }>;
  }>;
  buckets?: Array<{
    bucketId?: string;
    $id?: string;
    name: string;
    maximumFileSize?: number;
    allowedFileExtensions?: string[];
    encryption?: boolean;
    antiVirus?: boolean;
    [key: string]: any;
  }>;
}

/**
 * Find appwrite.json or appwrite.config.json in current directory or parents
 */
export function findAppwriteProjectConfig(startDir: string = process.cwd()): string | null {
  const configNames = ["appwrite.json", "appwrite.config.json"];
  let currentDir = startDir;

  // Search up to 5 levels up the directory tree
  for (let i = 0; i < 5; i++) {
    for (const configName of configNames) {
      const configPath = join(currentDir, configName);
      if (existsSync(configPath)) {
        return configPath;
      }
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break; // Reached filesystem root
    }
    currentDir = parentDir;
  }

  return null;
}

/**
 * Load and parse appwrite project configuration
 */
export function loadAppwriteProjectConfig(configPath?: string): AppwriteProjectConfig | null {
  let actualConfigPath = configPath;

  if (!actualConfigPath) {
    actualConfigPath = findAppwriteProjectConfig() || undefined;
  }

  if (!actualConfigPath || !existsSync(actualConfigPath)) {
    return null;
  }

  try {
    const configContent = readFileSync(actualConfigPath, "utf-8");
    const config = JSON.parse(configContent) as AppwriteProjectConfig;

    // Validate required fields
    if (!config.projectId) {
      MessageFormatter.warning(
        `Appwrite project config missing required 'projectId' field: ${actualConfigPath}`,
        { prefix: "ProjectConfig" }
      );
      return null;
    }

    return config;
  } catch (error) {
    MessageFormatter.error(
      `Failed to parse Appwrite project config: ${actualConfigPath}`,
      error instanceof Error ? error : new Error(String(error)),
      { prefix: "ProjectConfig" }
    );
    return null;
  }
}

/**
 * Detect API mode from project configuration
 */
export function detectApiModeFromProject(projectConfig: AppwriteProjectConfig): "legacy" | "tablesdb" | "auto" {
  // If both are present, prefer TablesDB (newer)
  if (projectConfig.tablesDB && projectConfig.tables) {
    return "tablesdb";
  }

  // If only legacy structure is present
  if (projectConfig.databases && projectConfig.collections) {
    return "legacy";
  }

  // If only TablesDB structure is present
  if (projectConfig.tablesDB && projectConfig.tables) {
    return "tablesdb";
  }

  // Default to auto-detection
  return "auto";
}

/**
 * Convert project config to AppwriteConfig format
 */
export function projectConfigToAppwriteConfig(
  projectConfig: AppwriteProjectConfig,
  existingConfig?: Partial<AppwriteConfig>
): Partial<AppwriteConfig> {
  const apiMode = detectApiModeFromProject(projectConfig);

  const baseConfig: Partial<AppwriteConfig> = {
    ...existingConfig,
    appwriteProject: projectConfig.projectId,
    apiMode,
  };

  // Set endpoint if provided in project config
  if (projectConfig.endpoint) {
    baseConfig.appwriteEndpoint = projectConfig.endpoint;
  }

  // Convert databases (works for both legacy and TablesDB)
  if (projectConfig.databases || projectConfig.tablesDB) {
    const databases = projectConfig.databases || projectConfig.tablesDB || [];
    baseConfig.databases = databases.map(db => ({
      $id: db.$id,
      name: db.name,
      // Add basic bucket configuration if not exists
      bucket: {
        $id: `${db.$id}_bucket`,
        name: `${db.name} Bucket`,
        enabled: true,
        maximumFileSize: 30000000,
        allowedFileExtensions: [],
        encryption: true,
        antivirus: true,
      },
    }));
  }

  // Convert buckets if present
  if (projectConfig.buckets) {
    baseConfig.buckets = projectConfig.buckets.map(bucket => ({
      $id: (bucket.bucketId || bucket.$id || `bucket_${Date.now()}`) as string,
      name: bucket.name,
      enabled: true,
      maximumFileSize: bucket.maximumFileSize || 30000000,
      allowedFileExtensions: bucket.allowedFileExtensions || [],
      encryption: bucket.encryption ?? true,
      antivirus: bucket.antiVirus ?? false,
    }));
  }

  return baseConfig;
}

/**
 * Get collection/table definitions from project config
 */
export function getCollectionsFromProject(projectConfig: AppwriteProjectConfig): any[] {
  if (projectConfig.tables) {
    // Convert TablesDB tables to collection format
    return projectConfig.tables.map(table => ({
      name: table.name,
      $id: table.$id,
      $permissions: table.$permissions || [],
      documentSecurity: table.rowSecurity || false,
      enabled: table.enabled !== false,
      // Convert columns to attributes for compatibility
      attributes: table.columns.map(col => ({
        key: col.key,
        type: col.type,
        required: col.required,
        array: col.array,
        size: col.size,
        default: col.default,
        encrypt: col.encrypt,
        unique: col.unique,
      })),
      indexes: table.indexes || [],
      // Mark as coming from TablesDB for processing
      _isFromTablesDir: true,
    }));
  }

  if (projectConfig.collections) {
    // Legacy collections format
    return projectConfig.collections.map(collection => ({
      name: collection.name,
      $id: collection.$id,
      $permissions: collection.$permissions || [],
      documentSecurity: collection.documentSecurity || false,
      enabled: collection.enabled !== false,
      attributes: collection.attributes,
      indexes: collection.indexes || [],
      _isFromTablesDir: false,
    }));
  }

  return [];
}

/**
 * Check if project config indicates TablesDB usage
 */
export function isTablesDBProject(projectConfig: AppwriteProjectConfig): boolean {
  return !!(projectConfig.tablesDB && projectConfig.tables);
}

/**
 * Get the appropriate directory name based on project config
 */
export function getProjectDirectoryName(projectConfig: AppwriteProjectConfig): "tables" | "collections" {
  return isTablesDBProject(projectConfig) ? "tables" : "collections";
}
