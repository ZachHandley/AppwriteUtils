import path from "path";
import fs from "fs";
import { type AppwriteConfig, type Collection, type CollectionCreate } from "appwrite-utils";
import { register } from "tsx/esm/api"; // Import the register function
import { pathToFileURL } from "node:url";
import chalk from "chalk";
import { findYamlConfig, loadYamlConfig } from "../config/yamlConfig.js";
import yaml from "js-yaml";
import { z } from "zod";

/**
 * Recursively searches for configuration files starting from the given directory.
 * Priority: 1) YAML configs in .appwrite directories, 2) appwriteConfig.ts files in subdirectories
 * @param dir The directory to start the search from.
 * @returns The directory path where the config was found, suitable for passing to loadConfig().
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

const shouldIgnoreDirectory = (dirName: string): boolean => {
  const ignoredDirs = [
    'node_modules',
    'dist',
    'build',
    'coverage',
    '.next',
    '.nuxt',
    '.cache',
    '.git',
    '.svn',
    '.hg',
    '__pycache__',
    '.pytest_cache',
    '.mypy_cache',
    'venv',
    '.venv',
    'env',
    '.env',
    'target',
    'out',
    'bin',
    'obj',
    '.vs',
    '.vscode',
    '.idea',
    'temp',
    'tmp',
    '.tmp',
    'logs',
    'log',
    '.DS_Store',
    'Thumbs.db'
  ];
  
  return ignoredDirs.includes(dirName) || 
         dirName.startsWith('.git') || 
         dirName.startsWith('node_modules') ||
         (dirName.startsWith('.') && dirName !== '.appwrite');
};

const findAppwriteConfigTS = (dir: string, depth: number = 0): string | null => {
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
        console.log(`Found appwriteConfig.ts at: ${path.join(dir, entry.name)}`);
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
    console.log(`Error accessing directory ${dir}:`, error);
  }

  return null;
};

/**
 * Loads the Appwrite configuration and returns both config and the path where it was found.
 * @param configDir The directory to search for config files.
 * @returns Object containing the config and the actual path where it was found.
 */
export const loadConfigWithPath = async (
  configDir: string
): Promise<{ config: AppwriteConfig; actualConfigPath: string }> => {
  let config: AppwriteConfig | null = null;
  let actualConfigPath: string | null = null;

  // Check if we're given the .appwrite directory directly
  if (configDir.endsWith('.appwrite')) {
    // Look for config files directly in this directory
    const possibleYamlFiles = ['config.yaml', 'config.yml', 'appwriteConfig.yaml', 'appwriteConfig.yml'];
    for (const fileName of possibleYamlFiles) {
      const yamlPath = path.join(configDir, fileName);
      if (fs.existsSync(yamlPath)) {
        config = await loadYamlConfig(yamlPath);
        actualConfigPath = yamlPath;
        break;
      }
    }
  } else {
    // Original logic: search for .appwrite directories
    const yamlConfigPath = findYamlConfig(configDir);
    if (yamlConfigPath) {
      config = await loadYamlConfig(yamlConfigPath);
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
        console.log(`Loading TypeScript config from: ${configPath}`);
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

  // Determine collections directory based on actual config file location
  let collectionsDir: string;
  const configFileDir = path.dirname(actualConfigPath);
  
  // Check if config is in .appwrite directory
  if (configFileDir.endsWith('.appwrite')) {
    collectionsDir = path.join(configFileDir, "collections");
  } else {
    // Config is in root or other directory
    collectionsDir = path.join(configFileDir, "collections");
  }

  // Load collections if they exist
  if (fs.existsSync(collectionsDir)) {
    const unregister = register(); // Register tsx for collections

    try {
      const collectionFiles = fs.readdirSync(collectionsDir);
      config.collections = [];

      for (const file of collectionFiles) {
        if (file === "index.ts") {
          continue;
        }
        const filePath = path.join(collectionsDir, file);
        
        // Handle YAML collections
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          const collection = loadYamlCollection(filePath);
          if (collection) {
            config.collections.push(collection);
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
            config.collections.push(collection as CollectionCreate);
          }
        }
      }
    } finally {
      unregister(); // Unregister tsx when done
    }
  }

  return { config, actualConfigPath };
};

/**
 * Loads the Appwrite configuration and all collection configurations from a specified directory.
 * Supports both YAML and TypeScript config formats with backward compatibility.
 * @param configDir The directory containing the config file and collections folder.
 * @returns The loaded Appwrite configuration including collections.
 */
export const loadConfig = async (
  configDir: string
): Promise<AppwriteConfig> => {
  let config: AppwriteConfig | null = null;
  let actualConfigPath: string | null = null;

  // First try to find and load YAML config
  const yamlConfigPath = findYamlConfig(configDir);
  if (yamlConfigPath) {
    console.log(`Loading YAML config from: ${yamlConfigPath}`);
    config = await loadYamlConfig(yamlConfigPath);
    actualConfigPath = yamlConfigPath;
  }

  // Fall back to TypeScript config if YAML not found or failed to load
  if (!config) {
    const configPath = path.join(configDir, "appwriteConfig.ts");
    
    // Only try to load TypeScript config if the file exists
    if (fs.existsSync(configPath)) {
      const unregister = register(); // Register tsx enhancement

      try {
        console.log(`Loading TypeScript config from: ${configPath}`);
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

  // Determine collections directory based on actual config file location
  let collectionsDir: string;
  if (actualConfigPath) {
    const configFileDir = path.dirname(actualConfigPath);
    
    // Check if config is in .appwrite directory
    if (configFileDir.endsWith('.appwrite')) {
      collectionsDir = path.join(configFileDir, "collections");
    } else {
      // Config is in root or other directory
      collectionsDir = path.join(configFileDir, "collections");
    }
  } else {
    // Fallback to original behavior if no actual config path found
    collectionsDir = path.join(configDir, "collections");
  }

  // Load collections if they exist
  if (fs.existsSync(collectionsDir)) {
    const unregister = register(); // Register tsx for collections

    try {
      const collectionFiles = fs.readdirSync(collectionsDir);
      config.collections = [];

      for (const file of collectionFiles) {
        if (file === "index.ts") {
          continue;
        }
        const filePath = path.join(collectionsDir, file);
        
        // Handle YAML collections
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          const collection = loadYamlCollection(filePath);
          if (collection) {
            config.collections.push(collection);
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
            config.collections.push(collection);
          }
        }
      }
    } finally {
      unregister(); // Unregister tsx when done
    }
  } else {
    config.collections = config.collections || [];
  }

  return config;
};

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
      description: z.string().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      elements: z.array(z.string()).optional(),
      relatedCollection: z.string().optional(),
      relationType: z.string().optional(),
      twoWay: z.boolean().optional(),
      twoWayKey: z.string().optional(),
      onDelete: z.string().optional(),
      side: z.string().optional()
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

const loadYamlCollection = (filePath: string): CollectionCreate | null => {
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
        description: attr.description,
        min: attr.min,
        max: attr.max,
        elements: attr.elements,
        relatedCollection: attr.relatedCollection,
        relationType: attr.relationType as any,
        twoWay: attr.twoWay,
        twoWayKey: attr.twoWayKey,
        onDelete: attr.onDelete as any,
        side: attr.side as any
      })),
      indexes: parsedCollection.indexes.map(idx => ({
        key: idx.key,
        type: idx.type as any,
        attributes: idx.attributes,
        orders: idx.orders as any
      })),
      importDefs: parsedCollection.importDefs
    };
    
    return collection;
  } catch (error) {
    console.error(`Error loading YAML collection from ${filePath}:`, error);
    return null;
  }
};