import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";

// Define our YAML files
// Define our YAML files
const configFile = `# appwriteConfig.yaml
appwriteEndpoint: 'https://cloud.appwrite.io/v1' # Your Appwrite endpoint
appwriteProject: 'YOUR_PROJECT_ID' # Your Appwrite project
appwriteKey: 'YOUR_API_KEY' # Your Appwrite API key (needs storage and databases at minimum)
appwriteClient: null # Your Appwrite client -- don't worry about this
enableDevDatabase: true # Enable development database alongside main
enableBackups: true # Enable backups
backupInterval: 3600 # Backup interval in seconds
backupRetention: 30 # Backup retention in days
enableBackupCleanup: true # Enable backup cleanup
enableLocalImport: false # Enable local import
enableMockData: false # Enable mock data generation
enableWipeOtherDatabases: true # Enable wiping other databases
databases:
  - $id: 'main'
    name: 'Main'
  - $id: 'staging'
    name: 'Staging'
  - $id: 'dev'
    name: 'Development'
collections:
  - $id: 'exampleCollection'
    name: 'Example Collection'
    $permissions:
      read:
        - any
      create:
        - users
      update:
        - users
      delete:
        - users
    attributes:
      - key: 'name'
        type: 'string'
        size: 50
        required: true
    indexes:
      - key: 'name_index'
        type: 'key'
        attributes: ['name']
    importDefs:
      - filePath: 'path/to/your/data.json'
        basePath: 'RECORDS'
        attributeMappings:
          _id:
            oldKey: '_id'
            targetKey: 'oldId'
            converters: ['anyNumToString']
            postImportActions: ['checkAndUpdateFieldInDocument']
          someName:
            oldKey: 'someName'
            targetKey: 'name'
            converters: []
            validationActions: ['checkStringLength']
          councilId:
            oldKey: 'councilId'
            targetKey: 'councilId'
            converters: ['anyNumToString']
            postImportActions: ['updateCreatedDocument']`;

const schemaFile = `import { ID, IndexType } from "node-appwrite";
import { AppwriteConfigSchema } from "./migrations/schema";`;

export const setupDirsFiles = async () => {
  const basePath = process.cwd();
  const srcPath = path.join(basePath, "src");

  // Check if src directory exists in the current working directory
  if (!existsSync(srcPath)) {
    console.error("No 'src' directory found in the current working directory.");
    return;
  }

  const appwriteFolder = path.join(srcPath, "appwrite");
  const appwriteConfigFile = path.join(appwriteFolder, "appwriteConfig.yaml");

  const appwriteConfigFolder = path.join(appwriteFolder, "migrations");
  const appwriteSchemaFolder = path.join(appwriteFolder, "schemas");

  // Directory creation and file writing logic remains the same
  if (!existsSync(appwriteFolder)) {
    mkdirSync(appwriteFolder, { recursive: true });
  }

  if (!existsSync(appwriteConfigFile)) {
    writeFileSync(appwriteConfigFile, configFile);
  }

  if (!existsSync(appwriteConfigFolder)) {
    mkdirSync(appwriteConfigFolder, { recursive: true });
  }

  if (!existsSync(appwriteSchemaFolder)) {
    mkdirSync(appwriteSchemaFolder, { recursive: true });
  }

  console.log("Created config and setup files/directories successfully.");
};
