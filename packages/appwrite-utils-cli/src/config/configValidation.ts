import { z } from "zod";
import { type AppwriteConfig, type CollectionCreate, type TableCreate } from "appwrite-utils";
import { MessageFormatter } from "../shared/messageFormatter.js";
import chalk from "chalk";

/**
 * Validation error types for different categories of issues
 */
export type ValidationErrorType =
  | "naming_conflict"
  | "invalid_database_reference"
  | "missing_required_field"
  | "schema_inconsistency"
  | "duplicate_definition"
  | "cross_array_conflict";

/**
 * Detailed validation error information
 */
export interface ValidationError {
  type: ValidationErrorType;
  message: string;
  details?: string;
  suggestion?: string;
  affectedItems?: string[];
  severity: "error" | "warning" | "info";
}

/**
 * Configuration validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  suggestions: ValidationError[];
}

/**
 * Conflict information between collections and tables
 */
export interface ConfigConflict {
  name: string;
  collectionsIndex?: number;
  tablesIndex?: number;
  type: "name" | "id" | "database_reference";
  message: string;
}

/**
 * Main configuration validation function
 * Validates the dual collections/tables configuration schema
 */
export function validateCollectionsTablesConfig(config: AppwriteConfig): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const suggestions: ValidationError[] = [];

  // Basic structure validation
  const structureErrors = validateBasicStructure(config);
  errors.push(...structureErrors.filter(e => e.severity === "error"));
  warnings.push(...structureErrors.filter(e => e.severity === "warning"));

  // Naming conflicts validation
  const namingConflicts = detectNamingConflicts(config);
  errors.push(...namingConflicts.filter(e => e.severity === "error"));
  warnings.push(...namingConflicts.filter(e => e.severity === "warning"));

  // Database reference validation
  const dbRefErrors = validateDatabaseReferences(config);
  errors.push(...dbRefErrors.filter(e => e.severity === "error"));
  warnings.push(...dbRefErrors.filter(e => e.severity === "warning"));

  // Schema consistency validation
  const consistencyErrors = validateSchemaConsistency(config);
  errors.push(...consistencyErrors.filter(e => e.severity === "error"));
  warnings.push(...consistencyErrors.filter(e => e.severity === "warning"));
  suggestions.push(...consistencyErrors.filter(e => e.severity === "info"));

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions
  };
}

/**
 * Validates basic structure of collections and tables arrays
 */
function validateBasicStructure(config: AppwriteConfig): ValidationError[] {
  const errors: ValidationError[] = [];

  // Ensure arrays exist
  if (!config.collections && !config.tables) {
    errors.push({
      type: "missing_required_field",
      message: "No collections or tables defined",
      details: "Configuration must include either collections or tables array",
      suggestion: "Add collections array for legacy Databases API or tables array for TablesDB API",
      severity: "warning"
    });
  }

  // Validate collections array structure
  if (config.collections) {
    config.collections.forEach((item, index) => {
      if (!item.name && !item.$id) {
        errors.push({
          type: "missing_required_field",
          message: `Collection at index ${index} missing required name or $id`,
          details: "Each collection must have either a name or $id field",
          suggestion: "Add name field to the collection definition",
          affectedItems: [`collections[${index}]`],
          severity: "error"
        });
      }
    });
  }

  // Validate tables array structure
  if (config.tables) {
    config.tables.forEach((item, index) => {
      if (!item.name && !item.tableId && !item.$id) {
        errors.push({
          type: "missing_required_field",
          message: `Table at index ${index} missing required name, tableId, or $id`,
          details: "Each table must have at least a name, tableId, or $id field",
          suggestion: "Add name field to the table definition",
          affectedItems: [`tables[${index}]`],
          severity: "error"
        });
      }
    });
  }

  return errors;
}

/**
 * Detects naming conflicts between collections and tables
 */
export function detectNamingConflicts(config: AppwriteConfig): ValidationError[] {
  const errors: ValidationError[] = [];
  const conflicts = findNamingConflicts(config);

  conflicts.forEach(conflict => {
    errors.push({
      type: "naming_conflict",
      message: `Naming conflict detected: '${conflict.name}'`,
      details: conflict.message,
      suggestion: conflict.type === "name" ?
        "Rename one of the conflicting items to avoid confusion" :
        "Use different IDs to ensure unique identification",
      affectedItems: [
        conflict.collectionsIndex !== undefined ? `collections[${conflict.collectionsIndex}]` : undefined,
        conflict.tablesIndex !== undefined ? `tables[${conflict.tablesIndex}]` : undefined
      ].filter(Boolean) as string[],
      severity: "error"
    });
  });

  return errors;
}

