import type {
  AttributeMappings,
  ImportDef,
  CollectionCreate,
} from "appwrite-utils";
import type { ImportDataActions } from "../importDataActions.js";
import { logger } from "../../shared/logging.js";

/**
 * Service responsible for validation during import operations.
 * Provides centralized validation logic extracted from ImportDataActions and DataLoader.
 */
export class ValidationService {
  private importDataActions: ImportDataActions;

  constructor(importDataActions: ImportDataActions) {
    this.importDataActions = importDataActions;
  }

  /**
   * Validates a single data item based on defined validation rules.
   * Preserves existing validation logic from ImportDataActions.
   * 
   * @param item - The data item to validate
   * @param attributeMappings - The attribute mappings for the data item
   * @param context - The context for resolving templated parameters in validation rules
   * @returns True if the item is valid, false otherwise
   */
  validateDataItem(
    item: any,
    attributeMappings: AttributeMappings,
    context: { [key: string]: any }
  ): boolean {
    try {
      return this.importDataActions.validateItem(item, attributeMappings, context);
    } catch (error) {
      logger.error(`Validation error for item: ${JSON.stringify(item, null, 2)}`, error);
      return false;
    }
  }

  /**
   * Validates an import definition before processing begins.
   * Provides early validation to catch configuration issues.
   * 
   * @param importDef - The import definition to validate
   * @returns Array of validation errors (empty if valid)
   */
  validateImportDefinition(importDef: ImportDef): string[] {
    const errors: string[] = [];

    // Validate required fields
    if (!importDef.filePath) {
      errors.push("filePath is required");
    }

    if (!importDef.attributeMappings || importDef.attributeMappings.length === 0) {
      errors.push("attributeMappings are required");
    }

    // Validate attribute mappings
    if (importDef.attributeMappings) {
      for (let i = 0; i < importDef.attributeMappings.length; i++) {
        const mapping = importDef.attributeMappings[i];
        
        if (!mapping.targetKey) {
          errors.push(`attributeMappings[${i}]: targetKey is required`);
        }

        if (!mapping.oldKey && !mapping.oldKeys && mapping.valueToSet === undefined) {
          errors.push(
            `attributeMappings[${i}]: must have either oldKey, oldKeys, or valueToSet`
          );
        }

        // Validate file data if present
        if (mapping.fileData) {
          if (!mapping.fileData.path) {
            errors.push(`attributeMappings[${i}].fileData: path is required`);
          }
          if (!mapping.fileData.name) {
            errors.push(`attributeMappings[${i}].fileData: name is required`);
          }
        }

        // Validate converters if present
        if (mapping.converters && !Array.isArray(mapping.converters)) {
          errors.push(`attributeMappings[${i}].converters: must be an array`);
        }

        // Validate validation actions if present
        if (mapping.validationActions) {
          if (!Array.isArray(mapping.validationActions)) {
            errors.push(`attributeMappings[${i}].validationActions: must be an array`);
          } else {
            for (let j = 0; j < mapping.validationActions.length; j++) {
              const action = mapping.validationActions[j];
              if (!action.action) {
                errors.push(
                  `attributeMappings[${i}].validationActions[${j}]: action is required`
                );
              }
              if (!Array.isArray(action.params)) {
                errors.push(
                  `attributeMappings[${i}].validationActions[${j}]: params must be an array`
                );
              }
            }
          }
        }

        // Validate post-import actions if present
        if (mapping.postImportActions) {
          if (!Array.isArray(mapping.postImportActions)) {
            errors.push(`attributeMappings[${i}].postImportActions: must be an array`);
          } else {
            for (let j = 0; j < mapping.postImportActions.length; j++) {
              const action = mapping.postImportActions[j];
              if (!action.action) {
                errors.push(
                  `attributeMappings[${i}].postImportActions[${j}]: action is required`
                );
              }
              if (!Array.isArray(action.params)) {
                errors.push(
                  `attributeMappings[${i}].postImportActions[${j}]: params must be an array`
                );
              }
            }
          }
        }
      }
    }

    // Validate ID mappings if present
    if (importDef.idMappings) {
      for (let i = 0; i < importDef.idMappings.length; i++) {
        const idMapping = importDef.idMappings[i];
        
        if (!idMapping.sourceField) {
          errors.push(`idMappings[${i}]: sourceField is required`);
        }
        if (!idMapping.targetField) {
          errors.push(`idMappings[${i}]: targetField is required`);
        }
        if (!idMapping.targetCollection) {
          errors.push(`idMappings[${i}]: targetCollection is required`);
        }
      }
    }

    // Validate update mapping if present
    if (importDef.updateMapping) {
      if (!importDef.updateMapping.originalIdField) {
        errors.push("updateMapping: originalIdField is required");
      }
      if (!importDef.updateMapping.targetField) {
        errors.push("updateMapping: targetField is required");
      }
    }

    return errors;
  }

