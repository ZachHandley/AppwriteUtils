import { type AppwriteConfig, type CollectionCreate, type TableCreate, type TableCreateInput, TableCreateSchema } from "appwrite-utils";
import { MessageFormatter } from "../shared/messageFormatter.js";
import { validateCollectionsTablesConfig, type ValidationResult } from "./configValidation.js";
import path from "path";
import fs from "fs";
import chalk from "chalk";

/**
 * Migration strategy types
 */
export type MigrationStrategy =
  | "full_migration"      // Convert all collections to tables, remove collections array
  | "dual_format"         // Keep collections and add equivalent tables
  | "incremental"         // Migrate specific collections to tables
  | "tables_only";        // Create tables-only configuration

/**
 * Migration plan detailing what will be changed
 */
export interface MigrationPlan {
  strategy: MigrationStrategy;
  collectionsToMigrate: CollectionMigrationItem[];
  collectionsToKeep: CollectionCreate[];
  tablesToCreate: TableCreate[];
  expectedChanges: MigrationChange[];
  estimatedComplexity: "low" | "medium" | "high";
  warnings: string[];
  recommendations: string[];
}

/**
 * Individual collection migration details
 */
export interface CollectionMigrationItem {
  collection: CollectionCreate;
  index: number;
  newTable: TableCreate;
  changes: string[];
  warnings: string[];
}

/**
 * Migration change description
 */
export interface MigrationChange {
  type: "add" | "remove" | "modify" | "rename";
  description: string;
  impact: "low" | "medium" | "high";
  location: string;
}

/**
 * Migration execution result
 */
export interface MigrationResult {
  success: boolean;
  newConfig: AppwriteConfig;
  changes: MigrationChange[];
  validation: ValidationResult;
  warnings: string[];
  errors: string[];
}

/**
 * Migration options
 */
export interface MigrationOptions {
  preserveOriginal?: boolean;
  validateResult?: boolean;
  dryRun?: boolean;
  backupConfig?: boolean;
  targetDirectory?: string;
}

/**
 * Creates a migration plan for converting collections to tables
 */
