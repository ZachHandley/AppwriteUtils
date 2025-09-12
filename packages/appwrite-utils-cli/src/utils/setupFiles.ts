import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { AppwriteConfig } from "appwrite-utils";
import { findAppwriteConfig } from "./loadConfigs.js";
import { loadYamlConfig } from "../config/yamlConfig.js";
import { fetchServerVersion, isVersionAtLeast } from "./versionDetection.js";
import { findYamlConfig } from "../config/yamlConfig.js";
import { ID } from "node-appwrite";
import { ulid } from "ulidx";
import { generateYamlConfigTemplate } from "../config/yamlConfig.js";

// Example base configuration using types from appwrite-utils
const baseConfig: AppwriteConfig = {
  appwriteEndpoint: "https://cloud.appwrite.io/v1",
  appwriteProject: "YOUR_PROJECT_ID",
  appwriteKey: "YOUR_API_KEY",
  appwriteClient: null,
  apiMode: "auto", // Enable dual API support - auto-detect TablesDB vs legacy
  logging: {
    enabled: false,
    level: "info",
    console: false,
  },
  enableBackups: true,
  useMigrations: true,
  backupInterval: 3600,
  backupRetention: 30,
  enableBackupCleanup: true,
  enableMockData: false,
  documentBucketId: "documents",
  usersCollectionName: "Members",
  databases: [
    {
      $id: "main",
      name: "Main",
      bucket: {
        $id: "main_bucket",
        name: "Main Bucket",
        enabled: true,
        maximumFileSize: 30000000,
        allowedFileExtensions: [],
        encryption: true,
        antivirus: true,
      },
    },
    {
      $id: "staging",
      name: "Staging",
      bucket: {
        $id: "staging_bucket",
        name: "Staging Bucket",
        enabled: true,
        maximumFileSize: 30000000,
        allowedFileExtensions: [],
        encryption: true,
        antivirus: true,
      },
    },
    {
      $id: "dev",
      name: "Development",
      bucket: {
        $id: "dev_bucket",
        name: "Development Bucket",
        enabled: true,
        maximumFileSize: 30000000,
        allowedFileExtensions: [],
        encryption: true,
        antivirus: true,
      },
    },
  ],
  buckets: [
    {
      $id: "global_bucket",
      name: "Global Bucket",
      enabled: true,
      maximumFileSize: 30000000,
      allowedFileExtensions: [],
      encryption: true,
      antivirus: true,
    },
  ],
};

