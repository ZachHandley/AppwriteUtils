import path from "path";
import fs from "fs";
import { type CollectionCreate, type Collection } from "appwrite-utils";
import { register } from "tsx/esm/api";
import { pathToFileURL } from "node:url";
import yaml from "js-yaml";
import { z } from "zod";
import { MessageFormatter } from "../shared/messageFormatter.js";
import { shouldIgnoreDirectory } from "./directoryUtils.js";
import { resolveCollectionsDir, resolveTablesDir } from "./pathResolvers.js";
import { findYamlConfig } from "../config/yamlConfig.js";

/**
 * Recursively searches for TypeScript configuration files (appwriteConfig.ts)
 * @param dir The directory to start the search from
 * @param depth Current search depth for recursion limiting
 * @returns Path to the config file or null if not found
 */
export const findAppwriteConfigTS = (dir: string, depth: number = 0): string | null => {
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
      if (entry.isFile() && entry.name === "appwriteConfig.ts") {
        return path.join(dir, entry.name);
      }
    }

    // Then search subdirectories
    for (const entry of entries) {
      if (entry.isDirectory() && !shouldIgnoreDirectory(entry.name)) {
        const result = findAppwriteConfigTS(path.join(dir, entry.name), depth + 1);
        if (result) return result;
      }
    }
  } catch (error) {
    // Ignore directory access errors
  }

  return null;
};

/**
 * Recursively searches for configuration files starting from the given directory.
 * Priority: 1) YAML configs in .appwrite directories, 2) appwriteConfig.ts files in subdirectories
 * @param dir The directory to start the search from
 * @returns The directory path where the config was found, suitable for passing to loadConfig()
 */
export const findAppwriteConfig = (dir: string): string | null => {
  // First try to find YAML config (already searches recursively for .appwrite dirs)
  const yamlConfig = findYamlConfig(dir);
  if (yamlConfig) {
    // Return the directory containing the config file
    return path.dirname(yamlConfig);
  }

  // Fall back to TypeScript config search
  const tsConfigPath = findAppwriteConfigTS(dir);
  if (tsConfigPath) {
    return path.dirname(tsConfigPath);
  }

  return null;
};

/**
 * Recursively searches for the functions directory
 * @param dir The directory to start searching from
 * @param depth Current search depth for recursion limiting
 * @returns Path to the functions directory or null if not found
 */
export const findFunctionsDir = (dir: string, depth: number = 0): string | null => {
  // Limit search depth to prevent infinite recursion
  if (depth > 5) {
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

      const result = findFunctionsDir(path.join(dir, entry.name), depth + 1);
      if (result) return result;
    }
  } catch (error) {
    // Ignore directory access errors
  }

  return null;
};

// YAML Collection Schema
const YamlCollectionSchema = z.object({
  name: z.string(),
  id: z.string().optional(),
  documentSecurity: z.boolean().default(false),
  enabled: z.boolean().default(true),
  permissions: z.array(
    z.object({
      permission: z.string(),
      target: z.string()
    })
  ).optional().default([]),
  attributes: z.array(
    z.object({
      key: z.string(),
      type: z.string(),
      size: z.number().optional(),
      required: z.boolean().default(false),
      array: z.boolean().optional(),
      default: z.any().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      elements: z.array(z.string()).optional(),
      relatedCollection: z.string().optional(),
      relationType: z.string().optional(),
      twoWay: z.boolean().optional(),
      twoWayKey: z.string().optional(),
      onDelete: z.string().optional(),
      side: z.string().optional(),
      encrypt: z.boolean().optional(),
      format: z.string().optional()
    })
  ).optional().default([]),
  indexes: z.array(
    z.object({
      key: z.string(),
      type: z.string(),
      attributes: z.array(z.string()),
      orders: z.array(z.string()).optional()
    })
  ).optional().default([]),
  importDefs: z.array(z.any()).optional().default([])
});

type YamlCollection = z.infer<typeof YamlCollectionSchema>;

/**
 * Loads a YAML collection file and converts it to CollectionCreate format
 * @param filePath Path to the YAML collection file
 * @returns CollectionCreate object or null if loading fails
 */