export function createMigrationPlan(
  config: AppwriteConfig,
  strategy: MigrationStrategy = "full_migration",
  specificCollections?: string[]
): MigrationPlan {
  const collections = config.collections || [];
  const existingTables = config.tables || [];

  const collectionsToMigrate: CollectionMigrationItem[] = [];
  const collectionsToKeep: CollectionCreate[] = [];
  const tablesToCreate: TableCreate[] = [];
  const expectedChanges: MigrationChange[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // Determine which collections to migrate based on strategy
  collections.forEach((collection, index) => {
    const shouldMigrate = determineShouldMigrate(collection, strategy, specificCollections);

    if (shouldMigrate) {
      const migrationItem = createCollectionMigrationItem(collection, index);
      collectionsToMigrate.push(migrationItem);
      tablesToCreate.push(migrationItem.newTable);

      // Check for potential issues
      if (migrationItem.warnings.length > 0) {
        warnings.push(...migrationItem.warnings);
      }
    } else {
      collectionsToKeep.push(collection);
    }
  });

  // Create expected changes
  expectedChanges.push(...createExpectedChanges(strategy, collectionsToMigrate, collectionsToKeep));

  // Assess complexity
  const estimatedComplexity = assessMigrationComplexity(collectionsToMigrate, strategy);

  // Generate recommendations
  recommendations.push(...generateMigrationRecommendations(config, strategy, collectionsToMigrate));

  // Add strategy-specific warnings
  if (strategy === "dual_format") {
    warnings.push("Dual format increases configuration file size and maintenance overhead");
    recommendations.push("Consider migrating to tables_only after testing dual format");
  }

  if (strategy === "full_migration" && collections.length > 10) {
    warnings.push("Large migration may require careful testing and staged deployment");
    recommendations.push("Consider incremental migration for large projects");
  }

  return {
    strategy,
    collectionsToMigrate,
    collectionsToKeep,
    tablesToCreate,
    expectedChanges,
    estimatedComplexity,
    warnings,
    recommendations
  };
}

/**
 * Executes a migration plan
 */
export function executeMigrationPlan(
  config: AppwriteConfig,
  plan: MigrationPlan,
  options: MigrationOptions = {}
): MigrationResult {
  const {
    validateResult = true,
    dryRun = false,
    preserveOriginal = false
  } = options;

  try {
    // Create new configuration based on strategy
    const newConfig = applyMigrationPlan(config, plan, preserveOriginal);

    // Validate the result if requested
    let validation: ValidationResult = { isValid: true, errors: [], warnings: [], suggestions: [] };
    if (validateResult) {
      validation = validateCollectionsTablesConfig(newConfig);
    }

    const changes = plan.expectedChanges;
    const warnings: string[] = [...plan.warnings];
    const errors: string[] = [];

    // Add validation errors to the result
    if (validation.errors.length > 0) {
      errors.push(...validation.errors.map(e => e.message));
    }

    if (validation.warnings.length > 0) {
      warnings.push(...validation.warnings.map(w => w.message));
    }

    const success = errors.length === 0;

    if (dryRun) {
      MessageFormatter.info("Dry run completed - no changes were made", { prefix: "Migration" });
    }

    return {
      success,
      newConfig,
      changes,
      validation,
      warnings,
      errors
    };
  } catch (error) {
    return {
      success: false,
      newConfig: config,
      changes: [],
      validation: { isValid: false, errors: [], warnings: [], suggestions: [] },
      warnings: [],
      errors: [error instanceof Error ? error.message : "Unknown migration error"]
    };
  }
}

/**
 * Converts a single collection to table format
 */
export function convertCollectionToTable(collection: CollectionCreate): TableCreateInput {
  const table: TableCreateInput = {
    name: collection.name,
    tableId: collection.$id || collection.name.toLowerCase().replace(/\s+/g, '_'),
    enabled: collection.enabled,
    documentSecurity: collection.documentSecurity,
    $permissions: collection.$permissions,
    attributes: collection.attributes,
    indexes: collection.indexes,
    importDefs: collection.importDefs,
    databaseId: collection.databaseId
  };

  // Add $id for backward compatibility if it exists
  if (collection.$id) {
    table.$id = collection.$id;
  }

  return table;
}

/**
 * Creates a migration item for a single collection
 */
function createCollectionMigrationItem(collection: CollectionCreate, index: number): CollectionMigrationItem {
  const tableInput = convertCollectionToTable(collection);
  const newTable = TableCreateSchema.parse(tableInput);
  const changes: string[] = [];
  const warnings: string[] = [];

  // Document changes
  changes.push(`Convert collection '${collection.name}' to table format`);

  if (collection.$id && collection.$id !== newTable.tableId) {
    changes.push(`Change ID from '$id: ${collection.$id}' to 'tableId: ${newTable.tableId}'`);
  }

  // Check for potential issues
  if (collection.attributes.some(attr => attr.type === 'relationship')) {
    warnings.push(`Collection '${collection.name}' has relationship attributes that may need manual review`);
  }

  if (collection.indexes && collection.indexes.length > 5) {
    warnings.push(`Collection '${collection.name}' has many indexes (${collection.indexes.length}) - verify compatibility`);
  }

  return {
    collection,
    index,
    newTable,
    changes,
    warnings
  };
}

/**
 * Determines if a collection should be migrated based on strategy
 */
function determineShouldMigrate(
  collection: CollectionCreate,
  strategy: MigrationStrategy,
  specificCollections?: string[]
): boolean {
  switch (strategy) {
    case "full_migration":
    case "tables_only":
      return true;

    case "dual_format":
      return true;

    case "incremental":
      if (!specificCollections || specificCollections.length === 0) {
        return false;
      }
      return specificCollections.includes(collection.name) ||
             specificCollections.includes(collection.$id || "");

    default:
      return false;
  }
}

/**
 * Creates expected changes list based on migration plan
 */
function createExpectedChanges(
  strategy: MigrationStrategy,
  collectionsToMigrate: CollectionMigrationItem[],
  collectionsToKeep: CollectionCreate[]
): MigrationChange[] {
  const changes: MigrationChange[] = [];

  // Add table creation changes
  collectionsToMigrate.forEach(item => {
    changes.push({
      type: "add",
      description: `Add table '${item.newTable.name}' converted from collection`,
      impact: "medium",
      location: `tables[${item.newTable.name}]`
    });
  });

  // Add collection removal changes (if not preserving)
  if (strategy === "full_migration" || strategy === "tables_only") {
    collectionsToMigrate.forEach(item => {
      changes.push({
        type: "remove",
        description: `Remove collection '${item.collection.name}' (converted to table)`,
        impact: "high",
        location: `collections[${item.index}]`
      });
    });
  }

  // Add array structure changes
  if (collectionsToMigrate.length > 0) {
    changes.push({
      type: "modify",
      description: `${strategy === "dual_format" ? "Add" : "Create"} tables array with ${collectionsToMigrate.length} items`,
      impact: "medium",
      location: "config.tables"
    });
  }

  if (strategy === "tables_only" && collectionsToKeep.length === 0) {
    changes.push({
      type: "remove",
      description: "Remove collections array (fully migrated to tables)",
      impact: "high",
      location: "config.collections"
    });
  }

  return changes;
}

/**
 * Assesses migration complexity
 */
function assessMigrationComplexity(
  collectionsToMigrate: CollectionMigrationItem[],
  strategy: MigrationStrategy
): "low" | "medium" | "high" {
  const collectionCount = collectionsToMigrate.length;
  const hasRelationships = collectionsToMigrate.some(item =>
    item.collection.attributes.some(attr => attr.type === 'relationship')
  );
  const hasComplexIndexes = collectionsToMigrate.some(item =>
    (item.collection.indexes?.length || 0) > 5
  );

  if (collectionCount === 0) return "low";
  if (collectionCount <= 3 && !hasRelationships && !hasComplexIndexes) return "low";
  if (collectionCount <= 10 && !hasComplexIndexes && strategy !== "full_migration") return "medium";

  return "high";
}

/**
 * Generates migration recommendations
 */
function generateMigrationRecommendations(
  config: AppwriteConfig,
  strategy: MigrationStrategy,
  collectionsToMigrate: CollectionMigrationItem[]
): string[] {
  const recommendations: string[] = [];

  if (collectionsToMigrate.length > 5) {
    recommendations.push("Consider migrating in smaller batches for easier rollback");
  }

  if (collectionsToMigrate.some(item => item.warnings.length > 0)) {
    recommendations.push("Review relationship attributes and complex indexes after migration");
  }

  if (!config.apiMode || config.apiMode === "auto") {
    recommendations.push("Set apiMode to 'tablesdb' after migration for explicit API selection");
  }

  if (strategy === "dual_format") {
    recommendations.push("Test with dual format before removing collections array");
    recommendations.push("Monitor for any breaking changes with both APIs");
  }

  return recommendations;
}

/**
 * Applies migration plan to create new configuration
 */
function applyMigrationPlan(
  config: AppwriteConfig,
  plan: MigrationPlan,
  preserveOriginal: boolean
): AppwriteConfig {
  const newConfig: AppwriteConfig = { ...config };

  // Initialize tables array if it doesn't exist
  if (!newConfig.tables) {
    newConfig.tables = [];
  }

  // Add migrated tables
  newConfig.tables.push(...plan.tablesToCreate);

  // Handle collections based on strategy
  if (plan.strategy === "full_migration" || plan.strategy === "tables_only") {
    if (preserveOriginal) {
      // Keep original collections but mark them as migrated
      newConfig.collections = (newConfig.collections || []).map(collection => ({
        ...collection,
        // Add a comment or marker to indicate it's been migrated
        _migrated: true
      } as any));
    } else {
      // Remove migrated collections
      const migratedNames = new Set(plan.collectionsToMigrate.map(item => item.collection.name));
      newConfig.collections = (newConfig.collections || []).filter(
        collection => !migratedNames.has(collection.name)
      );

      // If no collections remain, remove the array for tables_only strategy
      if (newConfig.collections.length === 0 && plan.strategy === "tables_only") {
        delete newConfig.collections;
      }
    }
  }
  // For dual_format and incremental, keep existing collections unchanged

  return newConfig;
}

/**
 * Utility function to migrate collections to tables with simple interface
 */
export function migrateCollectionsToTables(
  config: AppwriteConfig,
  options: {
    strategy?: MigrationStrategy;
    specificCollections?: string[];
    validateResult?: boolean;
    dryRun?: boolean;
  } = {}
): MigrationResult {
  const {
    strategy = "full_migration",
    specificCollections,
    validateResult = true,
    dryRun = false
  } = options;

  // Create migration plan
  const plan = createMigrationPlan(config, strategy, specificCollections);

  // Execute migration
  const result = executeMigrationPlan(config, plan, {
    validateResult,
    dryRun
  });

  return result;
}

/**
 * Saves migration results to files
 */
export async function saveMigrationResult(
  result: MigrationResult,
  outputPath: string,
  options: {
    createBackup?: boolean;
    originalConfigPath?: string;
  } = {}
): Promise<void> {
  const { createBackup = true, originalConfigPath } = options;

  try {
    // Create backup if requested
    if (createBackup && originalConfigPath && fs.existsSync(originalConfigPath)) {
      const backupPath = `${originalConfigPath}.backup.${Date.now()}`;
      fs.copyFileSync(originalConfigPath, backupPath);
      MessageFormatter.success(`Backup created: ${backupPath}`, { prefix: "Migration" });
    }

    // Write new configuration
    const configContent = `import { type AppwriteConfig } from "appwrite-utils";

const appwriteConfig: AppwriteConfig = ${JSON.stringify(result.newConfig, null, 2)};

export default appwriteConfig;
`;

    fs.writeFileSync(outputPath, configContent, 'utf8');
    MessageFormatter.success(`Migration result saved: ${outputPath}`, { prefix: "Migration" });

    // Create migration report
    const reportPath = outputPath.replace(/\.(ts|js)$/, '.migration-report.md');
    const report = generateMigrationReport(result);
    fs.writeFileSync(reportPath, report, 'utf8');
    MessageFormatter.info(`Migration report saved: ${reportPath}`, { prefix: "Migration" });

  } catch (error) {
    throw new Error(`Failed to save migration result: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generates a detailed migration report
 */
function generateMigrationReport(result: MigrationResult): string {
  const timestamp = new Date().toISOString();

  return `# Migration Report

**Generated:** ${timestamp}
**Status:** ${result.success ? "✅ Success" : "❌ Failed"}

## Changes Applied

${result.changes.map(change =>
  `- **${change.type.toUpperCase()}**: ${change.description} (Impact: ${change.impact})`
).join('\n')}

## Validation Results

**Valid Configuration:** ${result.validation.isValid ? "✅ Yes" : "❌ No"}

${result.validation.errors.length > 0 ? `
### Errors
${result.validation.errors.map(error => `- ${error.message}`).join('\n')}
` : ''}

${result.validation.warnings.length > 0 ? `
### Warnings
${result.validation.warnings.map(warning => `- ${warning.message}`).join('\n')}
` : ''}

${result.validation.suggestions.length > 0 ? `
### Suggestions
${result.validation.suggestions.map(suggestion => `- ${suggestion.message}`).join('\n')}
` : ''}

${result.warnings.length > 0 ? `
## Migration Warnings

${result.warnings.map(warning => `- ${warning}`).join('\n')}
` : ''}

${result.errors.length > 0 ? `
## Migration Errors

${result.errors.map(error => `- ${error}`).join('\n')}
` : ''}

## Next Steps

1. Review the migrated configuration
2. Test with your Appwrite instance
3. Update your deployment scripts if necessary
4. Consider setting \`apiMode\` to 'tablesdb' for explicit API selection

---
*Generated by appwrite-utils-cli migration tools*
`;
}