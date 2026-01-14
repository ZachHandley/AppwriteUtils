/**
 * Configuration Management
 *
 * Centralized configuration manager with services for discovery, loading, validation, and merging.
 */

export { ConfigManager } from "./ConfigManager.js";
export type { ConfigLoadOptions, CollectionFilter } from "./ConfigManager.js";

export * from "./services/index.js";

// YAML Config utilities
export {
  loadYamlConfig,
  loadYamlConfigWithSession,
  findYamlConfig,
  generateYamlConfigTemplate,
  writeYamlConfig,
  addFunctionToYamlConfig,
  extractSessionOptionsFromConfig,
  createSessionPreservingYamlConfig,
  hasYamlSessionAuth,
  convertYamlToAppwriteConfig,
  type YamlConfig,
  type YamlSessionOptions,
} from "./yamlConfig.js";

// Config Validation
export {
  validateCollectionsTablesConfig,
  detectNamingConflicts,
  findNamingConflicts,
  validateDatabaseReferences,
  validateSchemaConsistency,
  reportValidationResults,
  validateWithStrictMode,
  type ValidationErrorType,
  type ValidationError,
  type ValidationResult,
  type ConfigConflict,
} from "./configValidation.js";

// Config Migration
export {
  createMigrationPlan,
  executeMigrationPlan,
  convertCollectionToTable,
  migrateCollectionsToTables,
  saveMigrationResult,
  type MigrationStrategy,
  type MigrationPlan,
  type CollectionMigrationItem,
  type MigrationChange,
  type MigrationResult,
  type MigrationOptions,
} from "./configMigration.js";
