import yaml from "js-yaml";
import fs from "fs";
import path from "path";
import { logger } from "../shared/logging.js";
import {
  normalizeYamlData,
  usesTableTerminology,
  convertTerminology,
  type YamlCollectionData,
  type YamlTerminologyConfig
} from "./yamlConverter.js";
import {
  CollectionCreateSchema,
  type CollectionCreate,
  type CollectionCreateInput
} from "appwrite-utils";

/**
 * Enhanced YAML loader with dual terminology support
 */
export class YamlLoader {
  private baseDirectory: string;

  constructor(baseDirectory: string) {
    this.baseDirectory = baseDirectory;
  }

  /**
   * Loads a YAML file with automatic terminology detection and normalization
   */
  async loadCollectionYaml(filePath: string): Promise<{
    data: YamlCollectionData;
    originalTerminology: 'collection' | 'table';
    normalized: YamlCollectionData;
  }> {
    const fullPath = path.resolve(this.baseDirectory, filePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`YAML file not found: ${fullPath}`);
    }

    try {
      const yamlContent = fs.readFileSync(fullPath, "utf8");
      const rawData = yaml.load(yamlContent) as YamlCollectionData;

      // Detect original terminology
      const originalTerminology = usesTableTerminology(rawData) ? 'table' : 'collection';

      // Normalize to collection terminology for internal processing
      const normalized = normalizeYamlData(rawData);

      logger.info(`Loaded YAML file: ${filePath} (${originalTerminology} terminology)`);

      return {
        data: rawData,
        originalTerminology,
        normalized
      };
    } catch (error) {
      throw new Error(`Failed to load YAML file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Loads multiple YAML files from a directory with terminology support
   */
  async loadDirectoryYamls(
    directoryPath: string,
    targetTerminology?: 'collection' | 'table'
  ): Promise<{
    collections: Array<{
      filePath: string;
      data: YamlCollectionData;
      originalTerminology: 'collection' | 'table';
      converted?: YamlCollectionData;
    }>;
    summary: {
      total: number;
      collectionFormat: number;
      tableFormat: number;
      converted: number;
    };
  }> {
    const fullDirectoryPath = path.resolve(this.baseDirectory, directoryPath);

    if (!fs.existsSync(fullDirectoryPath)) {
      logger.warn(`Directory not found: ${fullDirectoryPath}`);
      return {
        collections: [],
        summary: { total: 0, collectionFormat: 0, tableFormat: 0, converted: 0 }
      };
    }

    const collections: Array<{
      filePath: string;
      data: YamlCollectionData;
      originalTerminology: 'collection' | 'table';
      converted?: YamlCollectionData;
    }> = [];

    const files = fs.readdirSync(fullDirectoryPath, { withFileTypes: true });
    let collectionFormatCount = 0;
    let tableFormatCount = 0;
    let convertedCount = 0;

    for (const file of files) {
      if (file.isFile() && file.name.endsWith('.yaml')) {
        try {
          const filePath = path.join(directoryPath, file.name);
          const result = await this.loadCollectionYaml(filePath);

          let converted: YamlCollectionData | undefined;

          // Convert terminology if requested and different from original
          if (targetTerminology && targetTerminology !== result.originalTerminology) {
            converted = convertTerminology(result.data, targetTerminology === 'table');
            convertedCount++;
          }

          collections.push({
            filePath,
            data: result.data,
            originalTerminology: result.originalTerminology,
            converted
          });

          if (result.originalTerminology === 'collection') {
            collectionFormatCount++;
          } else {
            tableFormatCount++;
          }
        } catch (error) {
          logger.error(`Failed to load ${file.name}:`, error);
        }
      }
    }

    return {
      collections,
      summary: {
        total: collections.length,
        collectionFormat: collectionFormatCount,
        tableFormat: tableFormatCount,
        converted: convertedCount
      }
    };
  }

  /**
   * Converts YAML data to CollectionCreate format for internal use
   */
  yamlToCollectionCreate(yamlData: YamlCollectionData): CollectionCreate {
    // Always normalize to ensure consistent attribute terminology
    const normalized = normalizeYamlData(yamlData);

    const collectionInput: CollectionCreateInput = {
      name: normalized.name,
      $id: normalized.id || normalized.name.toLowerCase().replace(/\s+/g, '_'),
      enabled: normalized.enabled !== false,
      documentSecurity: normalized.documentSecurity || false,
      $permissions: normalized.permissions?.map(p => ({
        permission: p.permission,
        target: p.target
      })) || [],
      attributes: normalized.attributes?.map(attr => ({
        key: attr.key,
        type: attr.type as any,
        size: attr.size,
        required: attr.required || false,
        array: attr.array || false,
        xdefault: attr.default,
        min: attr.min,
        max: attr.max,
        elements: attr.elements,
        relatedCollection: attr.relatedCollection,
        relationType: attr.relationType as any,
        twoWay: attr.twoWay,
        twoWayKey: attr.twoWayKey,
        onDelete: attr.onDelete as any,
        side: attr.side as any,
        encrypt: (attr as any).encrypt,
        format: (attr as any).format
      })) || [],
      indexes: normalized.indexes?.map(idx => ({
        key: idx.key,
        type: idx.type as any,
        attributes: idx.attributes,
        orders: idx.orders as any[]
      })) || [],
      importDefs: normalized.importDefs || []
    };

    return CollectionCreateSchema.parse(collectionInput);
  }

  /**
   * Saves YAML data with specified terminology
   */
  async saveCollectionYaml(
    filePath: string,
    data: YamlCollectionData,
    config: YamlTerminologyConfig
  ): Promise<void> {
    const fullPath = path.resolve(this.baseDirectory, filePath);
    const directory = path.dirname(fullPath);

    // Ensure directory exists
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    // Convert to target terminology if needed
    const targetData = config.useTableTerminology
      ? convertTerminology(data, true)
      : normalizeYamlData(data);

    // Generate YAML content
    const yamlContent = yaml.dump(targetData, {
      indent: 2,
      lineWidth: 120,
      sortKeys: false,
      quotingType: '"',
      forceQuotes: false,
    });

    // Add schema reference and header
    const schemaPath = config.schemaPath ||
      (config.useTableTerminology ? "../.yaml_schemas/table.schema.json" : "../.yaml_schemas/collection.schema.json");
    const entityType = config.useTableTerminology ? 'Table' : 'Collection';

    const header = `# yaml-language-server: $schema=${schemaPath}
# ${entityType} Definition: ${data.name}
`;

    const finalContent = header + yamlContent;

    fs.writeFileSync(fullPath, finalContent, "utf8");
    logger.info(`Saved ${entityType.toLowerCase()} YAML: ${fullPath}`);
  }

  /**
   * Migrates YAML files from one terminology to another
   */
  async migrateTerminology(
    sourceDirectory: string,
    targetDirectory: string,
    toTableTerminology: boolean
  ): Promise<{
    migrated: number;
    skipped: number;
    errors: string[];
  }> {
    const result = await this.loadDirectoryYamls(sourceDirectory);
    const errors: string[] = [];
    let migrated = 0;
    let skipped = 0;

    // Ensure target directory exists
    const fullTargetPath = path.resolve(this.baseDirectory, targetDirectory);
    if (!fs.existsSync(fullTargetPath)) {
      fs.mkdirSync(fullTargetPath, { recursive: true });
    }

    for (const collection of result.collections) {
      try {
        const needsMigration = toTableTerminology
          ? collection.originalTerminology === 'collection'
          : collection.originalTerminology === 'table';

        if (!needsMigration) {
          skipped++;
          continue;
        }

        const targetFileName = path.basename(collection.filePath);
        const targetFilePath = path.join(targetDirectory, targetFileName);

        await this.saveCollectionYaml(
          targetFilePath,
          collection.data,
          {
            useTableTerminology: toTableTerminology,
            entityType: toTableTerminology ? 'table' : 'collection'
          }
        );

        migrated++;
      } catch (error) {
        const errorMessage = `Failed to migrate ${collection.filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMessage);
        logger.error(errorMessage);
      }
    }

