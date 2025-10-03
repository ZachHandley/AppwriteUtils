/**
 * Configuration Management
 *
 * Centralized configuration manager with services for discovery, loading, validation, and merging.
 */

export { ConfigManager } from "./ConfigManager.js";
export type { ConfigLoadOptions, CollectionFilter } from "./ConfigManager.js";

export * from "./services/index.js";
