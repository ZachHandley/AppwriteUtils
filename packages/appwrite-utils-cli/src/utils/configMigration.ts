import { promises as fs } from "fs";
import path from "path";
import { existsSync } from "fs";
import { MessageFormatter } from "../shared/messageFormatter.js";
import { ConfirmationDialogs } from "../shared/confirmationDialogs.js";
import yaml from "js-yaml";

interface AppwriteConfigTS {
  appwriteEndpoint: string;
  appwriteProject: string;
  appwriteKey: string;
  enableBackups?: boolean;
  backupInterval?: number;
  backupRetention?: number;
  enableBackupCleanup?: boolean;
  enableMockData?: boolean;
  documentBucketId?: string;
  usersCollectionName?: string;
  databases: Array<{ $id: string; name: string }>;
  buckets: Array<any>;
  [key: string]: any;
}

interface AppwriteConfigYAML {
  appwrite: {
    endpoint: string;
    project: string;
    key: string;
  };
  logging: {
    enabled: boolean;
    level: string;
    console: boolean;
    logDirectory: string;
  };
  backups: {
    enabled: boolean;
    interval: number;
    retention: number;
    cleanup: boolean;
  };
  data: {
    enableMockData: boolean;
    documentBucketId: string;
    usersCollectionName: string;
    importDirectory: string;
  };
  schemas: {
    outputDirectory: string;
    yamlSchemaDirectory: string;
  };
  migrations: {
    enabled: boolean;
  };
  databases: Array<{ id: string; name: string; collections?: string[] }>;
  buckets: Array<any>;
  functions: Array<any>;
}

export async function migrateConfig(workingDir: string): Promise<void> {
  try {
    // Look for appwriteConfig.ts files in the working directory and subdirectories
    const configFiles = await findAppwriteConfigFiles(workingDir);
    
    if (configFiles.length === 0) {
      MessageFormatter.info("No appwriteConfig.ts files found to migrate", { prefix: "Migration" });
      return;
    }

    MessageFormatter.info(`Found ${configFiles.length} appwriteConfig.ts file(s) to migrate`, { prefix: "Migration" });

    for (const configFile of configFiles) {
      await migrateConfigFile(configFile, workingDir);
    }

    MessageFormatter.success("Migration completed successfully", { prefix: "Migration" });
  } catch (error) {
    MessageFormatter.error("Migration failed", error instanceof Error ? error : new Error(String(error)), { prefix: "Migration" });
    throw error;
  }
}

async function findAppwriteConfigFiles(dir: string): Promise<string[]> {
  const configFiles: string[] = [];
  
  const checkDir = async (currentDir: string) => {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await checkDir(fullPath);
        } else if (entry.isFile() && entry.name === 'appwriteConfig.ts') {
          configFiles.push(fullPath);
        }
      }
    } catch (error) {
      // Ignore directory access errors
    }
  };

  await checkDir(dir);
  return configFiles;
}

async function migrateConfigFile(configFilePath: string, workingDir: string): Promise<void> {
  const configDir = path.dirname(configFilePath);
  const appwriteDir = path.join(path.dirname(configDir), '.appwrite');
  
  MessageFormatter.info(`Migrating ${path.relative(workingDir, configFilePath)}`, { prefix: "Migration" });

  // Check if .appwrite directory already exists
  if (existsSync(appwriteDir)) {
    const shouldOverwrite = await ConfirmationDialogs.confirmOverwrite(
      `.appwrite directory already exists at ${path.relative(workingDir, appwriteDir)}`
    );
    if (!shouldOverwrite) {
      MessageFormatter.info("Skipping migration for this config", { prefix: "Migration" });
      return;
    }
  }

  // Load and parse the TypeScript config
  const config = await parseTypeScriptConfig(configFilePath);

  // Create .appwrite directory
  await fs.mkdir(appwriteDir, { recursive: true });

  // Convert config to YAML and save
  const yamlConfig = convertToYAMLConfig(config);
  const yamlContent = yaml.dump(yamlConfig, { 
    indent: 2,
    lineWidth: 120,
    noRefs: true 
  });
  await fs.writeFile(path.join(appwriteDir, 'appwriteConfig.yaml'), yamlContent);

  // Copy all directories except collections and schemas (we handle collections separately, skip schemas entirely)
  const entries = await fs.readdir(configDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== 'collections' && entry.name !== 'schemas') {
      const sourcePath = path.join(configDir, entry.name);
      const targetPath = path.join(appwriteDir, entry.name);
      
      await fs.cp(sourcePath, targetPath, { recursive: true });
      MessageFormatter.info(`Copied ${entry.name}/ to .appwrite/${entry.name}/`, { prefix: "Migration" });
    }
  }

  // Convert TypeScript collections to YAML collections
  const collectionsPath = path.join(configDir, 'collections');
  if (existsSync(collectionsPath)) {
    const targetCollectionsPath = path.join(appwriteDir, 'collections');
    await fs.mkdir(targetCollectionsPath, { recursive: true });
    
    const collectionFiles = await fs.readdir(collectionsPath);
    for (const file of collectionFiles) {
      if (file.endsWith('.ts')) {
        await convertCollectionToYaml(path.join(collectionsPath, file), targetCollectionsPath);
      }
    }
    MessageFormatter.info(`Converted TypeScript collections to YAML in .appwrite/collections/`, { prefix: "Migration" });
  }

  // Keep original config file in place (no backup needed since we're not deleting it)

  MessageFormatter.success(`Migration completed for ${path.relative(workingDir, configFilePath)}`, { prefix: "Migration" });
}

