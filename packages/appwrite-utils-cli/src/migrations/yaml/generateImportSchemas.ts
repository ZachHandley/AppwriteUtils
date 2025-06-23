import fs from "fs";
import path from "path";
import { logger } from "../../shared/logging.js";

/**
 * Generates JSON Schema for YAML import configurations.
 * Provides IntelliSense support for YAML files in IDEs.
 */
export function generateImportConfigSchema(): any {
  return {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://appwrite-utils.dev/schemas/import-config.schema.json",
    "title": "Appwrite Import Configuration",
    "description": "YAML configuration for importing data into Appwrite collections",
    "type": "object",
    "properties": {
      "source": {
        "type": "object",
        "description": "Data source configuration",
        "properties": {
          "file": {
            "type": "string",
            "description": "Path to the data file relative to .appwrite directory",
            "examples": ["importData/users.json", "data/products.csv"]
          },
          "basePath": {
            "type": "string",
            "description": "JSON path to the data array (e.g., 'RECORDS')",
            "examples": ["RECORDS", "data", "items"]
          },
          "type": {
            "type": "string",
            "enum": ["json", "csv", "yaml"],
            "default": "json",
            "description": "Source file type"
          }
        },
        "required": ["file"],
        "additionalProperties": false
      },
      "target": {
        "type": "object",
        "description": "Target collection configuration",
        "properties": {
          "collection": {
            "type": "string",
            "description": "Name of the target collection",
            "examples": ["Users", "Products", "Orders"]
          },
          "type": {
            "type": "string",
            "enum": ["create", "update"],
            "default": "create",
            "description": "Import operation type"
          },
          "primaryKey": {
            "type": "string",
            "default": "id",
            "description": "Primary key field name in source data"
          },
          "createUsers": {
            "type": "boolean",
            "default": false,
            "description": "Whether to create user accounts for user collections"
          }
        },
        "required": ["collection"],
        "additionalProperties": false
      },
      "mapping": {
        "type": "object",
        "description": "Field mapping and transformation configuration",
        "properties": {
          "attributes": {
            "type": "array",
            "description": "Field mapping configuration",
            "items": {
              "$ref": "#/$defs/attributeMapping"
            }
          },
          "relationships": {
            "type": "array",
            "description": "Relationship mappings between collections",
            "items": {
              "$ref": "#/$defs/relationshipMapping"
            },
            "default": []
          }
        },
        "required": ["attributes"],
        "additionalProperties": false
      },
      "options": {
        "type": "object",
        "description": "Import options and settings",
        "properties": {
          "batchSize": {
            "type": "number",
            "minimum": 1,
            "maximum": 1000,
            "default": 50,
            "description": "Batch size for processing"
          },
          "skipValidation": {
            "type": "boolean",
            "default": false,
            "description": "Skip data validation during import"
          },
          "dryRun": {
            "type": "boolean",
            "default": false,
            "description": "Perform dry run without actual import"
          },
          "continueOnError": {
            "type": "boolean",
            "default": true,
            "description": "Continue processing if individual items fail"
          },
          "updateMapping": {
            "type": "object",
            "description": "Configuration for update operations",
            "properties": {
              "originalIdField": {
                "type": "string",
                "description": "Field in source data for matching existing records"
              },
              "targetField": {
                "type": "string",
                "description": "Field in collection to match against"
              }
            },
            "required": ["originalIdField", "targetField"],
            "additionalProperties": false
          }
        },
        "additionalProperties": false
      }
    },
    "required": ["source", "target", "mapping"],
    "additionalProperties": false,
    "$defs": {
      "attributeMapping": {
        "type": "object",
        "description": "Single field mapping configuration",
        "properties": {
          "oldKey": {
            "type": "string",
            "description": "Source field name"
          },
          "oldKeys": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Multiple source field names (alternative to oldKey)"
          },
          "targetKey": {
            "type": "string",
            "description": "Target field name in collection"
          },
          "valueToSet": {
            "description": "Static value to set (alternative to oldKey/oldKeys)"
          },
          "fileData": {
            "type": "object",
            "description": "File handling configuration",
            "properties": {
              "path": {
                "type": "string",
                "description": "File path template (supports {field} placeholders)",
                "examples": ["{avatar_url}", "assets/profiles/{user_id}.jpg", "files/{filename}"]
              },
              "name": {
                "type": "string",
                "description": "File name template (supports {field} placeholders)",
                "examples": ["{firstName}_{lastName}_avatar", "{productName}_image", "{timestamp}_{filename}"]
              }
            },
            "required": ["path", "name"],
            "additionalProperties": false
          },
          "converters": {
            "type": "array",
            "items": {
              "type": "string",
              "enum": [
                "anyToString",
                "anyToNumber",
                "anyToBoolean",
                "anyToDate",
                "stringToLowerCase",
                "stringToUpperCase",
                "stringTrim",
                "numberToString",
                "booleanToString",
                "dateToString",
                "dateToTimestamp",
                "timestampToDate",
                "arrayToString",
                "stringToArray",
                "removeNulls",
                "removeEmpty"
              ]
            },
            "description": "Converter function names",
            "default": []
          },
          "validation": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "rule": {
                  "type": "string",
                  "enum": [
                    "required",
                    "email",
                    "url",
                    "phone",
                    "minLength",
                    "maxLength",
                    "pattern",
                    "numeric",
                    "positive",
                    "negative",
                    "integer",
                    "double",
                    "boolean",
                    "date",
                    "array",
                    "object"
                  ],
                  "description": "Validation rule name"
                },
                "params": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "description": "Validation parameters with {field} placeholders"
                }
              },
              "required": ["rule", "params"],
              "additionalProperties": false
            },
            "description": "Validation rules",
            "default": []
          },
          "afterImport": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "action": {
                  "type": "string",
                  "enum": [
                    "createFileAndUpdateField",
                    "updateCreatedDocument",
                    "checkAndUpdateFieldInDocument",
                    "setFieldFromOtherCollectionDocument",
                    "setFieldFromOtherCollectionDocuments",
                    "setTargetFieldFromOtherCollectionDocumentsByMatchingField",
                    "createOrGetBucket"
                  ],
                  "description": "Post-import action name"
                },
                "params": {
                  "type": "array",
                  "items": {
                    "oneOf": [
                      { "type": "string" },
                      { "type": "object" }
                    ]
                  },
                  "description": "Action parameters (supports {field} placeholders)"
                }
              },
              "required": ["action", "params"],
              "additionalProperties": false
            },
            "description": "Actions to execute after import",
            "default": []
          }
        },
        "required": ["targetKey"],
        "oneOf": [
          { "required": ["oldKey"] },
          { "required": ["oldKeys"] },
          { "required": ["valueToSet"] }
        ],
        "additionalProperties": false
      },
      "relationshipMapping": {
        "type": "object",
        "description": "Relationship mapping between collections",
        "properties": {
          "sourceField": {
            "type": "string",
            "description": "Source field containing old ID"
          },
          "targetField": {
            "type": "string",
            "description": "Target field to set new ID"
          },
          "targetCollection": {
            "type": "string",
            "description": "Collection to find new ID in"
          },
          "fieldToSet": {
            "type": "string",
            "description": "Field to set (defaults to sourceField)"
          },
          "targetFieldToMatch": {
            "type": "string",
            "description": "Field to match in target collection (defaults to targetField)"
          }
        },
        "required": ["sourceField", "targetField", "targetCollection"],
        "additionalProperties": false
      }
    }
  };
}

