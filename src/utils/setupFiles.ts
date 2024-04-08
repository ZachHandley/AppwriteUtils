import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import configSchema from "./configSchema.json";

// Define our YAML files
// Define our YAML files
const configFile = `# yaml-language-server: $schema=./.appwrite/appwriteUtilsConfigSchema.json
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
  - name: 'Members'
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
        size: 255
        required: true
      - key: 'email'
        type: 'string'
        size: 255
        required: false
      - key: 'idOrig'
        type: 'string'
        size: 255
        required: false
      - key: 'dogs'
        type: 'relationship'
        relatedCollection: 'Dogs'
        relationType: 'oneToMany'
        twoWay: true
        twoWayKey: 'owner'
        side: 'parent'
        onDelete: 'cascade'
        importMapping: { originalIdField: 'idOrig', targetField: 'ownerId' }
    indexes:
      - key: 'name_index'
        type: 'key'
        attributes: ['name']
    importDefs:
      - filePath: 'importData/members.json'
        basePath: 'RECORDS'
        attributeMappings:
          idMapping:
            oldKey: 'id'
            targetKey: 'idOrig'
          name:
            oldKey: 'name'
            targetKey: 'name'
          email:
            oldKey: 'email'
            targetKey: 'email'
  - name: 'Dogs'
    attributes:
      - key: 'name'
        type: 'string'
        size: 255
        required: true
      - key: 'breed'
        type: 'string'
        size: 255
        required: false
      - key: 'age'
        type: 'integer'
        required: false
        min: 0
        max: 100
      - key: 'ownerIdOrig'
        type: 'string'
        size: 255
        required: false
      - key: 'owner'
        type: 'relationship'
        relatedCollection: 'Members'
        relationType: 'manyToOne'
        twoWay: true
        twoWayKey: 'dogs'
        side: 'child'
        onDelete: 'cascade'
    indexes:
      - key: 'ownerIdIndex'
        type: 'key'
        attributes: ['ownerIdOrig']
    importDefs:
      - filePath: 'importData/dogs.json'
        basePath: 'RECORDS'
        attributeMappings:
          - oldKey: 'id'
          targetKey: '$id'
          - oldKey: 'name'
          targetKey: 'name'
          - oldKey: 'breed'
          targetKey: 'breed'
          - oldKey: 'age'
            targetKey: 'age'
          - oldKey: 'ownerId'
            targetKey: 'ownerIdOrig'`;

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
  const appwriteDataFolder = path.join(appwriteFolder, "importData");
  const appwriteHiddenFolder = path.join(appwriteFolder, ".appwrite");

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

  if (!existsSync(appwriteDataFolder)) {
    mkdirSync(appwriteDataFolder, { recursive: true });
  }

  if (!existsSync(appwriteHiddenFolder)) {
    mkdirSync(appwriteHiddenFolder, { recursive: true });
  }
  const schemaFilePath = path.join(
    appwriteHiddenFolder,
    "appwriteUtilsConfigSchema.json"
  );
  writeFileSync(schemaFilePath, JSON.stringify(configSchema, undefined, 4));

  console.log("Created config and setup files/directories successfully.");
};
