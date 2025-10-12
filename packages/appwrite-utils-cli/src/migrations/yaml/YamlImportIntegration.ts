import type { CollectionCreate, ImportDef } from "appwrite-utils";
import { YamlImportConfigLoader, type YamlImportConfig } from "./YamlImportConfigLoader.js";
import { createImportSchemas, createImportExamples } from "./generateImportSchemas.js";
import { logger } from "../../shared/logging.js";
import { normalizeYamlData, usesTableTerminology, convertTerminology, type YamlCollectionData } from "../../utils/yamlConverter.js";
import path from "path";
import fs from "fs";
import yaml from "js-yaml";

/**
 * Integration service that bridges YAML import configurations with the existing import system.
 * Provides seamless integration between new YAML configs and legacy TypeScript collection definitions.
 */
export class YamlImportIntegration {
  private configLoader: YamlImportConfigLoader;
  private appwriteFolderPath: string;

  constructor(appwriteFolderPath: string) {
    this.appwriteFolderPath = appwriteFolderPath;
    this.configLoader = new YamlImportConfigLoader(appwriteFolderPath);
  }

  /**
   * Initializes the YAML import system.
   * Creates necessary directories, schemas, and example files.
   */
  async initialize(): Promise<void> {
    try {
      // Create import directory structure
      await this.configLoader.createImportStructure();
      
      // Generate JSON schemas for IntelliSense
      await createImportSchemas(this.appwriteFolderPath);
      
      // Create example configurations
      await createImportExamples(this.appwriteFolderPath);
      
      logger.info("YAML import system initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize YAML import system:", error);
      throw error;
    }
  }

  /**
   * Merges YAML import configurations with existing collection definitions.
   * Allows collections to have both TypeScript and YAML import definitions.
   * 
   * @param collections - Existing collection configurations
   * @returns Collections with merged import definitions
   */
  async mergeWithCollections(collections: CollectionCreate[]): Promise<CollectionCreate[]> {
    try {
      // Load all YAML import configurations
      const yamlConfigs = await this.configLoader.loadAllImportConfigs();
      
      if (yamlConfigs.size === 0) {
        logger.info("No YAML import configurations found, using existing collection definitions");
        return collections;
      }

      logger.info(`Found YAML import configurations for ${yamlConfigs.size} collections`);

      const mergedCollections = [...collections];

      // Process each collection with YAML configs
      for (const [collectionName, yamlConfigList] of yamlConfigs.entries()) {
        const existingCollection = mergedCollections.find(c => c.name === collectionName);
        
        if (existingCollection) {
          // Merge with existing collection
          const yamlImportDefs = yamlConfigList.map(yamlConfig => 
            this.configLoader.convertToImportDef(yamlConfig)
          );
          
          // Combine existing and YAML import definitions
          const existingImportDefs = existingCollection.importDefs || [];
          existingCollection.importDefs = [...existingImportDefs, ...yamlImportDefs];
          
          logger.info(`Merged ${yamlImportDefs.length} YAML import definitions with collection: ${collectionName}`);
        } else {
          // Create new collection from YAML config
          const yamlImportDefs = yamlConfigList.map(yamlConfig => 
            this.configLoader.convertToImportDef(yamlConfig)
          );
          
          const newCollection: CollectionCreate = {
            name: collectionName,
            $id: collectionName.toLowerCase().replace(/\s+/g, '_'),
            enabled: true,
            documentSecurity: false,
            $permissions: [],
            attributes: [], // Will be populated from existing collection or schema
            indexes: [],
            importDefs: yamlImportDefs,
          };
          
          mergedCollections.push(newCollection);
          logger.info(`Created new collection from YAML config: ${collectionName}`);
        }
      }

      return mergedCollections;
    } catch (error) {
      logger.error("Failed to merge YAML configurations with collections:", error);
      // Return original collections on error to avoid breaking existing functionality
      return collections;
    }
  }

  /**
   * Validates YAML import configurations against existing collection schemas.
   * Ensures that all target fields exist in the collection definitions.
   * 
   * @param collections - Collection definitions to validate against
   * @returns Validation results with errors and warnings
   */
  async validateConfigurations(collections: CollectionCreate[]): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const yamlConfigs = await this.configLoader.loadAllImportConfigs();
      