/**
 * Find naming conflicts between collections and tables
 */
export function findNamingConflicts(config: AppwriteConfig): ConfigConflict[] {
  const conflicts: ConfigConflict[] = [];
  const collections = config.collections || [];
  const tables = config.tables || [];

  // Create maps for efficient lookup
  const collectionsByName = new Map<string, number>();
  const collectionsByI = new Map<string, number>();
  const tablesByName = new Map<string, number>();
  const tablesById = new Map<string, number>();

  // Index collections
  collections.forEach((collection, index) => {
    if (collection.name) {
      collectionsByName.set(collection.name.toLowerCase(), index);
    }
    if (collection.$id) {
      collectionsByI.set(collection.$id.toLowerCase(), index);
    }
  });

  // Check tables for conflicts
  tables.forEach((table, tableIndex) => {
    const tableName = table.name?.toLowerCase();
    const tableId = (table.tableId || table.$id)?.toLowerCase();

    // Check name conflicts
    if (tableName && collectionsByName.has(tableName)) {
      conflicts.push({
        name: table.name!,
        collectionsIndex: collectionsByName.get(tableName),
        tablesIndex: tableIndex,
        type: "name",
        message: `Table '${table.name}' has the same name as a collection`
      });
    }

    // Check ID conflicts
    if (tableId && collectionsByI.has(tableId)) {
      conflicts.push({
        name: tableId,
        collectionsIndex: collectionsByI.get(tableId),
        tablesIndex: tableIndex,
        type: "id",
        message: `Table '${tableId}' has the same ID as a collection`
      });
    }
  });

  return conflicts;
}

/**
 * Validates database ID references in collections and tables
 */
export function validateDatabaseReferences(config: AppwriteConfig): ValidationError[] {
  const errors: ValidationError[] = [];
  const validDatabaseIds = new Set((config.databases || []).map(db => db.$id));

  // Validate collection database references
  if (config.collections) {
    config.collections.forEach((collection, index) => {
      if (collection.databaseId && !validDatabaseIds.has(collection.databaseId)) {
        errors.push({
          type: "invalid_database_reference",
          message: `Collection '${collection.name || collection.$id}' references invalid database '${collection.databaseId}'`,
          details: `Database '${collection.databaseId}' is not defined in the databases array`,
          suggestion: `Add database with $id '${collection.databaseId}' to the databases array or use a valid database ID`,
          affectedItems: [`collections[${index}].databaseId`],
          severity: "error"
        });
      }
    });
  }

  // Validate table database references
  if (config.tables) {
    config.tables.forEach((table, index) => {
      if (table.databaseId && !validDatabaseIds.has(table.databaseId)) {
        errors.push({
          type: "invalid_database_reference",
          message: `Table '${table.name || table.tableId}' references invalid database '${table.databaseId}'`,
          details: `Database '${table.databaseId}' is not defined in the databases array`,
          suggestion: `Add database with $id '${table.databaseId}' to the databases array or use a valid database ID`,
          affectedItems: [`tables[${index}].databaseId`],
          severity: "error"
        });
      }
    });
  }

  return errors;
}

/**
 * Validates schema consistency between collections and tables
 */
export function validateSchemaConsistency(config: AppwriteConfig): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check for duplicate definitions within the same array
  if (config.collections) {
    const duplicates = findDuplicatesInArray(config.collections, 'collections');
    errors.push(...duplicates);
  }

  if (config.tables) {
    const duplicates = findDuplicatesInArray(config.tables, 'tables');
    errors.push(...duplicates);
  }

  // Suggest using tables for newer Appwrite versions
  if (config.collections && config.collections.length > 0 && (!config.tables || config.tables.length === 0)) {
    errors.push({
      type: "schema_inconsistency",
      message: "Using collections without tables",
      details: "Consider migrating to tables for compatibility with Appwrite 1.8+ and TablesDB API",
      suggestion: "Use the migration utilities to convert collections to tables format",
      severity: "info"
    });
  }

  // Warn about mixed usage without apiMode configuration
  if (config.collections && config.collections.length > 0 && config.tables && config.tables.length > 0 && config.apiMode === "auto") {
    errors.push({
      type: "schema_inconsistency",
      message: "Mixed collections and tables with auto API mode",
      details: "Using both collections and tables with auto API mode may lead to unpredictable behavior",
      suggestion: "Set apiMode to 'legacy' or 'tablesdb' explicitly, or migrate all collections to tables",
      severity: "warning"
    });
  }

  return errors;
}

/**
 * Find duplicate definitions within a single array
 */