    logger.info(`Migration complete: ${migrated} migrated, ${skipped} skipped, ${errors.length} errors`);

    return { migrated, skipped, errors };
  }

  /**
   * Validates YAML files for terminology consistency
   */
  async validateTerminologyConsistency(directoryPath: string): Promise<{
    isConsistent: boolean;
    issues: Array<{
      file: string;
      issue: string;
      severity: 'warning' | 'error';
    }>;
    summary: {
      collectionFiles: number;
      tableFiles: number;
      mixedFiles: number;
    };
  }> {
    const result = await this.loadDirectoryYamls(directoryPath);
    const issues: Array<{ file: string; issue: string; severity: 'warning' | 'error' }> = [];
    let mixedFiles = 0;

    for (const collection of result.collections) {
      // Check for mixed terminology within a single file
      const data = collection.data;
      const hasAttributes = !!data.attributes && data.attributes.length > 0;
      const hasColumns = !!data.columns && data.columns.length > 0;
      const hasAttributeIndexes = data.indexes?.some(idx => !!idx.attributes);
      const hasColumnIndexes = data.indexes?.some(idx => !!idx.columns);

      if (hasAttributes && hasColumns) {
        issues.push({
          file: collection.filePath,
          issue: "File contains both 'attributes' and 'columns' - use only one terminology",
          severity: 'error'
        });
        mixedFiles++;
      }

      if (hasAttributeIndexes && hasColumnIndexes) {
        issues.push({
          file: collection.filePath,
          issue: "Indexes contain both 'attributes' and 'columns' references - use consistent terminology",
          severity: 'error'
        });
      }

      // Check for missing required fields
      if (!hasAttributes && !hasColumns) {
        issues.push({
          file: collection.filePath,
          issue: "File missing both 'attributes' and 'columns' - at least one is required",
          severity: 'warning'
        });
      }
    }

    return {
      isConsistent: issues.filter(i => i.severity === 'error').length === 0,
      issues,
      summary: {
        collectionFiles: result.summary.collectionFormat,
        tableFiles: result.summary.tableFormat,
        mixedFiles
      }
    };
  }
}

/**
 * Creates a YAML loader instance for the given base directory
 */
export function createYamlLoader(baseDirectory: string): YamlLoader {
  return new YamlLoader(baseDirectory);
}
