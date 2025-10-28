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
 * Generates JSON Schema for collection definitions (legacy Databases API)
 */
export function generateCollectionSchema(): any {
  return {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://appwrite-utils.dev/schemas/collection.schema.json",
    "title": "Appwrite Collection Definition",
    "description": "YAML configuration for Appwrite collection definitions (legacy Databases API)",
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "description": "Collection name",
        "minLength": 1
      },
      "id": {
        "type": "string",
        "description": "Collection ID",
        "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"
      },
      "documentSecurity": {
        "type": "boolean",
        "description": "Enable document-level security",
        "default": false
      },
      "enabled": {
        "type": "boolean",
        "description": "Whether the collection is enabled",
        "default": true
      },
      "permissions": {
        "type": "array",
        "description": "Collection-level permissions",
        "items": {
          "$ref": "#/$defs/permission"
        },
        "default": []
      },
      "attributes": {
        "type": "array",
        "description": "Collection attributes (fields)",
        "items": {
          "$ref": "#/$defs/attribute"
        },
        "default": []
      },
      "indexes": {
        "type": "array",
        "description": "Collection indexes",
        "items": {
          "$ref": "#/$defs/index"
        },
        "default": []
      },
      "importDefs": {
        "type": "array",
        "description": "Import definitions for data migration",
        "default": []
      }
    },
    "required": ["name"],
    "additionalProperties": false,
    "$defs": {
      "permission": {
        "type": "object",
        "properties": {
          "permission": {
            "type": "string",
            "enum": ["read", "write", "create", "update", "delete"]
          },
          "target": {
            "type": "string",
            "description": "Permission target (e.g., 'users', 'guests', role:admin)"
          }
        },
        "required": ["permission", "target"],
        "additionalProperties": false
      },
      "attribute": {
        "type": "object",
        "properties": {
          "key": {
            "type": "string",
            "description": "Attribute key/name",
            "pattern": "^[a-zA-Z][a-zA-Z0-9_]*$"
          },
          "type": {
            "type": "string",
            "enum": ["string", "integer", "double", "boolean", "datetime", "email", "ip", "url", "enum", "relationship"]
          },
          "size": {
            "type": "number",
            "description": "Maximum size for string attributes"
          },
          "required": {
            "type": "boolean",
            "default": false
          },
          "array": {
            "type": "boolean",
            "default": false
          },
          "default": {
            "description": "Default value for the attribute"
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
            "items": { "type": "string" },
            "description": "Allowed values for enum attributes"
          },
          "relatedCollection": {
            "type": "string",
            "description": "Related collection for relationship attributes"
          },
          "relationType": {
            "type": "string",
            "enum": ["oneToOne", "oneToMany", "manyToOne", "manyToMany"]
          },
          "twoWay": {
            "type": "boolean",
            "description": "Enable two-way relationship"
          },
          "twoWayKey": {
            "type": "string",
            "description": "Key for the reverse relationship"
          },
          "onDelete": {
            "type": "string",
            "enum": ["cascade", "restrict", "setNull"]
          },
          "side": {
            "type": "string",
            "enum": ["parent", "child"]
          },
          "encrypt": {
            "type": "boolean",
            "description": "Whether the attribute should be encrypted"
          },
          "format": {
            "type": "string",
            "description": "Format for string attributes (e.g., email, url, ip)"
          }
        },
        "required": ["key", "type"],
        "additionalProperties": false
      },
      "index": {
        "type": "object",
        "properties": {
          "key": {
            "type": "string",
            "description": "Index key/name"
          },
          "type": {
            "type": "string",
            "enum": ["key", "fulltext", "unique"]
          },
          "attributes": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Attribute names to include in the index",
            "minItems": 1
          },
          "orders": {
            "type": "array",
            "items": {
              "type": "string",
              "enum": ["asc", "desc"]
            },
            "description": "Sort orders for indexed attributes"
          }
        },
        "required": ["key", "type", "attributes"],
        "additionalProperties": false
      }
    }
  };
}