      for (const [collectionName, yamlConfigList] of yamlConfigs.entries()) {
        const collection = collections.find(c => c.name === collectionName);
        
        if (!collection) {
          warnings.push(`YAML import config references non-existent collection: ${collectionName}`);
          continue;
        }

        for (let i = 0; i < yamlConfigList.length; i++) {
          const yamlConfig = yamlConfigList[i];
          const configErrors = this.configLoader.validateAgainstCollection(
            yamlConfig,
            collection.attributes || []
          );
          
          errors.push(...configErrors.map(err => 
            `${collectionName}[${i}]: ${err}`
          ));

          // Additional validation
          this.validateSourceFiles(yamlConfig, errors, collectionName, i);
          this.validateConverters(yamlConfig, warnings, collectionName, i);
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      errors.push(`Failed to validate YAML configurations: ${error}`);
      return {
        isValid: false,
        errors,
        warnings,
      };
    }
  }

  /**
   * Validates that source files exist for import configurations.
   */
  private validateSourceFiles(
    yamlConfig: YamlImportConfig,
    errors: string[],
    collectionName: string,
    configIndex: number
  ): void {
    const sourceFilePath = path.resolve(this.appwriteFolderPath, yamlConfig.source.file);
    
    if (!fs.existsSync(sourceFilePath)) {
      errors.push(
        `${collectionName}[${configIndex}]: Source file not found: ${yamlConfig.source.file}`
      );
    }
  }

  /**
   * Validates that converter functions are available.
   */
  private validateConverters(
    yamlConfig: YamlImportConfig,
    warnings: string[],
    collectionName: string,
    configIndex: number
  ): void {
    const availableConverters = [
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
    ];

    for (const mapping of yamlConfig.mapping.attributes) {
      for (const converter of mapping.converters) {
        const cleanConverter = converter.replace(/\[arr\]/gi, "").replace(/\[Arr\]/gi, "");
        if (!availableConverters.includes(cleanConverter)) {
          warnings.push(
            `${collectionName}[${configIndex}]: Unknown converter '${converter}' in mapping for '${mapping.targetKey}'`
          );
        }
      }
    }
  }

  /**
   * Generates a YAML import configuration from an existing ImportDef.
   * Useful for migrating TypeScript configurations to YAML.
   * Supports both collection and table terminology.
   *
   * @param importDef - Existing ImportDef to convert
   * @param collectionName - Name of the collection
   * @param useTableTerminology - Whether to use table terminology
   * @returns YAML configuration string
   */
  convertImportDefToYaml(
    importDef: ImportDef,
    collectionName: string,
    useTableTerminology = false
  ): string {
    const yamlConfig: YamlImportConfig = {
      source: {
        file: importDef.filePath,
        basePath: importDef.basePath,
        type: "json",
      },
      target: {
        collection: collectionName,
        type: importDef.type || "create",
        primaryKey: importDef.primaryKeyField,
        createUsers: importDef.createUsers || false,
      },
      mapping: {
        attributes: importDef.attributeMappings.map(attr => ({
          oldKey: attr.oldKey,
          oldKeys: attr.oldKeys,
          targetKey: attr.targetKey,
          valueToSet: attr.valueToSet,
          fileData: attr.fileData,
          converters: attr.converters || [],
          validation: (attr.validationActions || []).map(v => ({
            rule: v.action,
            params: v.params,
          })),
          afterImport: (attr.postImportActions || []).map(a => ({
            action: a.action,
            params: a.params,
          })),
        })),
        relationships: (importDef.idMappings || []).map(rel => ({
          sourceField: rel.sourceField,
          targetField: rel.targetField,
          targetCollection: rel.targetCollection,
          fieldToSet: rel.fieldToSet,
          targetFieldToMatch: rel.targetFieldToMatch,
        })),
      },
      options: {
        batchSize: 50,
        skipValidation: false,
        dryRun: false,
        continueOnError: true,
        updateMapping: importDef.updateMapping,
      },
    };

    const yamlContent = yaml.dump(yamlConfig, {
      indent: 2,
      lineWidth: 120,
      sortKeys: false,
    });

    const entityType = useTableTerminology ? 'Table' : 'Collection';
    return `# yaml-language-server: $schema=../.yaml_schemas/import-config.schema.json\n# Import Configuration for ${entityType}: ${collectionName}\n\n${yamlContent}`;
  }

