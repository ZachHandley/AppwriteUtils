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

// Extension (sidecar) config loader for the new appwrite-utils.config.{yaml,yml,json} format
export * from "./extensionConfigLoader.js";

// Project root discovery (sidecar / official config / .git walk-up)
export {
  findProjectRoot,
  type ProjectRootAnchor,
  type ProjectRootResult,
} from "./findProjectRoot.js";

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