/**
 * Generates JSON Schema for table definitions (new TablesDB API)
 */
export function generateTableSchema(): any {
  const collectionSchema = generateCollectionSchema();

  // Clone and modify the collection schema for table terminology
  const tableSchema = JSON.parse(JSON.stringify(collectionSchema));

  // Update metadata
  tableSchema.$id = "https://appwrite-utils.dev/schemas/table.schema.json";
  tableSchema.title = "Appwrite Table Definition";
  tableSchema.description = "YAML configuration for Appwrite table definitions (new TablesDB API)";

  // Replace 'documentSecurity' with 'rowSecurity'
  delete tableSchema.properties.documentSecurity;
  tableSchema.properties.rowSecurity = {
    "type": "boolean",
    "description": "Enable row-level security",
    "default": false
  };

  // Replace 'attributes' with 'columns'
  delete tableSchema.properties.attributes;
  tableSchema.properties.columns = {
    "type": "array",
    "description": "Table columns (fields)",
    "items": {
      "$ref": "#/$defs/column"
    },
    "default": []
  };

  // Update index definition to use columns instead of attributes
  delete tableSchema.$defs.index.properties.attributes;
  tableSchema.$defs.index.properties.columns = {
    "type": "array",
    "items": { "type": "string" },
    "description": "Column names to include in the index",
    "minItems": 1
  };

  // Update index required fields to use columns
  const requiredIndex = tableSchema.$defs.index.required;
  if (requiredIndex && requiredIndex.includes("attributes")) {
    const attributesIndex = requiredIndex.indexOf("attributes");
    requiredIndex[attributesIndex] = "columns";
  }

  // Add column definition (similar to attribute but with table terminology)
  tableSchema.$defs.column = JSON.parse(JSON.stringify(tableSchema.$defs.attribute));

  // Add encrypt property (table-specific feature)
  tableSchema.$defs.column.properties.encrypt = {
    "type": "boolean",
    "description": "Whether the column should be encrypted",
    "default": false
  };

  // Replace relatedCollection with relatedTable for table terminology
  delete tableSchema.$defs.column.properties.relatedCollection;
  tableSchema.$defs.column.properties.relatedTable = {
    "type": "string",
    "description": "Related table for relationship columns"
  };

  return tableSchema;
}

/**
 * Generates JSON Schema for main Appwrite configuration (YAML format)
 * Matches the structure of YamlConfigSchema from yamlConfig.ts
 */
