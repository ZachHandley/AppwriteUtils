import { z } from "zod";
import path from "path";
import fs from "fs";
import yaml from "js-yaml";
import { logger } from "../../shared/logging.js";
import type { ImportDef, AttributeMappings } from "appwrite-utils";

// YAML Import Configuration Schema
export const YamlImportConfigSchema = z.object({
  source: z.object({
    file: z.string().describe("Path to the data file relative to .appwrite directory"),
    basePath: z.string().optional().describe("JSON path to the data array (e.g., 'RECORDS')"),
    type: z.enum(["json", "csv", "yaml"]).default("json").describe("Source file type"),
  }),
  
  target: z.object({
    collection: z.string().describe("Name of the target collection"),
    type: z.enum(["create", "update"]).default("create").describe("Import operation type"),
    primaryKey: z.string().default("id").describe("Primary key field name in source data"),
    createUsers: z.boolean().default(false).describe("Whether to create user accounts"),
  }),

  mapping: z.object({
    attributes: z.array(z.object({
      // Source mapping
      oldKey: z.string().optional().describe("Source field name"),
      oldKeys: z.array(z.string()).optional().describe("Multiple source field names"),
      
      // Target mapping
      targetKey: z.string().describe("Target field name in collection"),
      valueToSet: z.any().optional().describe("Static value to set"),
      
      // File handling
      fileData: z.object({
        path: z.string().describe("File path template (supports {field} placeholders)"),
        name: z.string().describe("File name template (supports {field} placeholders)"),
      }).optional(),
      
      // Data transformation
      converters: z.array(z.string()).default([]).describe("Converter function names"),
      
      // Validation
      validation: z.array(z.object({
        rule: z.string().describe("Validation rule name"),
        params: z.array(z.string()).describe("Validation parameters with {field} placeholders"),
      })).default([]).describe("Validation rules"),
      
      // Post-import actions
      afterImport: z.array(z.object({
        action: z.string().describe("Action name"),
        params: z.array(z.union([z.string(), z.record(z.string(), z.any())])).describe("Action parameters"),
      })).default([]).describe("Actions to execute after import"),
    })).describe("Field mapping configuration"),
    
    relationships: z.array(z.object({
      sourceField: z.string().describe("Source field containing old ID"),
      targetField: z.string().describe("Target field to set new ID"),
      targetCollection: z.string().describe("Collection to find new ID in"),
      fieldToSet: z.string().optional().describe("Field to set (defaults to sourceField)"),
      targetFieldToMatch: z.string().optional().describe("Field to match in target collection"),
    })).default([]).describe("Relationship mappings"),
  }),

  options: z.object({
    batchSize: z.number().min(1).max(1000).default(50).describe("Batch size for processing"),
    skipValidation: z.boolean().default(false).describe("Skip data validation"),
    dryRun: z.boolean().default(false).describe("Perform dry run without actual import"),
    continueOnError: z.boolean().default(true).describe("Continue processing if individual items fail"),
    updateMapping: z.object({
      originalIdField: z.string().describe("Field in source data for matching"),
      targetField: z.string().describe("Field in collection to match against"),
    }).optional().describe("Configuration for update operations"),
  }).default(() => ({
    batchSize: 50,
    skipValidation: false,
    dryRun: false,
    continueOnError: true
  })),
});

export type YamlImportConfig = z.infer<typeof YamlImportConfigSchema>;

/**
 * Service for loading and converting YAML import configurations.
 * Integrates with existing .appwrite YAML structure while providing
 * enhanced import configuration capabilities.
 */
export class YamlImportConfigLoader {
  private appwriteFolderPath: string;

  constructor(appwriteFolderPath: string) {
    this.appwriteFolderPath = appwriteFolderPath;
  }