/**
 * Creates all necessary schema files for YAML import configurations.
 * 
 * @param appwriteFolderPath - Path to the .appwrite directory
 */
export async function createImportSchemas(appwriteFolderPath: string): Promise<void> {
  const yamlSchemasDir = path.join(appwriteFolderPath, ".yaml_schemas");
  
  // Ensure directory exists
  if (!fs.existsSync(yamlSchemasDir)) {
    fs.mkdirSync(yamlSchemasDir, { recursive: true });
  }

  // Generate and write import config schema
  const importConfigSchema = generateImportConfigSchema();
  const importSchemaPath = path.join(yamlSchemasDir, "import-config.schema.json");
  
  fs.writeFileSync(importSchemaPath, JSON.stringify(importConfigSchema, null, 2));
  logger.info(`Created import configuration schema: ${importSchemaPath}`);

  // Create schema index file for easy reference
  const schemaIndex = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://appwrite-utils.dev/schemas/index.json",
    "title": "Appwrite Utils Schema Index",
    "description": "Index of all available schemas for Appwrite Utils YAML configurations",
    "type": "object",
    "properties": {
      "schemas": {
        "type": "object",
        "properties": {
          "collection": {
            "type": "string",
            "const": "./collection.schema.json",
            "description": "Schema for collection definitions"
          },
          "appwriteConfig": {
            "type": "string", 
            "const": "./appwrite-config.schema.json",
            "description": "Schema for main Appwrite configuration"
          },
          "importConfig": {
            "type": "string",
            "const": "./import-config.schema.json", 
            "description": "Schema for import configurations"
          }
        }
      }
    }
  };

  const indexPath = path.join(yamlSchemasDir, "index.json");
  fs.writeFileSync(indexPath, JSON.stringify(schemaIndex, null, 2));
  logger.info(`Created schema index: ${indexPath}`);
}

/**
 * Generates example YAML import configurations.
 * 
 * @param appwriteFolderPath - Path to the .appwrite directory
 */
