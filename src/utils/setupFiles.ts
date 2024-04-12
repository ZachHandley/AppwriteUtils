import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import configSchema from "./configSchema.json" assert { type: "json" };

// Define our YAML files
// Define our YAML files
const configFileExample = `# yaml-language-server: $schema=./.appwrite/appwriteUtilsConfigSchema.json
# Appwrite configuration settings
appwriteEndpoint: 'https://cloud.appwrite.io/v1' # Your Appwrite endpoint. Default: 'https://cloud.appwrite.io/v1'
appwriteProject: 'YOUR_PROJECT_ID' # Your Appwrite project ID
appwriteKey: 'YOUR_API_KEY' # Your Appwrite API key (needs storage and databases at minimum)
appwriteClient: null # Your Appwrite client -- don't worry about this
enableDevDatabase: true # Enable development database alongside main
enableBackups: true # Enable backups
backupInterval: 3600 # Backup interval in seconds
backupRetention: 30 # Backup retention in days
enableBackupCleanup: true # Enable backup cleanup
enableMockData: false # Enable mock data generation
enableWipeOtherDatabases: true # Enable wiping other databases
documentBucketId: 'documents' # Your Appwrite bucket ID for documents
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
      - permission: read
        target: any
      - permission: create
        target: users
      - permission: update
        target: users
      - permission: delete
        target: users
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
        importMapping: { originalIdField: 'idOrig', targetField: 'ownerIdOrig' }
      - key: 'dogIds'
        type: 'string'
        size: 255
        array: true
      - key: 'profilePhoto'
        type: 'string'
        size: 255
        required: false
      - key: 'profilePhotoTest'
        type: 'string'
        size: 255
        required: false
    indexes:
      - key: 'name_index'
        type: 'key'
        attributes: ['name']
    importDefs:
      - filePath: 'importData/members.json'
        basePath: 'RECORDS'
        attributeMappings:
          - oldKey: 'id'
            targetKey: 'idOrig'
            converters: ['anyToString']
            postImportActions:
              - action: 'checkAndUpdateFieldInDocument'
                params:
                  - "{dbId}"
                  - "{collId}"
                  - "{docId}"
                  - "idOrig"
                  - "{id}"
                  - "{$id}"
          - oldKey: 'name'
            targetKey: 'name'
          - oldKey: 'email'
            targetKey: 'email'
          - oldKey: 'doesntMatter'
            targetKey: 'profilePhoto'
            fileData: { name: "profilePhoto_{id}", path: "importData/profilePhotos" }
          - oldKey: 'photoUrl'
            targetKey: 'profilePhotoTest'
            fileData: { name: "profilePhotoTest_{id}", path: "{photoUrl}" }
  - name: 'Dogs'
    $permissions:
      - permission: read
        target: any
      - permission: create
        target: users
      - permission: update
        target: users
      - permission: delete
        target: users
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
      - key: 'idOrig'
        type: 'string'
        size: 20
        required: false
      - key: 'ownerIdOrig'
        type: 'string'
        size: 255
        required: false
      - key: 'vetRecords'
        type: 'string'
        size: 255
        required: false
      - key: 'vetRecordIds'
        type: 'string'
        size: 255
        array: true
        required: false
    indexes:
      - key: 'ownerIdIndex'
        type: 'key'
        attributes: ['ownerIdOrig']
    importDefs:
      - filePath: 'importData/dogs.json'
        basePath: 'RECORDS'
        attributeMappings:
          - oldKey: 'id'
            targetKey: 'idOrig'
          - oldKey: 'name'
            targetKey: 'name'
          - oldKey: 'breed'
            targetKey: 'breed'
          - oldKey: 'age'
            targetKey: 'age'
          - oldKey: 'ownerId'
            targetKey: 'ownerIdOrig'
          - oldKey: 'vetRecords'
            targetKey: 'vetRecords'
            converters: ['stringifyObject']
          - oldKey: 'vetRecords.[any].id'
            targetKey: 'vetRecordIds'
            converters: ['anyToStringArray']
      - filePath: 'importData/dogs.json'
        basePath: 'RECORDS'
        type: 'update'
        updateMapping: { originalIdField: 'id', targetField: 'idOrig' }
        attributeMappings:
          - oldKey: 'name'
            targetKey: 'name'
          - oldKey: 'breed'
            targetKey: 'breed'
          - oldKey: 'age'
            targetKey: 'age'`;