  /**
   * Loads a YAML import configuration file.
   * 
   * @param configPath - Path to the YAML config file relative to .appwrite/import/
   * @returns Parsed and validated YAML import configuration
   */
  async loadImportConfig(configPath: string): Promise<YamlImportConfig> {
    const fullPath = path.resolve(this.appwriteFolderPath, "import", configPath);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Import configuration file not found: ${fullPath}`);
    }

    try {
      const yamlContent = fs.readFileSync(fullPath, "utf8");
      const rawConfig = yaml.load(yamlContent) as any;
      
      // Validate against schema
      const validatedConfig = YamlImportConfigSchema.parse(rawConfig);
      
      logger.info(`Loaded import configuration: ${configPath}`);
      return validatedConfig;
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.issues.map(err => `${err.path.join('.')}: ${err.message}`);
        throw new Error(`Invalid import configuration in ${configPath}:\n${errorMessages.join('\n')}`);
      }
      throw new Error(`Failed to load import configuration ${configPath}: ${error}`);
    }
  }

  /**
   * Loads all import configurations from the .appwrite/import directory.
   * 
   * @returns Map of collection names to their import configurations
   */
  async loadAllImportConfigs(): Promise<Map<string, YamlImportConfig[]>> {
    const importDir = path.join(this.appwriteFolderPath, "import");
    const configs = new Map<string, YamlImportConfig[]>();

    if (!fs.existsSync(importDir)) {
      logger.info("No import directory found, skipping YAML import configurations");
      return configs;
    }

    try {
      const files = fs.readdirSync(importDir, { withFileTypes: true });
      
      for (const file of files) {
        if (file.isFile() && file.name.endsWith('.yaml')) {
          try {
            const config = await this.loadImportConfig(file.name);
            const collectionName = config.target.collection;
            
            if (!configs.has(collectionName)) {
              configs.set(collectionName, []);
            }
            configs.get(collectionName)!.push(config);
            
          } catch (error) {
            logger.error(`Failed to load import config ${file.name}:`, error);
          }
        }
      }

      logger.info(`Loaded import configurations for ${configs.size} collections`);
      return configs;
      
    } catch (error) {
      logger.error("Failed to scan import directory:", error);
      return configs;
    }
  }

  /**
   * Converts YAML import configuration to legacy ImportDef format.
   * Maintains compatibility with existing import system.
   * 
   * @param yamlConfig - YAML import configuration
   * @returns Legacy ImportDef object
   */
  convertToImportDef(yamlConfig: YamlImportConfig): ImportDef {
    const attributeMappings: AttributeMappings = yamlConfig.mapping.attributes.map(attr => ({
      oldKey: attr.oldKey,
      oldKeys: attr.oldKeys,
      targetKey: attr.targetKey,
      valueToSet: attr.valueToSet,
      fileData: attr.fileData,
      converters: attr.converters,
      validationActions: attr.validation.map(v => ({
        action: v.rule,
        params: v.params,
      })),
      postImportActions: attr.afterImport.map(a => ({
        action: a.action,
        params: a.params,
      })),
    }));

    const idMappings = yamlConfig.mapping.relationships.map(rel => ({
      sourceField: rel.sourceField,
      targetField: rel.targetField,
      targetCollection: rel.targetCollection,
      fieldToSet: rel.fieldToSet,
      targetFieldToMatch: rel.targetFieldToMatch,
    }));

    return {
      type: yamlConfig.target.type,
      filePath: yamlConfig.source.file,
      basePath: yamlConfig.source.basePath,
      primaryKeyField: yamlConfig.target.primaryKey,
      createUsers: yamlConfig.target.createUsers,
      attributeMappings,
      idMappings: idMappings.length > 0 ? idMappings : undefined,
      updateMapping: yamlConfig.options.updateMapping,
    };
  }

  /**
   * Generates a template YAML import configuration.
   * Useful for getting started with YAML-based imports.
   * Supports both collection and table terminology.
   *
   * @param collectionName - Name of the collection
   * @param sourceFile - Source data file name
   * @param useTableTerminology - Whether to use table terminology
   * @returns YAML configuration template
   */
  generateTemplate(
    collectionName: string,
    sourceFile: string,
    useTableTerminology = false
  ): string {
    const entityType = useTableTerminology ? 'table' : 'collection';
    const template = {
      source: {
        file: `importData/${sourceFile}`,
        basePath: "RECORDS",
        type: "json"
      },
      target: {
        [entityType]: collectionName,
        type: "create",
        primaryKey: "id",
        createUsers: false
      },
      mapping: {
        attributes: [
          {
            oldKey: "id",
            targetKey: "id",
            converters: ["anyToString"]
          },
          {
            oldKey: "name",
            targetKey: "name",
            converters: ["anyToString"],
            validation: [
              {
                rule: "required",
                params: ["{name}"]
              }
            ]
          },
          {
            oldKey: "avatar_url",
            targetKey: "avatar",
            fileData: {
              path: "{avatar_url}",
              name: "{name}_avatar"
            },
            afterImport: [
              {
                action: "createFileAndUpdateField",
                params: ["{dbId}", "{collId}", "{docId}", "avatar", "{bucketId}", "{filePath}", "{fileName}"]
              }
            ]
          }
        ],
        relationships: [
          {
            sourceField: "user_id",
            targetField: "userId",
            [useTableTerminology ? 'targetTable' : 'targetCollection']: "Users"
          }
        ]
      },
      options: {
        batchSize: 50,
        skipValidation: false,
        dryRun: false,
        continueOnError: true
      }
    };

    return yaml.dump(template, {
      indent: 2,
      lineWidth: 120,
      sortKeys: false,
    });
  }

  /**
   * Creates the import directory structure if it doesn't exist.
   * Sets up the recommended directory layout for YAML import configurations.
   */
  async createImportStructure(): Promise<void> {
    const importDir = path.join(this.appwriteFolderPath, "import");
    const collectionsDir = path.join(importDir, "collections");
    const templatesDir = path.join(importDir, "templates");

    // Create directories
    for (const dir of [importDir, collectionsDir, templatesDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created directory: ${dir}`);
      }
    }

    // Create README file
    const readmePath = path.join(importDir, "README.md");
    if (!fs.existsSync(readmePath)) {
      const readmeContent = `# Import Configurations

This directory contains YAML-based import configurations for the Appwrite Utils CLI.

## Structure

- \`collections/\` - Collection-specific import configurations
- \`templates/\` - Template configurations for reference
- \`*.yaml\` - Individual import configuration files

## Configuration Format

Each YAML file defines:
- **source**: Data source configuration (file, type, basePath)
- **target**: Target collection and operation type
- **mapping**: Field mappings, transformations, and relationships
- **options**: Import options (batch size, validation, etc.)

## Example

\`\`\`yaml
source:
  file: "importData/users.json"
  basePath: "RECORDS"
  type: "json"

target:
  collection: "Users"
  type: "create"
  primaryKey: "id"
  createUsers: true

mapping:
  attributes:
    - oldKey: "user_id"
      targetKey: "userId"
      converters: ["anyToString"]
    - oldKey: "profile_image"
      targetKey: "avatar"
      fileData:
        path: "assets/profiles/{user_id}.jpg"
        name: "{firstName}_{lastName}_avatar"

options:
  batchSize: 50
  continueOnError: true
\`\`\`

## Usage

The CLI will automatically detect and load YAML import configurations during the import process.
`;

      fs.writeFileSync(readmePath, readmeContent);
      logger.info(`Created README: ${readmePath}`);
    }
  }

  /**
   * Validates import configuration against collection schema.
   * Ensures that all target keys exist as attributes in the collection.
   * 
   * @param yamlConfig - YAML import configuration
   * @param collectionAttributes - Collection attribute definitions
   * @returns Validation errors (empty if valid)
   */
  validateAgainstCollection(
    yamlConfig: YamlImportConfig,
    collectionAttributes: any[]
  ): string[] {
    const errors: string[] = [];
    const attributeKeys = new Set(collectionAttributes.map(attr => attr.key));

    for (const mapping of yamlConfig.mapping.attributes) {
      if (!attributeKeys.has(mapping.targetKey)) {
        errors.push(`Target key '${mapping.targetKey}' not found in collection attributes`);
      }
    }

    return errors;
  }

  /**
   * Gets statistics about import configurations.
   * 
   * @param configs - Map of collection configurations
   * @returns Statistics object
   */
  getStatistics(configs: Map<string, YamlImportConfig[]>): {
    totalConfigurations: number;
    collectionsWithConfigs: number;
    totalAttributeMappings: number;
    totalRelationshipMappings: number;
    configsByType: { [type: string]: number };
  } {
    let totalConfigurations = 0;
    let totalAttributeMappings = 0;
    let totalRelationshipMappings = 0;
    const configsByType: { [type: string]: number } = {};

    for (const [collectionName, collectionConfigs] of configs.entries()) {
      totalConfigurations += collectionConfigs.length;
      
      for (const config of collectionConfigs) {
        totalAttributeMappings += config.mapping.attributes.length;
        totalRelationshipMappings += config.mapping.relationships.length;
        
        const type = config.target.type;
        configsByType[type] = (configsByType[type] || 0) + 1;
      }
    }

    return {
      totalConfigurations,
      collectionsWithConfigs: configs.size,
      totalAttributeMappings,
      totalRelationshipMappings,
      configsByType,
    };
  }
}