function findDuplicatesInArray(items: (CollectionCreate | TableCreate)[], arrayName: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const namesSeen = new Set<string>();
  const idsSeen = new Set<string>();

  items.forEach((item, index) => {
    const name = item.name?.toLowerCase();
    const rawId = ('$id' in item && item.$id) || ('tableId' in item && item.tableId);
    const id = rawId && typeof rawId === 'string' ? rawId.toLowerCase() : undefined;

    // Check name duplicates
    if (name) {
      if (namesSeen.has(name)) {
        errors.push({
          type: "duplicate_definition",
          message: `Duplicate name '${item.name}' in ${arrayName} array`,
          details: `The name '${item.name}' appears multiple times in the ${arrayName} array`,
          suggestion: "Use unique names for each item in the array",
          affectedItems: [`${arrayName}[${index}].name`],
          severity: "error"
        });
      } else {
        namesSeen.add(name);
      }
    }

    // Check ID duplicates
    if (id) {
      if (idsSeen.has(id)) {
        errors.push({
          type: "duplicate_definition",
          message: `Duplicate ID '${id}' in ${arrayName} array`,
          details: `The ID '${id}' appears multiple times in the ${arrayName} array`,
          suggestion: "Use unique IDs for each item in the array",
          affectedItems: [`${arrayName}[${index}].${arrayName === 'tables' ? 'tableId' : '$id'}`],
          severity: "error"
        });
      } else {
        idsSeen.add(id);
      }
    }
  });

  return errors;
}

/**
 * Reports validation results with formatted output
 */
export function reportValidationResults(result: ValidationResult, options: { verbose?: boolean } = {}): void {
  const { verbose = false } = options;

  if (result.isValid) {
    MessageFormatter.success("Configuration validation passed", { prefix: "Validation" });

    if (result.warnings.length > 0) {
      MessageFormatter.info(`Found ${result.warnings.length} warnings`, { prefix: "Validation" });
      if (verbose) {
        result.warnings.forEach(warning => {
          MessageFormatter.warning(warning.message, { prefix: "Warning" });
          if (warning.details) {
            console.log(chalk.gray(`  Details: ${warning.details}`));
          }
          if (warning.suggestion) {
            console.log(chalk.blue(`  Suggestion: ${warning.suggestion}`));
          }
        });
      }
    }

    if (result.suggestions.length > 0 && verbose) {
      MessageFormatter.info(`Found ${result.suggestions.length} suggestions`, { prefix: "Validation" });
      result.suggestions.forEach(suggestion => {
        MessageFormatter.info(suggestion.message, { prefix: "Suggestion" });
        if (suggestion.details) {
          console.log(chalk.gray(`  Details: ${suggestion.details}`));
        }
        if (suggestion.suggestion) {
          console.log(chalk.blue(`  Recommendation: ${suggestion.suggestion}`));
        }
      });
    }
  } else {
    MessageFormatter.error(`Configuration validation failed with ${result.errors.length} errors`, undefined, { prefix: "Validation" });

    result.errors.forEach(error => {
      MessageFormatter.error(error.message, undefined, { prefix: "Error" });
      if (error.details) {
        console.log(chalk.gray(`  Details: ${error.details}`));
      }
      if (error.suggestion) {
        console.log(chalk.blue(`  Suggestion: ${error.suggestion}`));
      }
      if (error.affectedItems?.length) {
        console.log(chalk.gray(`  Affected: ${error.affectedItems.join(", ")}`));
      }
    });

    if (result.warnings.length > 0) {
      MessageFormatter.warning(`Also found ${result.warnings.length} warnings`, { prefix: "Validation" });
      if (verbose) {
        result.warnings.forEach(warning => {
          MessageFormatter.warning(warning.message, { prefix: "Warning" });
          if (warning.details) {
            console.log(chalk.gray(`  Details: ${warning.details}`));
          }
          if (warning.suggestion) {
            console.log(chalk.blue(`  Suggestion: ${warning.suggestion}`));
          }
        });
      }
    }
  }
}

/**
 * Validation with strict mode for enhanced checking
 */
export function validateWithStrictMode(config: AppwriteConfig, strictMode: boolean = false): ValidationResult {
  const result = validateCollectionsTablesConfig(config);

  if (strictMode) {
    // In strict mode, promote warnings to errors
    const promotedErrors = result.warnings.map(warning => ({
      ...warning,
      severity: "error" as const
    }));

    return {
      isValid: result.errors.length === 0 && result.warnings.length === 0,
      errors: [...result.errors, ...promotedErrors],
      warnings: [],
      suggestions: result.suggestions
    };
  }

  return result;
}