  /**
   * Exports existing TypeScript import configurations to YAML files.
   * Helps migrate from TypeScript to YAML-based configurations.
   * Supports both collection and table terminology.
   *
   * @param collections - Collections with existing import definitions
   * @param useTableTerminology - Whether to use table terminology
   */
  async exportToYaml(
    collections: CollectionCreate[],
    useTableTerminology = false
  ): Promise<void> {
    const exportDir = path.join(this.appwriteFolderPath, "import", "exported");
    
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    let exportedCount = 0;

    for (const collection of collections) {
      if (!collection.importDefs || collection.importDefs.length === 0) {
        continue;
      }

      for (let i = 0; i < collection.importDefs.length; i++) {
        const importDef = collection.importDefs[i];
        const yamlContent = this.convertImportDefToYaml(
          importDef,
          collection.name,
          useTableTerminology
        );

        const entityType = useTableTerminology ? 'table' : 'collection';
        const filename = collection.importDefs.length > 1
          ? `${collection.name}-${entityType}-${i + 1}.yaml`
          : `${collection.name}-${entityType}.yaml`;

        const filePath = path.join(exportDir, filename);
        fs.writeFileSync(filePath, yamlContent);
        exportedCount++;

        logger.info(`Exported import configuration: ${filePath}`);
      }
    }

    logger.info(`Exported ${exportedCount} import configurations to YAML`);
  }

  /**
   * Gets statistics about YAML import configurations.
   */
  async getStatistics(): Promise<{
    hasYamlConfigs: boolean;
    totalConfigurations: number;
    collectionsWithConfigs: number;
    configurationsByType: { [type: string]: number };
    totalAttributeMappings: number;
    totalRelationshipMappings: number;
  }> {
    try {
      const yamlConfigs = await this.configLoader.loadAllImportConfigs();
      const stats = this.configLoader.getStatistics(yamlConfigs);
      
      return {
        hasYamlConfigs: yamlConfigs.size > 0,
        totalConfigurations: stats.totalConfigurations,
        collectionsWithConfigs: stats.collectionsWithConfigs,
        configurationsByType: stats.configsByType,
        totalAttributeMappings: stats.totalAttributeMappings,
        totalRelationshipMappings: stats.totalRelationshipMappings,
      };
    } catch (error) {
      logger.error("Failed to get YAML import statistics:", error);
      return {
        hasYamlConfigs: false,
        totalConfigurations: 0,
        collectionsWithConfigs: 0,
        configurationsByType: {},
        totalAttributeMappings: 0,
        totalRelationshipMappings: 0,
      };
    }
  }

  /**
   * Creates a new YAML import configuration from a template.
   * Supports both collection and table terminology.
   *
   * @param collectionName - Name of the collection
   * @param sourceFile - Source data file name
   * @param useTableTerminology - Whether to use table terminology
   * @param outputPath - Output file path (optional)
   */
  async createFromTemplate(
    collectionName: string,
    sourceFile: string,
    useTableTerminology = false,
    outputPath?: string
  ): Promise<string> {
    const template = this.configLoader.generateTemplate(
      collectionName,
      sourceFile,
      useTableTerminology
    );

    const entityType = useTableTerminology ? 'table' : 'collection';
    const fileName = outputPath || `${collectionName.toLowerCase()}-${entityType}-import.yaml`;
    const fullPath = path.join(this.appwriteFolderPath, "import", fileName);

    // Add schema reference to template with entity type comment
    const schemaHeader = "# yaml-language-server: $schema=../.yaml_schemas/import-config.schema.json\n";
    const entityComment = `# Import Configuration for ${useTableTerminology ? 'Table' : 'Collection'}: ${collectionName}\n`;
    const templateWithSchema = schemaHeader + entityComment + template;

    fs.writeFileSync(fullPath, templateWithSchema);
    logger.info(`Created YAML import configuration: ${fullPath}`);

    return fullPath;
  }

  /**
   * Checks if YAML import system is properly set up.
   */
  async isSetupComplete(): Promise<{
    isComplete: boolean;
    missingComponents: string[];
  }> {
    const missingComponents: string[] = [];

    // Check import directory
    const importDir = path.join(this.appwriteFolderPath, "import");
    if (!fs.existsSync(importDir)) {
      missingComponents.push("import directory");
    }

    // Check schema files
    const schemaDir = path.join(this.appwriteFolderPath, ".yaml_schemas");
    const importSchemaPath = path.join(schemaDir, "import-config.schema.json");
    if (!fs.existsSync(importSchemaPath)) {
      missingComponents.push("import configuration schema");
    }

    return {
      isComplete: missingComponents.length === 0,
      missingComponents,
    };
  }
}