const collectionsConfig: { name: string; content: string }[] = [
  {
    name: "ExampleCollection",
    content: `import type { CollectionCreate } from "appwrite-utils";
    
const ExampleCollection: Partial<CollectionCreate> = {
  name: 'ExampleCollection',
  $id: '${ulid()}',
  documentSecurity: false,
  enabled: true,
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
  const currentDir = process.cwd();
  
  // Check for YAML config first (preferred)
  const yamlConfigPath = findYamlConfig(currentDir);
  const tsConfigPath = findAppwriteConfig(currentDir);
  
  let configDir: string;
  let isYamlProject = false;
  
  if (yamlConfigPath) {
    configDir = path.dirname(yamlConfigPath);
    isYamlProject = true;
  } else if (tsConfigPath) {
    configDir = path.dirname(tsConfigPath);
    isYamlProject = false;
  } else {
    // No config found - assume .appwrite directory and use YAML as default
    configDir = path.join(currentDir, ".appwrite");
    isYamlProject = true;
    
    // Create .appwrite directory if it doesn't exist
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
  }

  const collectionsFolder = path.join(configDir, "collections");
  if (!existsSync(collectionsFolder)) {
    mkdirSync(collectionsFolder, { recursive: true });
  }

  if (isYamlProject) {
    // Create YAML collection
    const yamlCollection = `# yaml-language-server: $schema=../.yaml_schemas/collection.schema.json
# Collection Definition: ${collectionName}
name: ${collectionName}
id: ${ulid()}
documentSecurity: false
enabled: true
permissions:
  - permission: read
    target: any
  - permission: create
    target: users
  - permission: update
    target: users
  - permission: delete
    target: users
attributes:
  # Add your attributes here
  # Example:
  # - key: title
  #   type: string
  #   size: 255
  #   required: true
  #   description: "The title of the item"
indexes:
  # Add your indexes here
  # Example:
  # - key: title_search
  #   type: fulltext
  #   attributes:
  #     - title
importDefs: []
`;

    const collectionFilePath = path.join(collectionsFolder, `${collectionName}.yaml`);
    writeFileSync(collectionFilePath, yamlCollection);
    console.log(`✨ Created YAML collection: ${collectionFilePath}`);
  } else {
    // Create TypeScript collection
    const emptyCollection = `import type { CollectionCreate } from "appwrite-utils";

const ${collectionName}: Partial<CollectionCreate> = {
  $id: '${ulid()}',
  documentSecurity: false,
  enabled: true,
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

    const collectionFilePath = path.join(collectionsFolder, `${collectionName}.ts`);
    writeFileSync(collectionFilePath, emptyCollection);
    console.log(`✨ Created TypeScript collection: ${collectionFilePath}`);
  }
};

export const generateYamlConfig = (currentDir?: string, useAppwriteDir: boolean = true) => {
  const basePath = currentDir || process.cwd();
  const configDir = useAppwriteDir ? path.join(basePath, ".appwrite") : basePath;
  
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const configPath = path.join(configDir, "config.yaml");
  generateYamlConfigTemplate(configPath);
  
  console.log(`✨ Generated YAML config template at: ${configPath}`);
  console.log("📝 Please update the configuration with your Appwrite project details.");
  
  return configPath;
};

export const setupDirsFiles = async (
  example: boolean = false,
  currentDir?: string,
  useYaml: boolean = true
) => {
  const basePath = currentDir || process.cwd();
  
  // Create .appwrite folder directly in project root
  const appwriteFolder = path.join(basePath, ".appwrite");
  const appwriteConfigFile = path.join(appwriteFolder, "appwriteConfig.ts");
  const appwriteCustomDefsFile = path.join(
    appwriteFolder,
    "customDefinitions.ts"
  );
  const appwriteSchemaFolder = path.join(appwriteFolder, "schemas");
  const appwriteYamlSchemaFolder = path.join(appwriteFolder, ".yaml_schemas");
  const appwriteDataFolder = path.join(appwriteFolder, "importData");
  // Decide between collections or tables folder
  let useTables = false;
  try {
    // Try reading YAML config if present to detect version
    const yamlPath = findYamlConfig(basePath);
    if (yamlPath) {
      const cfg = await loadYamlConfig(yamlPath);
      if (cfg) {
        const ver = await fetchServerVersion(cfg.appwriteEndpoint);
        if (isVersionAtLeast(ver || undefined, '1.8.0')) useTables = true;
      }
    }
  } catch {}
  const targetFolderName = useTables ? "tables" : "collections";
  const collectionsFolder = path.join(appwriteFolder, targetFolderName);

  // Create directory structure
  if (!existsSync(appwriteFolder)) {
    mkdirSync(appwriteFolder, { recursive: true });
  }

  if (!existsSync(collectionsFolder)) {
    mkdirSync(collectionsFolder, { recursive: true });
  }

  // Handle configuration file creation - YAML is now default
  if (useYaml) {
    // Generate YAML config in .appwrite directory
    const configPath = path.join(appwriteFolder, "config.yaml");
    generateYamlConfigTemplate(configPath);
  } else if (!existsSync(appwriteConfigFile)) {
    if (example) {
      writeFileSync(appwriteConfigFile, configFileExample);
    } else {
      const baseConfigContent = `import { type AppwriteConfig } from "appwrite-utils";

const appwriteConfig: AppwriteConfig = ${JSON.stringify(baseConfig, null, 2)};

export default appwriteConfig;
`;
      writeFileSync(appwriteConfigFile, baseConfigContent);
    }
  }

  // Create TypeScript files for each collection only if not using YAML
  if (!useYaml) {
    collectionsConfig.forEach((collection) => {
      const collectionFilePath = path.join(
        collectionsFolder,
        `${collection.name}.ts`
      );
      writeFileSync(collectionFilePath, collection.content);
    });
  }

  // Create YAML collection example if using YAML config
  if (useYaml) {
    const yamlCollectionExample = `# yaml-language-server: $schema=../.yaml_schemas/collection.schema.json
# Example Collection Definition
name: ExampleCollection
id: example_collection_${Date.now()}
documentSecurity: false
enabled: true
permissions:
  - permission: read
    target: any
  - permission: create
    target: users
  - permission: update
    target: users
  - permission: delete
    target: users
attributes:
  - key: title
    type: string
    size: 255
    required: true
    description: "The title of the item"
  - key: description
    type: string
    size: 1000
    required: false
    description: "A longer description"
  - key: isActive
    type: boolean
    required: false
    default: true
indexes:
  - key: title_search
    type: fulltext
    attributes:
      - title
importDefs: []
`;
    const yamlCollectionPath = path.join(collectionsFolder, "ExampleCollection.yaml");
    writeFileSync(yamlCollectionPath, yamlCollectionExample);

    // Create JSON schema for collection definitions
    const collectionJsonSchema = {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "https://appwrite-utils.dev/schemas/collection.schema.json",
      "title": "Appwrite Collection Definition",
      "description": "Schema for defining Appwrite collections in YAML",
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "The name of the collection"
        },
        "id": {
          "type": "string",
          "description": "The ID of the collection (optional, auto-generated if not provided)",
          "pattern": "^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$"
        },
        "documentSecurity": {
          "type": "boolean",
          "default": false,
          "description": "Enable document-level permissions"
        },
        "enabled": {
          "type": "boolean",
          "default": true,
          "description": "Whether the collection is enabled"
        },
        "permissions": {
          "type": "array",
          "description": "Collection-level permissions",
          "items": {
            "type": "object",
            "properties": {
              "permission": {
                "type": "string",
                "enum": ["read", "create", "update", "delete"],
                "description": "The permission type"
              },
              "target": {
                "type": "string",
                "description": "Permission target (e.g., 'any', 'users', 'users/verified', 'label:admin')"
              }
            },
            "required": ["permission", "target"],
            "additionalProperties": false
          }
        },
        "attributes": {
          "type": "array",
          "description": "Collection attributes (fields)",
          "items": {
            "type": "object",
            "properties": {
              "key": {
                "type": "string",
                "description": "Attribute name",
                "pattern": "^[a-zA-Z][a-zA-Z0-9]*$"
              },
              "type": {
                "type": "string",
                "enum": ["string", "integer", "double", "boolean", "datetime", "email", "ip", "url", "enum", "relationship"],
                "description": "Attribute data type"
              },
              "size": {
                "type": "number",
                "description": "Maximum size for string attributes",
                "minimum": 1,
                "maximum": 1073741824
              },
              "required": {
                "type": "boolean",
                "default": false,
                "description": "Whether the attribute is required"
              },
              "array": {
                "type": "boolean",
                "default": false,
                "description": "Whether the attribute is an array"
              },
              "default": {
                "description": "Default value for the attribute"
              },
              "description": {
                "type": "string",
                "description": "Attribute description"
              },
              "min": {
                "type": "number",
                "description": "Minimum value for numeric attributes"
              },
              "max": {
                "type": "number",
                "description": "Maximum value for numeric attributes"
              },
              "elements": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "description": "Allowed values for enum attributes"
              },
              "relatedCollection": {
                "type": "string",
                "description": "Related collection name for relationship attributes"
              },
              "relationType": {
                "type": "string",
                "enum": ["oneToOne", "oneToMany", "manyToOne", "manyToMany"],
                "description": "Type of relationship"
              },
              "twoWay": {
                "type": "boolean",
                "description": "Whether the relationship is bidirectional"
              },
              "twoWayKey": {
                "type": "string",
                "description": "Key name for the reverse relationship"
              },
              "onDelete": {
                "type": "string",
                "enum": ["cascade", "restrict", "setNull"],
                "description": "Action to take when related document is deleted"
              },
              "side": {
                "type": "string",
                "enum": ["parent", "child"],
                "description": "Side of the relationship"
              }
            },
            "required": ["key", "type"],
            "additionalProperties": false,
            "allOf": [
              {
                "if": {
                  "properties": { "type": { "const": "enum" } }
                },
                "then": {
                  "required": ["elements"]
                }
              },
              {
                "if": {
                  "properties": { "type": { "const": "relationship" } }
                },
                "then": {
                  "required": ["relatedCollection", "relationType"]
                }
              }
            ]
          }
        },
        "indexes": {
          "type": "array",
          "description": "Database indexes for the collection",
          "items": {
            "type": "object",
            "properties": {
              "key": {
                "type": "string",
                "description": "Index name"
              },
              "type": {
                "type": "string",
                "enum": ["key", "fulltext", "unique"],
                "description": "Index type"
              },
              "attributes": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "description": "Attributes to index",
                "minItems": 1
              },
              "orders": {
                "type": "array",
                "items": {
                  "type": "string",
                  "enum": ["ASC", "DESC"]
                },
                "description": "Sort order for each attribute"
              }
            },
            "required": ["key", "type", "attributes"],
            "additionalProperties": false
          }
        },
        "importDefs": {
          "type": "array",
          "description": "Import definitions for data migration",
          "default": []
        }
      },
      "required": ["name"],
      "additionalProperties": false
    };

    // Ensure YAML schemas directory exists before writing schema
    if (!existsSync(appwriteYamlSchemaFolder)) {
      mkdirSync(appwriteYamlSchemaFolder, { recursive: true });
    }
    
    const collectionSchemaPath = path.join(appwriteYamlSchemaFolder, "collection.schema.json");
    writeFileSync(collectionSchemaPath, JSON.stringify(collectionJsonSchema, null, 2));

    // Create JSON schema for appwriteConfig.yaml
    const configJsonSchema = {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "https://appwrite-utils.dev/schemas/appwrite-config.schema.json",
      "title": "Appwrite Configuration",
      "description": "Schema for Appwrite project configuration in YAML",
      "type": "object",
      "properties": {
        "appwrite": {
          "type": "object",
          "description": "Appwrite connection settings",
          "properties": {
            "endpoint": {
              "type": "string",
              "default": "https://cloud.appwrite.io/v1",
              "description": "Appwrite server endpoint URL"
            },
            "project": {
              "type": "string",
              "description": "Appwrite project ID"
            },
            "key": {
              "type": "string",
              "description": "Appwrite API key with appropriate permissions"
            }
          },
          "required": ["project", "key"],
          "additionalProperties": false
        },
        "logging": {
          "type": "object",
          "description": "Logging configuration",
          "properties": {
            "enabled": {
              "type": "boolean",
              "default": false,
              "description": "Enable file logging"
            },
            "level": {
              "type": "string",
              "enum": ["error", "warn", "info", "debug"],
              "default": "info",
              "description": "Logging level"
            },
            "directory": {
              "type": "string",
              "description": "Custom log directory path (optional)"
            },
            "console": {
              "type": "boolean",
              "default": false,
              "description": "Enable console logging"
            }
          },
          "additionalProperties": false
        },
        "backups": {
          "type": "object",
          "description": "Backup configuration",
          "properties": {
            "enabled": {
              "type": "boolean",
              "default": true,
              "description": "Enable automatic backups"
            },
            "interval": {
              "type": "number",
              "default": 3600,
              "description": "Backup interval in seconds"
            },
            "retention": {
              "type": "number",
              "default": 30,
              "description": "Backup retention in days"
            },
            "cleanup": {
              "type": "boolean",
              "default": true,
              "description": "Enable automatic backup cleanup"
            }
          },
          "additionalProperties": false
        },
        "data": {
          "type": "object",
          "description": "Data management settings",
          "properties": {
            "enableMockData": {
              "type": "boolean",
              "default": false,
              "description": "Enable mock data generation"
            },
            "documentBucketId": {
              "type": "string",
              "default": "documents",
              "description": "Default bucket ID for document attachments"
            },
            "usersCollectionName": {
              "type": "string",
              "default": "Members",
              "description": "Name of the users/members collection"
            },
            "importDirectory": {
              "type": "string",
              "default": "importData",
              "description": "Directory containing import data files"
            }
          },
          "additionalProperties": false
        },
        "schemas": {
          "type": "object",
          "description": "Schema generation settings",
          "properties": {
            "outputDirectory": {
              "type": "string",
              "default": "schemas",
              "description": "Directory where generated schemas are saved"
            },
            "yamlSchemaDirectory": {
              "type": "string",
              "default": ".yaml_schemas",
              "description": "Directory containing YAML validation schemas"
            }
          },
          "additionalProperties": false
        },
        "migrations": {
          "type": "object",
          "description": "Migration settings",
          "properties": {
            "enabled": {
              "type": "boolean",
              "default": true,
              "description": "Enable migration tracking database"
            }
          },
          "additionalProperties": false
        },
        "databases": {
          "type": "array",
          "description": "Database configurations",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "description": "Database ID",
                "pattern": "^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$"
              },
              "name": {
                "type": "string",
                "description": "Database display name"
              },
              "bucket": {
                "type": "object",
                "description": "Associated storage bucket",
                "properties": {
                  "id": {
                    "type": "string",
                    "description": "Bucket ID"
                  },
                  "name": {
                    "type": "string",
                    "description": "Bucket display name"
                  },
                  "permissions": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "description": "Bucket permissions"
                  },
                  "fileSecurity": {
                    "type": "boolean",
                    "description": "Enable file-level security"
                  },
                  "enabled": {
                    "type": "boolean",
                    "default": true,
                    "description": "Enable the bucket"
                  },
                  "maximumFileSize": {
                    "type": "number",
                    "default": 30000000,
                    "description": "Maximum file size in bytes"
                  },
                  "allowedFileExtensions": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "description": "Allowed file extensions (empty = all allowed)"
                  },
                  "compression": {
                    "type": "string",
                    "enum": ["none", "gzip", "zstd"],
                    "default": "none",
                    "description": "Compression algorithm"
                  },
                  "encryption": {
                    "type": "boolean",
                    "default": false,
                    "description": "Enable file encryption"
                  },
                  "antivirus": {
                    "type": "boolean",
                    "default": false,
                    "description": "Enable antivirus scanning"
                  }
                },
                "required": ["id", "name"],
                "additionalProperties": false
              }
            },
            "required": ["id", "name"],
            "additionalProperties": false
          }
        },
        "buckets": {
          "type": "array",
          "description": "Global storage buckets",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "description": "Bucket ID"
              },
              "name": {
                "type": "string",
                "description": "Bucket display name"
              },
              "permissions": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "description": "Bucket permissions"
              },
              "fileSecurity": {
                "type": "boolean",
                "description": "Enable file-level security"
              },
              "enabled": {
                "type": "boolean",
                "default": true,
                "description": "Enable the bucket"
              },
              "maximumFileSize": {
                "type": "number",
                "default": 30000000,
                "description": "Maximum file size in bytes"
              },
              "allowedFileExtensions": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "description": "Allowed file extensions (empty = all allowed)"
              },
              "compression": {
                "type": "string",
                "enum": ["none", "gzip", "zstd"],
                "default": "none",
                "description": "Compression algorithm"
              },
              "encryption": {
                "type": "boolean",
                "default": false,
                "description": "Enable file encryption"
              },
              "antivirus": {
                "type": "boolean",
                "default": false,
                "description": "Enable antivirus scanning"
              }
            },
            "required": ["id", "name"],
            "additionalProperties": false
          }
        },
        "functions": {
          "type": "array",
          "description": "Appwrite Functions",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "description": "Function ID"
              },
              "name": {
                "type": "string",
                "description": "Function name"
              },
              "runtime": {
                "type": "string",
                "description": "Runtime environment"
              },
              "execute": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "description": "Execution permissions"
              },
              "events": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "description": "Event triggers"
              },
              "schedule": {
                "type": "string",
                "description": "Cron schedule"
              },
              "timeout": {
                "type": "number",
                "default": 15,
                "description": "Execution timeout in seconds"
              },
              "enabled": {
                "type": "boolean",
                "default": true,
                "description": "Enable the function"
              },
              "logging": {
                "type": "boolean",
                "default": true,
                "description": "Enable function logging"
              },
              "entrypoint": {
                "type": "string",
                "description": "Function entrypoint file"
              },
              "commands": {
                "type": "string",
                "description": "Build commands"
              }
            },
            "required": ["id", "name", "runtime"],
            "additionalProperties": false
          }
        }
      },
      "required": ["appwrite"],
      "additionalProperties": false
    };

    const configSchemaPath = path.join(appwriteYamlSchemaFolder, "appwrite-config.schema.json");
    writeFileSync(configSchemaPath, JSON.stringify(configJsonSchema, null, 2));
  }

  if (!existsSync(appwriteSchemaFolder)) {
    mkdirSync(appwriteSchemaFolder, { recursive: true });
  }

  if (!existsSync(appwriteDataFolder)) {
    mkdirSync(appwriteDataFolder, { recursive: true });
  }

  // Remove the nested .appwrite folder creation since we're using .appwrite as the main folder

  const configType = useYaml ? "YAML" : "TypeScript";
  console.log(`✨ Created ${configType} config and setup files/directories in .appwrite/ folder.`);
  
  if (useYaml) {
    console.log("🔧 You can now configure your project in .appwrite/config.yaml");
    console.log("📁 Collections can be defined in .appwrite/collections/ as .ts or .yaml files");
    console.log("📊 Schemas will be generated in .appwrite/schemas/");
    console.log("📦 Import data can be placed in .appwrite/importData/");
  } else {
    console.log("🔧 You can now configure logging in your .appwrite/appwriteConfig.ts file:");
    console.log("   logging: {");
    console.log("     enabled: true,");
    console.log("     level: 'info',");
    console.log("     console: true,");
    console.log("     logDirectory: './logs'  // optional custom directory");
    console.log("   }");
  }
};