export const loadYamlCollection = (filePath: string): CollectionCreate | null => {
  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    const yamlData = yaml.load(fileContent) as unknown;
    const parsedCollection = YamlCollectionSchema.parse(yamlData);

    // Convert YAML collection to CollectionCreate format
    const collection: CollectionCreate = {
      name: parsedCollection.name,
      $id: parsedCollection.id || parsedCollection.name.toLowerCase().replace(/\s+/g, '_'),
      documentSecurity: parsedCollection.documentSecurity,
      enabled: parsedCollection.enabled,
      $permissions: parsedCollection.permissions.map(p => ({
        permission: p.permission as any,
        target: p.target
      })),
      attributes: parsedCollection.attributes.map(attr => ({
        key: attr.key,
        type: attr.type as any,
        size: attr.size,
        required: attr.required,
        array: attr.array,
        xdefault: attr.default,
        min: attr.min,
        max: attr.max,
        elements: attr.elements,
        relatedCollection: attr.relatedCollection,
        relationType: attr.relationType as any,
        twoWay: attr.twoWay,
        twoWayKey: attr.twoWayKey,
        onDelete: attr.onDelete as any,
        side: attr.side as any,
        encrypted: (attr as any).encrypt,
        format: (attr as any).format
      })),
      indexes: parsedCollection.indexes.map(idx => ({
        key: idx.key,
        type: idx.type as any,
        attributes: idx.attributes,
        orders: idx.orders as any
      })),
      importDefs: parsedCollection.importDefs && Array.isArray(parsedCollection.importDefs) && parsedCollection.importDefs.length > 0 ? parsedCollection.importDefs : []
    };

    return collection;
  } catch (error) {
    MessageFormatter.error(`Error loading YAML collection from ${filePath}`, error as Error, { prefix: "Config" });
    return null;
  }
};

/**
 * Loads a YAML table file and converts it to table format
 * @param filePath Path to the YAML table file
 * @returns Table object or null if loading fails
 */
export const loadYamlTable = (filePath: string): any | null => {
  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    const yamlData = yaml.load(fileContent) as unknown;

    // For now, use the collection schema as base and adapt for tables
    const parsedTable = YamlCollectionSchema.parse(yamlData);

    // Convert YAML table to TableCreate format
    const table: any = {
      name: parsedTable.name,
      tableId: (yamlData as any).tableId || parsedTable.id || parsedTable.name.toLowerCase().replace(/\s+/g, '_'),
      documentSecurity: parsedTable.documentSecurity,
      enabled: parsedTable.enabled,
      $permissions: parsedTable.permissions.map(p => ({
        permission: p.permission as any,
        target: p.target
      })),
      attributes: parsedTable.attributes.map(attr => ({
        key: attr.key,
        type: attr.type as any,
        size: attr.size,
        required: attr.required,
        array: attr.array,
        xdefault: attr.default,
        min: attr.min,
        max: attr.max,
        elements: attr.elements,
        relatedCollection: attr.relatedCollection,
        relationType: attr.relationType as any,
        twoWay: attr.twoWay,
        twoWayKey: attr.twoWayKey,
        onDelete: attr.onDelete as any,
        side: attr.side as any,
        encrypted: (attr as any).encrypt,
        format: (attr as any).format
      })),
      indexes: parsedTable.indexes.map(idx => ({
        key: idx.key,
        type: idx.type as any,
        attributes: idx.attributes,
        orders: idx.orders as any
      })),
      importDefs: parsedTable.importDefs,
      databaseId: (yamlData as any).databaseId,
      // Add backward compatibility field
      $id: (yamlData as any).$id || parsedTable.id
    };

    return table;
  } catch (error) {
    MessageFormatter.error(`Error loading YAML table from ${filePath}`, error as Error, { prefix: "Config" });
    return null;
  }
};

/**
 * Result of discovering collections from a directory
 */
export interface CollectionDiscoveryResult {
  collections: CollectionCreate[];
  loadedNames: Set<string>;
  conflicts: Array<{ name: string; source1: string; source2: string }>;
}

/**
 * Discovers and loads collections from a collections/ directory
 * @param collectionsDir Path to the collections directory
 * @returns Discovery result with loaded collections and metadata
 */
export const discoverCollections = async (collectionsDir: string): Promise<CollectionDiscoveryResult> => {
  const collections: CollectionCreate[] = [];
  const loadedNames = new Set<string>();
  const conflicts: Array<{ name: string; source1: string; source2: string }> = [];

  if (!fs.existsSync(collectionsDir)) {
    return { collections, loadedNames, conflicts };
  }

  const unregister = register(); // Register tsx for collections

  try {
    const collectionFiles = fs.readdirSync(collectionsDir);
    MessageFormatter.success(`Loading from collections/ directory: ${collectionFiles.length} files found`, { prefix: "Config" });

    for (const file of collectionFiles) {
      if (file === "index.ts") {
        continue;
      }
      const filePath = path.join(collectionsDir, file);
      let collection: CollectionCreate | null = null;

      // Handle YAML collections
      if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        collection = loadYamlCollection(filePath);
      }

      // Handle TypeScript collections
      else if (file.endsWith('.ts')) {
        const fileUrl = pathToFileURL(filePath).href;
        const collectionModule = (await import(fileUrl));
        const importedCollection: Collection | undefined = collectionModule.default?.default || collectionModule.default || collectionModule;
        if (importedCollection) {
          collection = importedCollection as CollectionCreate;
          // Ensure importDefs are properly loaded
          if (collectionModule.importDefs || collection.importDefs) {
            collection.importDefs = collectionModule.importDefs || collection.importDefs;
          }
        }
      }

      if (collection) {
        const collectionName = collection.name || collection.$id || file;
        loadedNames.add(collectionName);
        collections.push(collection);
      }
    }
  } finally {
    unregister(); // Unregister tsx when done
  }

  return { collections, loadedNames, conflicts };
};