const configFile = `# yaml-language-server: $schema=./.appwrite/appwriteUtilsConfigSchema.json
# Basic Appwrite configuration settings
appwriteEndpoint: 'https://cloud.appwrite.io/v1' # Your Appwrite endpoint
appwriteProject: 'YOUR_PROJECT_ID' # Your Appwrite project ID
appwriteKey: 'YOUR_API_KEY' # Your Appwrite API key (needs storage and databases at minimum)
enableDevDatabase: true # Enable development database alongside main. Default: true
enableBackups: true # Enable backups. Default: true
backupInterval: 3600 # Backup interval in seconds. Default: 3600 - DOES NOTHING RIGHT NOW
backupRetention: 30 # Backup retention in days. Default: 30 - DOES NOTHING RIGHT NOW
enableBackupCleanup: true # Enable backup cleanup. Default: true - DOES NOTHING RIGHT NOW
enableMockData: false # Enable mock data generation. Default: false - DOES NOTHING RIGHT NOW
enableWipeOtherDatabases: true # Enable wiping other databases. Default: true
# Databases configuration
# The first one is *always* Production
# The second is *always* Staging
# The third is *always* Development
# They are found by name matching (without spaces and all lowercase), not $id
# If no $id is included for anything defined, Appwrite will auto-generate one in its stead
databases:
  - $id: 'main' # Database ID
    name: 'Main' # Database name
  - $id: 'staging'
    name: 'Staging'
  - $id: 'dev'
    name: 'Development'

# Collections configuration
collections:
  - name: 'ExampleCollection' # Collection name
    $permissions: # Permissions for the collection
      - permission: read # Permission type
        target: any # Permission target
      - permission: create
        target: users
      - permission: update
        target: users
      - permission: delete
        target: users
    attributes: # Attributes of the collection
      - key: 'exampleKey' # Attribute key
        type: 'string' # Attribute type
        size: 255 # Size of the attribute (for strings)
        required: true # Whether the attribute is required`;

export const customDefinitionsFile = `import type { ConverterFunctions, ValidationRules, AfterImportActions } from "appwrite-utils";

export const customConverterFunctions: ConverterFunctions = {
  // Add your custom converter functions here
}
export const customValidationRules: ValidationRules = {
  // Add your custom validation rules here
}
export const customAfterImportActions: AfterImportActions = {
  // Add your custom after import actions here
}`;

export const setupDirsFiles = async (example: boolean = false) => {
  const basePath = process.cwd();
  const srcPath = path.join(basePath, "src");

  // Check if src directory exists in the current working directory
  if (!existsSync(srcPath)) {
    console.error("No 'src' directory found in the current working directory.");
    return;
  }

  const appwriteFolder = path.join(srcPath, "appwrite");
  const appwriteConfigFile = path.join(appwriteFolder, "appwriteConfig.yaml");
  const appwriteCustomDefsFile = path.join(
    appwriteFolder,
    "customDefinitions.ts"
  );
  // const appwriteMigrationsFolder = path.join(appwriteFolder, "migrations");
  const appwriteSchemaFolder = path.join(appwriteFolder, "schemas");
  const appwriteDataFolder = path.join(appwriteFolder, "importData");
  const appwriteHiddenFolder = path.join(appwriteFolder, ".appwrite");

  // Directory creation and file writing logic remains the same
  if (!existsSync(appwriteFolder)) {
    mkdirSync(appwriteFolder, { recursive: true });
  }

  if (!existsSync(appwriteConfigFile)) {
    if (example) {
      writeFileSync(appwriteConfigFile, configFileExample);
    } else {
      writeFileSync(appwriteConfigFile, configFile);
    }
  }

  if (!existsSync(appwriteCustomDefsFile)) {
    writeFileSync(appwriteCustomDefsFile, customDefinitionsFile);
  }

  // if (!existsSync(appwriteMigrationsFolder)) {
  //   mkdirSync(appwriteMigrationsFolder, { recursive: true });
  // }

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
  writeFileSync(schemaFilePath, JSON.stringify(configSchema, undefined, 2));

  console.log("Created config and setup files/directories successfully.");
};
