import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import configSchema from "./configSchema.json" assert { type: "json" };
import type { AppwriteConfig } from "appwrite-utils";
import { findAppwriteConfig } from "./loadConfigs.js";

// Example base configuration using types from appwrite-utils
const baseConfig: AppwriteConfig = {
  appwriteEndpoint: "https://cloud.appwrite.io/v1",
  appwriteProject: "YOUR_PROJECT_ID",
  appwriteKey: "YOUR_API_KEY",
  enableDevDatabase: true,
  enableBackups: true,
  backupInterval: 3600,
  backupRetention: 30,
  enableBackupCleanup: true,
  enableMockData: false,
  enableWipeOtherDatabases: true,
  documentBucketId: "documents",
  usersCollectionName: "Members",
  databases: [
    { $id: "main", name: "Main" },
    { $id: "staging", name: "Staging" },
    { $id: "dev", name: "Development" },
  ],
};

const collectionsConfig: { name: string; content: string }[] = [
  {
    name: "ExampleCollection",
    content: `import { CollectionCreate } from "appwrite-utils";
    
const ExampleCollection: Partial<CollectionCreate> = {
  name: 'ExampleCollection',
  $permissions: [
    { permission: 'read', target: 'any' },
    { permission: 'create', target: 'users' },
    { permission: 'update', target: 'users' },
    { permission: 'delete', target: 'users' }
  ],
  attributes: [
    { key: 'alterEgoName', type: 'string', size: 255, required: false },
    // Add more attributes here
  ],
  indexes: [
    { key: 'alterEgoName_search', type: 'fulltext', attributes: ['alterEgoName'] }
  ],
  importDefs: [
    // Define import definitions here
  ]
};

export default ExampleCollection;`,
  },
  // Add more collections here
];

// Define our YAML files
// Define our YAML files
const configFileExample = `d`;

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

export const createEmptyCollection = (collectionName: string) => {
  const emptyCollection = `import type { CollectionCreate } from "appwrite-utils";

const ${collectionName}: Partial<CollectionCreate> = {
  name: '${collectionName}',
  $permissions: [
    { permission: 'read', target: 'any' },
    { permission: 'create', target: 'users' },
    { permission: 'update', target: 'users' },
    { permission: 'delete', target: 'users' }
  ],
  attributes: [
    // Add more attributes here
  ],
  indexes: [
    // Add more indexes here
  ],
};

export default ${collectionName};`;

  const appwriteConfigPath = findAppwriteConfig(process.cwd());
  if (!appwriteConfigPath) {
    console.error("Failed to find appwriteConfig.ts");
    return;
  }

  const collectionsFolder = path.join(
    path.dirname(appwriteConfigPath),
    "collections"
  );
  const collectionFilePath = path.join(
    collectionsFolder,
    `${collectionName}.ts`
  );
  writeFileSync(collectionFilePath, emptyCollection);
};

export const setupDirsFiles = async (example: boolean = false) => {
  const basePath = process.cwd();
  const srcPath = path.join(basePath);

  // Check if src directory exists in the current working directory
  if (!existsSync(srcPath)) {
    console.error("No 'src' directory found in the current working directory.");
    return;
  }

  const appwriteFolder = path.join(srcPath, "appwrite");
  const appwriteConfigFile = path.join(appwriteFolder, "appwriteConfig.ts");
  const appwriteCustomDefsFile = path.join(
    appwriteFolder,
    "customDefinitions.ts"
  );
  // const appwriteMigrationsFolder = path.join(appwriteFolder, "migrations");
  const appwriteSchemaFolder = path.join(appwriteFolder, "schemas");
  const appwriteDataFolder = path.join(appwriteFolder, "importData");
  const appwriteHiddenFolder = path.join(appwriteFolder, ".appwrite");
  const collectionsFolder = path.join(appwriteFolder, "collections");

  // Directory creation and file writing logic remains the same
  if (!existsSync(appwriteFolder)) {
    mkdirSync(appwriteFolder, { recursive: true });
  }

  if (!existsSync(collectionsFolder)) {
    mkdirSync(collectionsFolder, { recursive: true });
  }

  if (!existsSync(appwriteConfigFile)) {
    if (example) {
      writeFileSync(appwriteConfigFile, configFileExample);
    } else {
      const baseConfigContent = `import { AppwriteConfig } from "appwrite-utils";

const appwriteConfig: AppwriteConfig = ${JSON.stringify(baseConfig, null, 2)};

export default appwriteConfig;
`;
      writeFileSync(appwriteConfigFile, baseConfigContent);
    }
  }

  // Create TypeScript files for each collection
  collectionsConfig.forEach((collection) => {
    const collectionFilePath = path.join(
      collectionsFolder,
      `${collection.name}.ts`
    );
    writeFileSync(collectionFilePath, collection.content);
  });

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
