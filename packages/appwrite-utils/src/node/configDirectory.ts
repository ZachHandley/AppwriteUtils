/**
 * @fileoverview Node-only directory resolution helpers for AppwriteConfig.
 *
 * These helpers touch the filesystem (fs/path) and are NOT browser-safe.
 * They live under the `appwrite-utils/node` subpath so the default
 * `appwrite-utils` entry stays free of Node-only imports.
 */

import fs from "fs";
import path from "path";
import type { AppwriteConfig } from "../schemas/appwriteConfig.js";

/**
 * Helper function to determine the appropriate directory for collections/tables based on API mode.
 *
 * Intelligently selects between 'collections' and 'tables' directories based on:
 * 1. Explicit API mode configuration
 * 2. Filesystem analysis (when path provided)
 * 3. Backward compatibility defaults
 */
export function getVersionAwareDirectory(
  config: AppwriteConfig,
  appwriteFolderPath?: string
): string {
  if (config.apiMode === 'tablesdb') {
    return config.schemaConfig?.tablesDirectory || 'tables';
  }
  if (config.apiMode === 'legacy') {
    return config.schemaConfig?.collectionsDirectory || 'collections';
  }

  if (config.apiMode === 'auto' && appwriteFolderPath) {
    const tablesDir = path.join(appwriteFolderPath, config.schemaConfig?.tablesDirectory || 'tables');
    const collectionsDir = path.join(appwriteFolderPath, config.schemaConfig?.collectionsDirectory || 'collections');

    if (fs.existsSync(tablesDir) && !fs.existsSync(collectionsDir)) {
      return config.schemaConfig?.tablesDirectory || 'tables';
    }

    if (fs.existsSync(tablesDir) && fs.existsSync(collectionsDir)) {
      const tablesFiles = fs.readdirSync(tablesDir).filter((f: string) => f.endsWith('.ts') || f.endsWith('.yaml') || f.endsWith('.yml'));
      const collectionsFiles = fs.readdirSync(collectionsDir).filter((f: string) => f.endsWith('.ts') || f.endsWith('.yaml') || f.endsWith('.yml'));

      if (tablesFiles.length > collectionsFiles.length) {
        return config.schemaConfig?.tablesDirectory || 'tables';
      }
    }
  }

  return config.schemaConfig?.collectionsDirectory || 'collections';
}

/**
 * Explicit API mode override with fallback to config-based detection.
 */
export function resolveDirectoryForApiMode(
  config: AppwriteConfig,
  apiMode?: 'legacy' | 'tablesdb',
  appwriteFolderPath?: string
): string {
  if (apiMode === 'tablesdb') {
    return config.schemaConfig?.tablesDirectory || 'tables';
  }
  if (apiMode === 'legacy') {
    return config.schemaConfig?.collectionsDirectory || 'collections';
  }

  return getVersionAwareDirectory(config, appwriteFolderPath);
}

/**
 * Returns both directory paths simultaneously, enabling applications that need
 * to support both APIs concurrently or during migration periods.
 */
export function getDualDirectoryPaths(config: AppwriteConfig): {
  collectionsDirectory: string;
  tablesDirectory: string;
} {
  return {
    collectionsDirectory: config.schemaConfig?.collectionsDirectory || 'collections',
    tablesDirectory: config.schemaConfig?.tablesDirectory || 'tables'
  };
}