export async function createImportExamples(appwriteFolderPath: string): Promise<void> {
  const importDir = path.join(appwriteFolderPath, "import");
  const examplesDir = path.join(importDir, "examples");
  
  // Ensure directories exist
  if (!fs.existsSync(examplesDir)) {
    fs.mkdirSync(examplesDir, { recursive: true });
  }

  // User import example
  const userImportExample = `# yaml-language-server: $schema=../.yaml_schemas/import-config.schema.json
# User Import Configuration Example

source:
  file: "importData/users.json"
  basePath: "RECORDS"
  type: "json"

target:
  collection: "Users"
  type: "create"
  primaryKey: "user_id"
  createUsers: true

mapping:
  attributes:
    - oldKey: "user_id"
      targetKey: "userId"
      converters: ["anyToString"]
      validation:
        - rule: "required"
          params: ["{userId}"]

    - oldKey: "email"
      targetKey: "email"
      converters: ["anyToString", "stringToLowerCase"]
      validation:
        - rule: "email"
          params: ["{email}"]
        - rule: "required"
          params: ["{email}"]

    - oldKey: "full_name"
      targetKey: "name"
      converters: ["anyToString", "stringTrim"]

    - oldKey: "profile_image_url"
      targetKey: "avatar"
      fileData:
        path: "{profile_image_url}"
        name: "{user_id}_avatar"
      afterImport:
        - action: "createFileAndUpdateField"
          params: ["{dbId}", "{collId}", "{docId}", "avatar", "{bucketId}", "{filePath}", "{fileName}"]

    - oldKey: "phone_number"
      targetKey: "phone"
      converters: ["anyToString"]
      validation:
        - rule: "phone"
          params: ["{phone}"]

    - oldKey: "is_active"
      targetKey: "status"
      converters: ["anyToBoolean"]

  relationships: []

options:
  batchSize: 25
  skipValidation: false
  dryRun: false
  continueOnError: true
`;

  // Product import example with relationships
  const productImportExample = `# yaml-language-server: $schema=../.yaml_schemas/import-config.schema.json
# Product Import Configuration Example

source:
  file: "importData/products.json"
  basePath: "products"
  type: "json"

target:
  collection: "Products"
  type: "create"
  primaryKey: "product_id"
  createUsers: false

mapping:
  attributes:
    - oldKey: "product_id"
      targetKey: "productId"
      converters: ["anyToString"]

    - oldKey: "name"
      targetKey: "name"
      converters: ["anyToString", "stringTrim"]
      validation:
        - rule: "required"
          params: ["{name}"]
        - rule: "minLength"
          params: ["{name}", "3"]

    - oldKey: "description"
      targetKey: "description"
      converters: ["anyToString"]

    - oldKey: "price"
      targetKey: "price"
      converters: ["anyToNumber"]
      validation:
        - rule: "numeric"
          params: ["{price}"]
        - rule: "positive"
          params: ["{price}"]

    - oldKey: "category_id"
      targetKey: "categoryId"
      converters: ["anyToString"]

    - oldKey: "image_urls"
      targetKey: "images"
      fileData:
        path: "assets/products/{product_id}/"
        name: "product_{product_id}_{index}"
      afterImport:
        - action: "createFileAndUpdateField"
          params: ["{dbId}", "{collId}", "{docId}", "images", "{bucketId}", "{filePath}", "{fileName}"]

    - valueToSet: "active"
      targetKey: "status"

  relationships:
    - sourceField: "category_id"
      targetField: "categoryId"
      targetCollection: "Categories"
      fieldToSet: "categoryId"

    - sourceField: "vendor_id"
      targetField: "vendorId"
      targetCollection: "Vendors"

options:
  batchSize: 50
  skipValidation: false
  dryRun: false
  continueOnError: true
`;

  // Update example
  const updateExample = `# yaml-language-server: $schema=../.yaml_schemas/import-config.schema.json
# Update Configuration Example

source:
  file: "importData/user_updates.json"
  type: "json"

target:
  collection: "Users"
  type: "update"
  primaryKey: "user_id"

mapping:
  attributes:
    - oldKey: "updated_email"
      targetKey: "email"
      converters: ["anyToString", "stringToLowerCase"]
      validation:
        - rule: "email"
          params: ["{email}"]

    - oldKey: "new_phone"
      targetKey: "phone"
      converters: ["anyToString"]

    - oldKey: "last_login"
      targetKey: "lastLoginAt"
      converters: ["anyToDate", "dateToTimestamp"]

  relationships: []

options:
  batchSize: 100
  continueOnError: true
  updateMapping:
    originalIdField: "user_id"
    targetField: "userId"
`;

  // Write example files
  const examples = [
    { name: "users-import.yaml", content: userImportExample },
    { name: "products-import.yaml", content: productImportExample },
    { name: "users-update.yaml", content: updateExample },
  ];

  for (const example of examples) {
    const examplePath = path.join(examplesDir, example.name);
    fs.writeFileSync(examplePath, example.content);
    logger.info(`Created import example: ${examplePath}`);
  }
}