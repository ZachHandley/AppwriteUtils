import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { ulid } from "ulidx";
import { MessageFormatter } from "appwrite-utils-helpers";
import {
  detectAppwriteVersionCached,
  fetchServerVersion,
  isVersionAtLeast,
  type ApiMode
} from "appwrite-utils-helpers";
import {
  loadAppwriteProjectConfig,
  findAppwriteProjectConfig,
  isTablesDBProject
} from "appwrite-utils-helpers";
import { findYamlConfig, generateYamlConfigTemplate, loadYamlConfig } from "appwrite-utils-helpers";
import { hasSessionAuth } from "appwrite-utils-helpers";

/**
 * Terminology configuration for API mode-specific naming
 */
interface TerminologyConfig {
  container: "table" | "collection";
  containerName: "Table" | "Collection";
  fields: "columns" | "attributes";
  fieldName: "Column" | "Attribute";
  security: "rowSecurity" | "documentSecurity";
  schemaRef: "table.schema.json" | "collection.schema.json";
  items: "rows" | "documents";
}

/**
 * Detection result with source information
 */
interface ApiModeDetectionResult {
  apiMode: ApiMode;
  useTables: boolean;
  detectionSource: "appwrite.json" | "server-version" | "default";
  serverVersion?: string;
}

/**
 * Get terminology configuration based on API mode
 */
export function getTerminologyConfig(useTables: boolean): TerminologyConfig {
  return useTables
    ? {
        container: "table",
        containerName: "Table",
        fields: "columns",
        fieldName: "Column",
        security: "rowSecurity",
        schemaRef: "table.schema.json",
        items: "rows"
      }
    : {
        container: "collection",
        containerName: "Collection",
        fields: "attributes",
        fieldName: "Attribute",
        security: "documentSecurity",
        schemaRef: "collection.schema.json",
        items: "documents"
      };
}

/**
 * Detect API mode using multiple detection sources
 * Priority: appwrite.json > server version > default (collections)
 */
export async function detectApiMode(basePath: string): Promise<ApiModeDetectionResult> {
  let useTables = false;
  let detectionSource: "appwrite.json" | "server-version" | "default" = "default";
  let serverVersion: string | undefined;

  try {
    // Priority 1: Check for existing appwrite.json project config
    const projectConfigPath = findAppwriteProjectConfig(basePath);
    if (projectConfigPath) {
      const projectConfig = loadAppwriteProjectConfig(projectConfigPath);
      if (projectConfig) {
        useTables = isTablesDBProject(projectConfig);
        detectionSource = "appwrite.json";
        MessageFormatter.info(
          `Detected ${useTables ? 'TablesDB' : 'Collections'} project from ${projectConfigPath}`,
          { prefix: "Setup" }
        );
        return {
          apiMode: useTables ? 'tablesdb' : 'legacy',
          useTables,
          detectionSource
        };
      }
    }

    // Priority 2: Try reading existing YAML config for version detection
    const yamlPath = findYamlConfig(basePath);
    if (yamlPath) {
      const cfg = await loadYamlConfig(yamlPath);
      if (cfg) {
        const endpoint = cfg.appwriteEndpoint;
        const projectId = cfg.appwriteProject;

        if (hasSessionAuth(endpoint, projectId)) {
          MessageFormatter.info("Using session authentication for version detection", { prefix: "Setup" });
        }

        const ver = await fetchServerVersion(endpoint);
        serverVersion = ver || undefined;

        if (isVersionAtLeast(ver || undefined, '1.8.0')) {
          useTables = true;
          detectionSource = "server-version";
          MessageFormatter.info(`Detected TablesDB support (Appwrite ${ver})`, { prefix: "Setup" });
        } else {
          MessageFormatter.info(`Using Collections API (Appwrite ${ver || 'unknown'})`, { prefix: "Setup" });
        }

        return {
          apiMode: useTables ? 'tablesdb' : 'legacy',
          useTables,
          detectionSource,
          serverVersion
        };
      }
    }
  } catch (error) {
    MessageFormatter.warning(
      `Version detection failed, defaulting to Collections API: ${error instanceof Error ? error.message : String(error)}`,
      { prefix: "Setup" }
    );
  }

  // Default to Collections API
  return {
    apiMode: 'legacy',
    useTables: false,
    detectionSource: 'default'
  };
}

/**
 * Create directory structure for Appwrite project
 */
