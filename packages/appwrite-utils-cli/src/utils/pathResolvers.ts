import path from "path";

/**
 * Path resolution utilities for Appwrite configuration and schema directories
 */

/**
 * Resolves the schema output directory path
 * @param configPath - Base configuration directory path
 * @returns Full path to schemas directory
 */
export function resolveSchemaDir(configPath: string): string {
  return path.join(configPath, "schemas");
}

/**
 * Resolves the collections directory path
 * @param configPath - Base configuration directory path
 * @returns Full path to collections directory
 */
export function resolveCollectionsDir(configPath: string): string {
  return path.join(configPath, "collections");
}

/**
 * Resolves the tables directory path
 * @param configPath - Base configuration directory path
 * @returns Full path to tables directory
 */
export function resolveTablesDir(configPath: string): string {
  return path.join(configPath, "tables");
}

/**
 * Resolves the YAML schema directory path
 * @param configPath - Base configuration directory path
 * @returns Full path to .yaml_schemas directory
 */
export function resolveYamlSchemaDir(configPath: string): string {
  return path.join(configPath, ".yaml_schemas");
}

/**
 * Resolves the import data directory path
 * @param configPath - Base configuration directory path
 * @returns Full path to importData directory
 */
export function resolveImportDataDir(configPath: string): string {
  return path.join(configPath, "importData");
}

/**
 * Resolves the .appwrite configuration directory
 * @param startDir - Directory to start searching from
 * @returns Path to .appwrite directory or null if not found
 */
export function resolveAppwriteDir(startDir: string): string | null {
  const appwriteDir = path.join(startDir, ".appwrite");
  // Note: Actual existence check should be done by caller
  return appwriteDir;
}

/**
 * Resolves a collection file path within the collections directory
 * @param configPath - Base configuration directory path
 * @param fileName - Name of the collection file (e.g., "User.ts" or "User.yaml")
 * @returns Full path to the collection file
 */
export function resolveCollectionFile(configPath: string, fileName: string): string {
  return path.join(resolveCollectionsDir(configPath), fileName);
}

/**
 * Resolves a table file path within the tables directory
 * @param configPath - Base configuration directory path
 * @param fileName - Name of the table file (e.g., "User.ts" or "User.yaml")
 * @returns Full path to the table file
 */
export function resolveTableFile(configPath: string, fileName: string): string {
  return path.join(resolveTablesDir(configPath), fileName);
}
