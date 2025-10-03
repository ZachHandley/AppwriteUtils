/**
 * Configuration Services
 *
 * Modular services for configuration management, discovery, loading, validation, and merging.
 */

export { ConfigDiscoveryService } from "./ConfigDiscoveryService.js";
export type { DiscoveryResult } from "./ConfigDiscoveryService.js";

export { ConfigLoaderService } from "./ConfigLoaderService.js";
export type { CollectionLoadOptions } from "./ConfigLoaderService.js";

export { ConfigMergeService } from "./ConfigMergeService.js";
export type { ConfigOverrides } from "./ConfigMergeService.js";

export {
  SessionAuthService,
  type SessionAuthInfo,
  type AppwriteSessionPrefs,
  type AuthenticationStatus
} from "./SessionAuthService.js";

export {
  ConfigValidationService,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
  type ValidationReportOptions
} from "./ConfigValidationService.js";