export function createProjectDirectories(basePath: string, useTables: boolean): {
  appwriteFolder: string;
  containerFolder: string;
  schemaFolder: string;
  yamlSchemaFolder: string;
  dataFolder: string;
} {
  const appwriteFolder = path.join(basePath, ".appwrite");
  const containerName = useTables ? "tables" : "collections";
  const containerFolder = path.join(appwriteFolder, containerName);
  const schemaFolder = path.join(appwriteFolder, "schemas");
  const yamlSchemaFolder = path.join(appwriteFolder, ".yaml_schemas");
  const dataFolder = path.join(appwriteFolder, "importData");

  // Create all directories
  for (const dir of [appwriteFolder, containerFolder, schemaFolder, yamlSchemaFolder, dataFolder]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  return {
    appwriteFolder,
    containerFolder,
    schemaFolder,
    yamlSchemaFolder,
    dataFolder
  };
}

/**
 * Create example YAML schema file with correct terminology
 */
export function createExampleSchema(
  containerFolder: string,
  terminology: TerminologyConfig
): string {
  const yamlExample = `# yaml-language-server: $schema=../.yaml_schemas/${terminology.schemaRef}
# Example ${terminology.containerName} Definition
name: Example${terminology.containerName}
id: example_${terminology.container}_${Date.now()}
${terminology.security}: false
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
${terminology.fields}:
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
    default: true${terminology.container === 'table' ? `
  - key: uniqueCode
    type: string
    size: 50
    required: false
    unique: true
    description: "Unique identifier code (TablesDB feature)"` : ''}
indexes:
  - key: title_search
    type: fulltext
    attributes:
      - title
importDefs: []
`;

  const examplePath = path.join(containerFolder, `Example${terminology.containerName}.yaml`);
  writeFileSync(examplePath, yamlExample);

  MessageFormatter.info(
    `Created example ${terminology.container} definition with ${terminology.fields} terminology`,
    { prefix: "Setup" }
  );

  return examplePath;
}

/**
 * Create JSON schema for YAML validation
 */
export function createYamlValidationSchema(
  yamlSchemaFolder: string,
  useTables: boolean
): string {
  const schemaFileName = useTables ? "table.schema.json" : "collection.schema.json";
  const containerType = useTables ? "Table" : "Collection";
  const fieldsName = useTables ? "columns" : "attributes";
  const fieldsDescription = useTables ? "Table columns (fields)" : "Collection attributes (fields)";
  const securityField = useTables ? "rowSecurity" : "documentSecurity";
  const securityDescription = useTables ? "Enable row-level permissions" : "Enable document-level permissions";
  const itemType = useTables ? "row" : "document";

  const schema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": `https://appwrite-utils.dev/schemas/${schemaFileName}`,
    "title": `Appwrite ${containerType} Definition`,
    "description": `Schema for defining Appwrite ${useTables ? 'tables' : 'collections'} in YAML${useTables ? ' (TablesDB API)' : ''}`,
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "description": `The name of the ${useTables ? 'table' : 'collection'}`
      },
      "id": {
        "type": "string",
        "description": `The ID of the ${useTables ? 'table' : 'collection'} (optional, auto-generated if not provided)`,
        "pattern": "^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$"
      },
      [securityField]: {
        "type": "boolean",
        "default": false,
        "description": securityDescription
      },
      "enabled": {
        "type": "boolean",
        "default": true,
        "description": `Whether the ${useTables ? 'table' : 'collection'} is enabled`
      },
      "permissions": {
        "type": "array",
        "description": `${containerType}-level permissions`,
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
      [fieldsName]: {
        "type": "array",
        "description": fieldsDescription,
        "items": {
          "type": "object",
          "properties": {
            "key": {
              "type": "string",
              "description": `${useTables ? 'Column' : 'Attribute'} name`,
              "pattern": "^[a-zA-Z][a-zA-Z0-9]*$"
            },
            "type": {
              "type": "string",
              "enum": ["string", "integer", "double", "boolean", "datetime", "email", "ip", "url", "enum", "relationship"],
              "description": `${useTables ? 'Column' : 'Attribute'} data type`
            },
            "size": {
              "type": "number",
              "description": `Maximum size for string ${useTables ? 'columns' : 'attributes'}`,
              "minimum": 1,
              "maximum": 1073741824
            },
            "required": {
              "type": "boolean",
              "default": false,
              "description": `Whether the ${useTables ? 'column' : 'attribute'} is required`
            },
            "array": {
              "type": "boolean",
              "default": false,
              "description": `Whether the ${useTables ? 'column' : 'attribute'} is an array`
            },
            // Encryption flag for string types
            "encrypt": {
              "type": "boolean",
              "default": false,
              "description": `Enable encryption for string ${useTables ? 'columns' : 'attributes'}`
            },
            ...(useTables ? {
              "unique": {
                "type": "boolean",
                "default": false,
                "description": "Whether the column values must be unique (TablesDB feature)"
              }
            } : {}),
            "default": {
              "description": `Default value for the ${useTables ? 'column' : 'attribute'}`
            },
            "description": {
              "type": "string",
              "description": `${useTables ? 'Column' : 'Attribute'} description`
            },
            "min": {
              "type": "number",
              "description": `Minimum value for numeric ${useTables ? 'columns' : 'attributes'}`
            },
            "max": {
              "type": "number",
              "description": `Maximum value for numeric ${useTables ? 'columns' : 'attributes'}`
            },
            "elements": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "description": `Allowed values for enum ${useTables ? 'columns' : 'attributes'}`
            },
            "relatedCollection": {
              "type": "string",
              "description": `Related ${useTables ? 'table' : 'collection'} name for relationship ${useTables ? 'columns' : 'attributes'}`
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
              "description": `Action to take when related ${itemType} is deleted`
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
        "description": `Database indexes for the ${useTables ? 'table' : 'collection'}`,
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
              "description": `${useTables ? 'Columns' : 'Attributes'} to index`,
              "minItems": 1
            },
            "orders": {
              "type": "array",
              "items": {
                "type": "string",
                "enum": ["ASC", "DESC"]
              },
              "description": `Sort order for each ${useTables ? 'column' : 'attribute'}`
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

  const schemaPath = path.join(yamlSchemaFolder, schemaFileName);
  writeFileSync(schemaPath, JSON.stringify(schema, null, 2));

  return schemaPath;
}

/**
 * Initialize a new Appwrite project with correct directory structure and terminology
 */
export async function initProject(
  basePath?: string,
  forceApiMode?: 'legacy' | 'tablesdb'
): Promise<void> {
  const projectPath = basePath || process.cwd();

  // Detect API mode
  const detection = forceApiMode
    ? {
        apiMode: forceApiMode,
        useTables: forceApiMode === 'tablesdb',
        detectionSource: 'forced' as const,
      }
    : await detectApiMode(projectPath);

  const { useTables, detectionSource } = detection;
  const terminology = getTerminologyConfig(useTables);

  // Create directory structure
  const dirs = createProjectDirectories(projectPath, useTables);

  // Generate YAML config
  const configPath = path.join(dirs.appwriteFolder, "config.yaml");
  generateYamlConfigTemplate(configPath);

  // Create example schema file
  createExampleSchema(dirs.containerFolder, terminology);

  // Create JSON validation schema
  createYamlValidationSchema(dirs.yamlSchemaFolder, useTables);

  // Success messages
  const containerType = useTables ? "TablesDB" : "Collections";
  MessageFormatter.success(
    `Created YAML config and setup files/directories in .appwrite/ folder.`,
    { prefix: "Setup" }
  );
  MessageFormatter.info(
    `Project configured for ${containerType} API (${detectionSource} detection)`,
    { prefix: "Setup" }
  );
  MessageFormatter.info("You can now configure your project in .appwrite/config.yaml", { prefix: "Setup" });
  MessageFormatter.info(
    `${terminology.containerName}s can be defined in .appwrite/${terminology.container}s/ as .yaml files`,
    { prefix: "Setup" }
  );
  MessageFormatter.info("Schemas will be generated in .appwrite/schemas/", { prefix: "Setup" });
  MessageFormatter.info("Import data can be placed in .appwrite/importData/", { prefix: "Setup" });

  if (useTables) {
    MessageFormatter.info(
      "TablesDB features: unique constraints, enhanced performance, row-level security",
      { prefix: "Setup" }
    );
  }
}

/**
 * Create a new collection or table schema file
 */
export async function createSchema(
  name: string,
  basePath?: string,
  forceApiMode?: 'legacy' | 'tablesdb'
): Promise<void> {
  const projectPath = basePath || process.cwd();

  // Detect API mode
  const detection = forceApiMode
    ? {
        apiMode: forceApiMode,
        useTables: forceApiMode === 'tablesdb',
        detectionSource: 'forced' as const,
      }
    : await detectApiMode(projectPath);

  const { useTables } = detection;
  const terminology = getTerminologyConfig(useTables);

  // Find or create container directory
  const appwriteFolder = path.join(projectPath, ".appwrite");
  const containerFolder = path.join(appwriteFolder, useTables ? "tables" : "collections");

  if (!existsSync(containerFolder)) {
    mkdirSync(containerFolder, { recursive: true });
  }

  // Create YAML schema file
  const yamlSchema = `# yaml-language-server: $schema=../.yaml_schemas/${terminology.schemaRef}
# ${terminology.containerName} Definition: ${name}
name: ${name}
id: ${ulid()}
${terminology.security}: false
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
${terminology.fields}:
  # Add your ${terminology.fields} here
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

  const schemaPath = path.join(containerFolder, `${name}.yaml`);
  writeFileSync(schemaPath, yamlSchema);

  MessageFormatter.success(
    `Created ${terminology.container} schema: ${schemaPath}`,
    { prefix: "Setup" }
  );
  MessageFormatter.info(
    `Add your ${terminology.fields} to define the ${terminology.container} structure`,
    { prefix: "Setup" }
  );
}