export function generateAppwriteConfigSchema(): any {
  return {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://appwrite-utils.dev/schemas/appwrite-config.schema.json",
    "title": "Appwrite Project Configuration",
    "description": "Main YAML configuration file for Appwrite projects with dual API support (Collections API and TablesDB API)",
    "type": "object",
    "properties": {
      "appwrite": {
        "type": "object",
        "description": "Appwrite connection and authentication settings",
        "properties": {
          "endpoint": {
            "type": "string",
            "format": "uri",
            "default": "https://cloud.appwrite.io/v1",
            "description": "Appwrite API endpoint"
          },
          "project": {
            "type": "string",
            "description": "Appwrite project ID"
          },
          "key": {
            "type": "string",
            "description": "Appwrite API key for authentication"
          },
          "sessionCookie": {
            "type": "string",
            "description": "Session cookie for authentication (alternative to API key)"
          },
          "authMethod": {
            "type": "string",
            "enum": ["session", "apikey", "auto"],
            "default": "auto",
            "description": "Authentication method: 'session' for session auth, 'apikey' for API key, 'auto' for automatic detection"
          },
          "sessionMetadata": {
            "type": "object",
            "description": "Metadata about the current session",
            "properties": {
              "email": {
                "type": "string",
                "description": "Email associated with the session"
              },
              "expiresAt": {
                "type": "string",
                "description": "Session expiration timestamp (ISO string)"
              }
            },
            "additionalProperties": false
          }
        },
        "required": ["endpoint", "project", "key"],
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
            "description": "Custom log directory path (default: ./zlogs)"
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
            "description": "Enable backups"
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
            "description": "Enable backup cleanup"
          }
        },
        "additionalProperties": false
      },
      "data": {
        "type": "object",
        "description": "Data handling configuration",
        "properties": {
          "enableMockData": {
            "type": "boolean",
            "default": false,
            "description": "Enable mock data generation"
          },
          "documentBucketId": {
            "type": "string",
            "default": "documents",
            "description": "Documents bucket ID for imported documents"
          },
          "usersCollectionName": {
            "type": "string",
            "default": "Members",
            "description": "Users collection name for any overflowing data associated with users"
          },
          "importDirectory": {
            "type": "string",
            "default": "importData",
            "description": "Directory for import data files"
          }
        },
        "additionalProperties": false
      },
      "schemas": {
        "type": "object",
        "description": "Schema and directory configuration",
        "properties": {
          "outputDirectory": {
            "type": "string",
            "default": "schemas",
            "description": "Directory for generated TypeScript schemas"
          },
          "yamlSchemaDirectory": {
            "type": "string",
            "default": ".yaml_schemas",
            "description": "Directory for JSON schemas used for YAML validation"
          },
          "collectionsDirectory": {
            "type": "string",
            "default": "collections",
            "description": "Directory name for legacy collections definitions"
          },
          "tablesDirectory": {
            "type": "string",
            "default": "tables",
            "description": "Directory name for TablesDB table definitions"
          }
        },
        "additionalProperties": false
      },
      "migrations": {
        "type": "object",
        "description": "Migration configuration",
        "properties": {
          "enabled": {
            "type": "boolean",
            "default": true,
            "description": "Enable migrations"
          }
        },
        "additionalProperties": false
      },
      "databases": {
        "type": "array",
        "description": "Databases to create",
        "items": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "description": "Database ID"
            },
            "name": {
              "type": "string",
              "description": "Database name"
            },
            "bucket": {
              "type": "object",
              "description": "Optional bucket configuration for this database",
              "properties": {
                "id": {
                  "type": "string",
                  "description": "Bucket ID"
                },
                "name": {
                  "type": "string",
                  "description": "Bucket name"
                },
                "permissions": {
                  "type": "array",
                  "description": "Bucket permissions",
                  "items": {
                    "$ref": "#/$defs/permission"
                  }
                },
                "fileSecurity": {
                  "type": "boolean",
                  "default": false,
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
                  "items": { "type": "string" },
                  "default": [],
                  "description": "Allowed file extensions"
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
                  "description": "Enable encryption"
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
        },
        "default": [
          { "id": "dev", "name": "Development" },
          { "id": "main", "name": "Main" },
          { "id": "staging", "name": "Staging" }
        ]
      },
      "buckets": {
        "type": "array",
        "description": "Global buckets to create across all databases",
        "items": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "description": "Bucket ID"
            },
            "name": {
              "type": "string",
              "description": "Bucket name"
            },
            "permissions": {
              "type": "array",
              "description": "Bucket permissions",
              "items": {
                "$ref": "#/$defs/permission"
              }
            },
            "fileSecurity": {
              "type": "boolean",
              "default": false,
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
              "items": { "type": "string" },
              "default": [],
              "description": "Allowed file extensions"
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
              "description": "Enable encryption"
            },
            "antivirus": {
              "type": "boolean",
              "default": false,
              "description": "Enable antivirus scanning"
            }
          },
          "required": ["id", "name"],
          "additionalProperties": false
        },
        "default": []
      },
      "functions": {
        "type": "array",
        "description": "Appwrite Functions to create",
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
              "description": "Runtime identifier (e.g., 'node-18.0', 'python-3.9')"
            },
            "execute": {
              "type": "array",
              "items": { "type": "string" },
              "description": "Execution permissions"
            },
            "events": {
              "type": "array",
              "items": { "type": "string" },
              "description": "Trigger events"
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
              "description": "Enable logging"
            },
            "entrypoint": {
              "type": "string",
              "description": "Function entrypoint file"
            },
            "commands": {
              "type": "string",
              "description": "Build commands"
            },
            "scopes": {
              "type": "array",
              "items": { "type": "string" },
              "description": "Function scopes/permissions"
            },
            "installationId": {
              "type": "string",
              "description": "GitHub installation ID"
            },
            "providerRepositoryId": {
              "type": "string",
              "description": "Provider repository ID"
            },
            "providerBranch": {
              "type": "string",
              "description": "Provider branch"
            },
            "providerSilentMode": {
              "type": "boolean",
              "description": "Enable silent mode"
            },
            "providerRootDirectory": {
              "type": "string",
              "description": "Provider root directory"
            },
            "templateRepository": {
              "type": "string",
              "description": "Template repository"
            },
            "templateOwner": {
              "type": "string",
              "description": "Template owner"
            },
            "templateRootDirectory": {
              "type": "string",
              "description": "Template root directory"
            },
            "templateBranch": {
              "type": "string",
              "description": "Template branch"
            },
            "specification": {
              "type": "string",
              "default": "s-0.5vcpu-512mb",
              "description": "Function specification"
            },
            "dirPath": {
              "type": "string",
              "description": "Local directory path for function code"
            },
            "predeployCommands": {
              "type": "array",
              "items": { "type": "string" },
              "description": "Commands to run before deployment"
            },
            "deployDir": {
              "type": "string",
              "description": "Deployment directory"
            },
            "ignore": {
              "type": "array",
              "items": { "type": "string" },
              "description": "Files to ignore during deployment"
            },
            "templateVersion": {
              "type": "string",
              "description": "Template version"
            }
          },
          "required": ["id", "name", "runtime"],
          "additionalProperties": false
        },
        "default": []
      },
      "collections": {
        "type": "array",
        "description": "Collections to create using the legacy Databases API (deprecated - use separate collection files)",
        "items": {
          "$ref": "./collection.schema.json"
        },
        "default": []
      },
      "tables": {
        "type": "array",
        "description": "Tables to create using the new TablesDB API (deprecated - use separate table files)",
        "items": {
          "$ref": "./table.schema.json"
        },
        "default": []
      }
    },
    "required": ["appwrite"],
    "additionalProperties": false,
    "$defs": {
      "permission": {
        "type": "object",
        "properties": {
          "permission": {
            "type": "string",
            "enum": ["read", "write", "create", "update", "delete"]
          },
          "target": {
            "type": "string",
            "description": "Permission target (e.g., 'users', 'guests', 'role:admin')"
          }
        },
        "required": ["permission", "target"],
        "additionalProperties": false
      }
    }
  };
}

/**
 * Creates all necessary schema files for YAML configurations.
 *
 * @param appwriteFolderPath - Path to the .appwrite directory
 */
export async function createImportSchemas(appwriteFolderPath: string): Promise<void> {
  const yamlSchemasDir = path.join(appwriteFolderPath, ".yaml_schemas");

  // Ensure directory exists
  if (!fs.existsSync(yamlSchemasDir)) {
    fs.mkdirSync(yamlSchemasDir, { recursive: true });
  }

  // Generate and write all schemas
  const schemas = [
    { name: "import-config.schema.json", generator: generateImportConfigSchema },
    { name: "collection.schema.json", generator: generateCollectionSchema },
    { name: "table.schema.json", generator: generateTableSchema },
    { name: "appwrite-config.schema.json", generator: generateAppwriteConfigSchema }
  ];

  for (const { name, generator } of schemas) {
    const schema = generator();
    const schemaPath = path.join(yamlSchemasDir, name);
    fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
    logger.info(`Created schema: ${schemaPath}`);
  }

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
            "description": "Schema for collection definitions (legacy Databases API)"
          },
          "table": {
            "type": "string",
            "const": "./table.schema.json",
            "description": "Schema for table definitions (new TablesDB API)"
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