/**
 * Result of discovering tables from a directory
 */
export interface TableDiscoveryResult {
  tables: any[];
  loadedNames: Set<string>;
  conflicts: Array<{ name: string; source1: string; source2: string }>;
}

/**
 * Discovers and loads tables from a tables/ directory
 * @param tablesDir Path to the tables directory
 * @param existingNames Set of already-loaded collection names to check for conflicts
 * @returns Discovery result with loaded tables and metadata
 */
export const discoverTables = async (
  tablesDir: string,
  existingNames: Set<string> = new Set()
): Promise<TableDiscoveryResult> => {
  const tables: any[] = [];
  const loadedNames = new Set<string>();
  const conflicts: Array<{ name: string; source1: string; source2: string }> = [];

  if (!fs.existsSync(tablesDir)) {
    return { tables, loadedNames, conflicts };
  }

  const unregister = register(); // Register tsx for tables

  try {
    const tableFiles = fs.readdirSync(tablesDir);
    MessageFormatter.success(`Loading from tables/ directory: ${tableFiles.length} files found`, { prefix: "Config" });

    for (const file of tableFiles) {
      if (file === "index.ts") {
        continue;
      }
      const filePath = path.join(tablesDir, file);
      let table: any | null = null;

      // Handle YAML tables
      if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        table = loadYamlTable(filePath);
      }

      // Handle TypeScript tables
      else if (file.endsWith('.ts')) {
        const fileUrl = pathToFileURL(filePath).href;
        const tableModule = (await import(fileUrl));
        const importedTable: any = tableModule.default?.default || tableModule.default || tableModule;
        if (importedTable) {
          table = importedTable;
          // Ensure importDefs are properly loaded
          if (tableModule.importDefs || table.importDefs) {
            table.importDefs = tableModule.importDefs || table.importDefs;
          }
        }
      }

      if (table) {
        const tableName = table.name || table.tableId || table.$id || file;

        // Check for naming conflicts with existing collections
        if (existingNames.has(tableName)) {
          conflicts.push({
            name: tableName,
            source1: "collections/",
            source2: "tables/"
          });
          MessageFormatter.warning(`Skipping duplicate '${tableName}' from tables/ (collections/ takes priority)`, { prefix: "Config" });
        } else {
          loadedNames.add(tableName);
          // Mark as coming from tables directory
          table._isFromTablesDir = true;
          tables.push(table);
        }
      }
    }
  } finally {
    unregister(); // Unregister tsx when done
  }

  return { tables, loadedNames, conflicts };
};

/**
 * Discovers and loads collections/tables from legacy single directory structure
 * @param configFileDir Directory containing the config file
 * @param dirName Directory name to search for ('collections' or 'tables')
 * @returns Array of discovered collections/tables
 */
export const discoverLegacyDirectory = async (
  configFileDir: string,
  dirName: 'collections' | 'tables'
): Promise<CollectionCreate[]> => {
  const legacyDir = path.join(configFileDir, dirName);
  const items: CollectionCreate[] = [];

  if (!fs.existsSync(legacyDir)) {
    return items;
  }

  MessageFormatter.info(`Using legacy single directory: ${dirName}/`, { prefix: "Config" });

  const unregister = register(); // Register tsx for legacy collections

  try {
    const collectionFiles = fs.readdirSync(legacyDir);

    for (const file of collectionFiles) {
      if (file === "index.ts") {
        continue;
      }
      const filePath = path.join(legacyDir, file);

      // Handle YAML collections
      if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        const collection = loadYamlCollection(filePath);
        if (collection) {
          if (dirName === 'tables') {
            // Mark as coming from tables directory
            const table = {
              ...collection,
              _isFromTablesDir: true,
              tableId: collection.$id || collection.name.toLowerCase().replace(/\s+/g, '_')
            };
            items.push(table);
          } else {
            items.push(collection);
          }
        }
        continue;
      }

      // Handle TypeScript collections
      if (file.endsWith('.ts')) {
        const fileUrl = pathToFileURL(filePath).href;
        const collectionModule = (await import(fileUrl));
        const collection: Collection | undefined = collectionModule.default?.default || collectionModule.default || collectionModule;
        if (collection) {
          // Ensure importDefs are properly loaded
          if (collectionModule.importDefs || collection.importDefs) {
            collection.importDefs = collectionModule.importDefs || collection.importDefs;
          }
          if (dirName === 'tables') {
            // Mark as coming from tables directory
            const table = {
              ...collection,
              _isFromTablesDir: true,
              tableId: collection.$id || collection.name.toLowerCase().replace(/\s+/g, '_')
            };
            items.push(table as CollectionCreate);
          } else {
            items.push(collection as CollectionCreate);
          }
        }
      }
    }
  } finally {
    unregister(); // Unregister tsx when done
  }

  return items;
};