  /**
   * Validates a collection configuration for import compatibility.
   * Ensures the collection has the necessary attributes for import operations.
   * 
   * @param collection - The collection to validate
   * @param importDefs - The import definitions that will be used with this collection
   * @returns Array of validation errors (empty if valid)
   */
  validateCollectionForImport(
    collection: CollectionCreate,
    importDefs: ImportDef[]
  ): string[] {
    const errors: string[] = [];

    if (!collection.name) {
      errors.push("Collection name is required");
    }

    if (!collection.attributes || collection.attributes.length === 0) {
      errors.push("Collection must have attributes defined");
    }

    // Validate that target keys in import definitions exist as attributes
    for (const importDef of importDefs) {
      for (const mapping of importDef.attributeMappings) {
        const attributeExists = collection.attributes?.some(
          attr => attr.key === mapping.targetKey
        );
        
        if (!attributeExists) {
          errors.push(
            `Attribute '${mapping.targetKey}' referenced in import mapping not found in collection`
          );
        }
      }
    }

    return errors;
  }

  /**
   * Validates data consistency across multiple collections.
   * Checks for relationship integrity and data consistency.
   * 
   * @param collections - Array of collections to validate
   * @returns Array of validation errors (empty if valid)
   */
  validateCrossCollectionConsistency(
    collections: CollectionCreate[]
  ): string[] {
    const errors: string[] = [];
    const collectionNames = new Set(collections.map(c => c.name));

    for (const collection of collections) {
      if (!collection.importDefs) continue;

      for (const importDef of collection.importDefs) {
        if (!importDef.idMappings) continue;

        for (const idMapping of importDef.idMappings) {
          // Check if target collection exists
          if (!collectionNames.has(idMapping.targetCollection)) {
            errors.push(
              `Collection '${collection.name}' references non-existent target collection '${idMapping.targetCollection}' in ID mapping`
            );
          }
        }
      }
    }

    return errors;
  }

  /**
   * Performs comprehensive pre-import validation.
   * Validates all aspects of the import configuration before starting.
   * 
   * @param collections - Collections that will be imported
   * @param appwriteFolderPath - Path to the appwrite folder for file validation
   * @returns Validation result with errors and warnings
   */
  performPreImportValidation(
    collections: CollectionCreate[],
    appwriteFolderPath: string
  ): {
    errors: string[];
    warnings: string[];
    isValid: boolean;
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate each collection
    for (const collection of collections) {
      const collectionErrors = this.validateCollectionForImport(
        collection,
        collection.importDefs || []
      );
      errors.push(...collectionErrors.map(err => `${collection.name}: ${err}`));

      // Validate each import definition
      if (collection.importDefs) {
        for (let i = 0; i < collection.importDefs.length; i++) {
          const importDef = collection.importDefs[i];
          const importDefErrors = this.validateImportDefinition(importDef);
          errors.push(
            ...importDefErrors.map(
              err => `${collection.name}.importDefs[${i}]: ${err}`
            )
          );

          // Check if import file exists
          try {
            const fs = require("fs");
            const path = require("path");
            const filePath = path.resolve(appwriteFolderPath, importDef.filePath);
            if (!fs.existsSync(filePath)) {
              errors.push(
                `${collection.name}.importDefs[${i}]: Import file not found: ${filePath}`
              );
            }
          } catch (error) {
            warnings.push(
              `${collection.name}.importDefs[${i}]: Could not validate file existence: ${error}`
            );
          }
        }
      }
    }

    // Validate cross-collection consistency
    const crossCollectionErrors = this.validateCrossCollectionConsistency(collections);
    errors.push(...crossCollectionErrors);

    return {
      errors,
      warnings,
      isValid: errors.length === 0,
    };
  }

  /**
   * Validates import progress and data integrity during import.
   * Can be used for periodic validation during long-running imports.
   * 
   * @param processedItems - Number of items processed so far
   * @param totalItems - Total number of items to process
   * @param errorCount - Number of errors encountered
   * @returns Validation status with recommendations
   */
  validateImportProgress(
    processedItems: number,
    totalItems: number,
    errorCount: number
  ): {
    status: "healthy" | "warning" | "critical";
    message: string;
    shouldContinue: boolean;
  } {
    const errorRate = errorCount / Math.max(processedItems, 1);
    const progress = processedItems / totalItems;

    if (errorRate > 0.5) {
      return {
        status: "critical",
        message: `Error rate too high: ${(errorRate * 100).toFixed(1)}%. Consider stopping import.`,
        shouldContinue: false,
      };
    }

    if (errorRate > 0.1) {
      return {
        status: "warning",
        message: `Elevated error rate: ${(errorRate * 100).toFixed(1)}%. Monitor closely.`,
        shouldContinue: true,
      };
    }

    return {
      status: "healthy",
      message: `Import progressing normally: ${(progress * 100).toFixed(1)}% complete, ${(errorRate * 100).toFixed(1)}% error rate.`,
      shouldContinue: true,
    };
  }
}