async function parseTypeScriptConfig(configFilePath: string): Promise<AppwriteConfigTS> {
  try {
    // Use tsx to import the TypeScript config file directly
    const { register } = await import("tsx/esm/api");
    const { pathToFileURL } = await import("node:url");
    
    const unregister = register();
    
    try {
      const configUrl = pathToFileURL(configFilePath).href;
      const configModule = await import(configUrl);
      const config = configModule.default?.default || configModule.default || configModule;
      
      if (!config) {
        throw new Error("Failed to load config from TypeScript file");
      }
      
      return config as AppwriteConfigTS;
    } finally {
      unregister();
    }
  } catch (error) {
    MessageFormatter.error("Could not load TypeScript config", error instanceof Error ? error : new Error(String(error)), { prefix: "Migration" });
    throw new Error('Failed to load TypeScript configuration file. Please ensure it exports a valid config object.');
  }
}

function convertToYAMLConfig(config: AppwriteConfigTS): AppwriteConfigYAML {
  // Convert the config to the nested YAML structure
  const yamlConfig: AppwriteConfigYAML = {
    appwrite: {
      endpoint: config.appwriteEndpoint,
      project: config.appwriteProject,
      key: config.appwriteKey
    },
    logging: {
      enabled: config.logging?.enabled ?? false,
      level: config.logging?.level ?? "info",
      console: config.logging?.console ?? false,
      logDirectory: "./logs"
    },
    backups: {
      enabled: config.enableBackups ?? false,
      interval: config.backupInterval ?? 3600,
      retention: config.backupRetention ?? 30,
      cleanup: config.enableBackupCleanup ?? false
    },
    data: {
      enableMockData: config.enableMockData ?? false,
      documentBucketId: config.documentBucketId ?? "documents",
      usersCollectionName: config.usersCollectionName ?? "Users",
      importDirectory: "importData"
    },
    schemas: {
      outputDirectory: "schemas",
      yamlSchemaDirectory: ".yaml_schemas"
    },
    migrations: {
      enabled: true
    },
    databases: (config.databases || []).map(db => ({
      id: db.$id,
      name: db.name,
      collections: [] // Collections will be handled separately
    })),
    buckets: (config.buckets || []).map(bucket => ({
      id: bucket.$id,
      name: bucket.name,
      permissions: bucket.$permissions?.map((p: any) => ({
        permission: p.permission,
        target: p.target
      })) || [],
      fileSecurity: bucket.fileSecurity ?? false,
      enabled: bucket.enabled ?? true,
      maximumFileSize: bucket.maximumFileSize ?? 30000000,
      allowedFileExtensions: bucket.allowedFileExtensions || [],
      compression: bucket.compression || "gzip",
      encryption: bucket.encryption ?? false,
      antivirus: bucket.antivirus ?? false
    })),
    functions: (config.functions || []).map((func: any) => ({
      id: func.$id,
      name: func.name,
      runtime: func.runtime,
      execute: func.execute || [],
      events: func.events || [],
      schedule: func.schedule || "",
      timeout: func.timeout ?? 15,
      enabled: func.enabled ?? true,
      logging: func.logging ?? false,
      entrypoint: func.entrypoint || "src/main.js",
      commands: func.commands || "",
      scopes: func.scopes || [],
      specification: func.specification || "s-1vcpu-512mb"
    }))
  };

  return yamlConfig;
}

async function convertCollectionToYaml(tsFilePath: string, targetDir: string): Promise<void> {
  try {
    // Load the TypeScript collection using tsx
    const { register } = await import("tsx/esm/api");
    const { pathToFileURL } = await import("node:url");
    
    const unregister = register();
    
    try {
      const configUrl = pathToFileURL(tsFilePath).href;
      const collectionModule = await import(configUrl);
      const collection = collectionModule.default?.default || collectionModule.default || collectionModule;
      
      if (!collection) {
        throw new Error("Failed to load collection from TypeScript file");
      }

      // Convert collection to YAML format
      const yamlCollection = {
        name: collection.name,
        id: collection.$id,
        documentSecurity: collection.documentSecurity ?? false,
        enabled: collection.enabled ?? true,
        permissions: (collection.permissions || collection.$permissions || []).map((p: any) => ({
          permission: p.permission,
          target: p.target
        })),
        attributes: (collection.attributes || []).map((attr: any) => ({
          key: attr.key,
          type: attr.type,
          size: attr.size,
          required: attr.required ?? false,
          array: attr.array,
          default: attr.xdefault || attr.default,
          description: attr.description,
          min: attr.min,
          max: attr.max,
          elements: attr.elements,
          relatedCollection: attr.relatedCollection,
          relationType: attr.relationType,
          twoWay: attr.twoWay,
          twoWayKey: attr.twoWayKey,
          onDelete: attr.onDelete,
          side: attr.side
        })),
        indexes: (collection.indexes || []).map((idx: any) => ({
          key: idx.key,
          type: idx.type,
          attributes: idx.attributes,
          orders: idx.orders
        })),
        importDefs: collection.importDefs || []
      };

      // Remove undefined values
      const cleanYamlCollection = JSON.parse(JSON.stringify(yamlCollection, (key, value) => 
        value === undefined ? undefined : value
      ));

      // Write YAML file
      const fileName = path.basename(tsFilePath, '.ts') + '.yaml';
      const targetPath = path.join(targetDir, fileName);
      const yamlContent = yaml.dump(cleanYamlCollection, { 
        indent: 2,
        lineWidth: 120,
        noRefs: true 
      });
      
      await fs.writeFile(targetPath, yamlContent);
      MessageFormatter.info(`Converted ${path.basename(tsFilePath)} to ${fileName}`, { prefix: "Migration" });
      
    } finally {
      unregister();
    }
  } catch (error) {
    MessageFormatter.error(`Failed to convert collection ${path.basename(tsFilePath)}`, error instanceof Error ? error : new Error(String(error)), { prefix: "Migration" });
  }
}