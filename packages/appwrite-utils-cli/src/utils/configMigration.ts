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
  const appwriteDir = path.join(configDir, '.appwrite');
  
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

  // Read and parse the TypeScript config
  const configContent = await fs.readFile(configFilePath, 'utf8');
  const config = await parseTypeScriptConfig(configContent);

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

  // Move related directories
  const foldersToMove = ['collections', 'schemas', 'importData', 'functions'];
  for (const folder of foldersToMove) {
    const sourcePath = path.join(configDir, folder);
    const targetPath = path.join(appwriteDir, folder);
    
    if (existsSync(sourcePath)) {
      await fs.rename(sourcePath, targetPath);
      MessageFormatter.info(`Moved ${folder}/ to .appwrite/${folder}/`, { prefix: "Migration" });
    }
  }

  // Backup original config file
  const backupPath = configFilePath + '.backup';
  await fs.copyFile(configFilePath, backupPath);
  MessageFormatter.info(`Created backup at ${path.relative(workingDir, backupPath)}`, { prefix: "Migration" });

  // Optionally remove original config file
  const shouldRemoveOriginal = await ConfirmationDialogs.confirmRemoval(
    `Remove original ${path.relative(workingDir, configFilePath)}?`
  );
  if (shouldRemoveOriginal) {
    await fs.unlink(configFilePath);
    MessageFormatter.info(`Removed original ${path.relative(workingDir, configFilePath)}`, { prefix: "Migration" });
  }

  MessageFormatter.success(`Migration completed for ${path.relative(workingDir, configFilePath)}`, { prefix: "Migration" });
}

async function parseTypeScriptConfig(content: string): Promise<AppwriteConfigTS> {
  // This is a simplified parser - in a real implementation, you might want to use a proper TypeScript parser
  // For now, we'll use a regex-based approach to extract the config object
  
  try {
    // Remove comments and imports
    const cleanContent = content
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
      .replace(/\/\/.*$/gm, '') // Remove line comments
      .replace(/^import.*$/gm, '') // Remove imports
      .replace(/^export.*$/gm, ''); // Remove exports
    
    // Find the config object
    const configMatch = cleanContent.match(/const\s+\w+\s*:\s*\w+\s*=\s*({[\s\S]*?});/);
    if (!configMatch) {
      throw new Error('Could not find config object in TypeScript file');
    }
    
    // Convert to JSON-like format and parse
    let configStr = configMatch[1];
    
    // Replace TypeScript-specific syntax
    configStr = configStr
      .replace(/(\w+):/g, '"$1":') // Quote property names
      .replace(/'/g, '"') // Convert single quotes to double quotes
      .replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
    
    const config = JSON.parse(configStr);
    return config as AppwriteConfigTS;
  } catch (error) {
    MessageFormatter.error("Could not parse TypeScript config", error instanceof Error ? error : new Error(String(error)), { prefix: "Migration" });
    throw new Error('Failed to parse TypeScript configuration file. Please ensure it follows standard format.');
  }
}

function convertToYAMLConfig(config: AppwriteConfigTS): AppwriteConfigYAML {
  // Convert the config to YAML-friendly format
  const yamlConfig: AppwriteConfigYAML = {
    appwriteEndpoint: config.appwriteEndpoint,
    appwriteProject: config.appwriteProject,
    appwriteKey: config.appwriteKey,
    databases: config.databases || [],
    buckets: config.buckets || [],
  };

  // Add optional properties if they exist
  if (config.enableBackups !== undefined) yamlConfig.enableBackups = config.enableBackups;
  if (config.backupInterval !== undefined) yamlConfig.backupInterval = config.backupInterval;
  if (config.backupRetention !== undefined) yamlConfig.backupRetention = config.backupRetention;
  if (config.enableBackupCleanup !== undefined) yamlConfig.enableBackupCleanup = config.enableBackupCleanup;
  if (config.enableMockData !== undefined) yamlConfig.enableMockData = config.enableMockData;
  if (config.documentBucketId !== undefined) yamlConfig.documentBucketId = config.documentBucketId;
  if (config.usersCollectionName !== undefined) yamlConfig.usersCollectionName = config.usersCollectionName;

  // Copy any additional properties
  for (const [key, value] of Object.entries(config)) {
    if (!(key in yamlConfig)) {
      yamlConfig[key] = value;
    }
  }

  return yamlConfig;
}