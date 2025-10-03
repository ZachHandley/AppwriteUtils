import type { AppwriteConfig } from "appwrite-utils";
import { merge, cloneDeep, isPlainObject } from "es-toolkit";
import type { SessionAuthInfo } from "./SessionAuthService.js";

/**
 * Configuration override options that can be applied from CLI arguments or environment
 */
export interface ConfigOverrides {
  /** Appwrite endpoint URL (e.g., https://cloud.appwrite.io/v1) */
  appwriteEndpoint?: string;
  /** Appwrite project ID */
  appwriteProject?: string;
  /** API key for authentication */
  appwriteKey?: string;
  /** Session cookie for authentication */
  sessionCookie?: string;
  /** Explicitly set authentication method */
  authMethod?: "session" | "apikey" | "auto";
}

/**
 * Service responsible for merging configuration from multiple sources with proper priority handling.
 *
 * @description
 * Handles configuration merging with the following priority order (highest to lowest):
 * 1. CLI arguments/overrides (--endpoint, --apiKey, etc.)
 * 2. Session cookie from ~/.appwrite/prefs.json
 * 3. Config file values (YAML/TS/JSON)
 * 4. Environment variables (APPWRITE_ENDPOINT, APPWRITE_PROJECT, etc.)
 *
 * The service ensures proper deep merging of nested objects while preserving array order
 * and preventing undefined/null values from overwriting existing values.
 *
 * @example
 * ```typescript
 * const mergeService = new ConfigMergeService();
 *
 * // Merge session into config
 * const configWithSession = mergeService.mergeSession(baseConfig, sessionInfo);
 *
 * // Apply CLI overrides
 * const finalConfig = mergeService.applyOverrides(configWithSession, {
 *   appwriteEndpoint: 'https://custom-endpoint.com/v1',
 *   appwriteKey: 'custom-api-key'
 * });
 * ```
 */
export class ConfigMergeService {
  /**
   * Merges session authentication information into an existing configuration.
   *
   * @description
   * Adds session authentication details to the configuration, setting:
   * - sessionCookie: The authentication cookie from the session
   * - authMethod: Set to "session" to indicate session-based auth
   *
   * The session endpoint and projectId are used for validation but not merged
   * since they should match the config's values.
   *
   * @param config - Base configuration to merge session into
   * @param session - Session authentication information
   * @returns New configuration object with session merged (input config is not mutated)
   *
   * @example
   * ```typescript
   * const configWithSession = mergeService.mergeSession(config, {
   *   projectId: "my-project",
   *   endpoint: "https://cloud.appwrite.io/v1",
   *   sessionCookie: "eyJhbGc...",
   *   email: "user@example.com"
   * });
   * ```
   */
  public mergeSession(
    config: AppwriteConfig,
    session: SessionAuthInfo
  ): AppwriteConfig {
    // Clone config to avoid mutation
    const merged = cloneDeep(config);

    // Add session authentication (map 'cookie' to 'sessionCookie')
    merged.sessionCookie = session.cookie;
    merged.authMethod = "session";

    // Add session metadata if available
    if (session.email || session.expiresAt) {
      merged.sessionMetadata = {
        email: session.email,
        expiresAt: session.expiresAt,
      };
    }

    return merged;
  }

  /**
   * Applies configuration overrides from CLI arguments or programmatic sources.
   *
   * @description
   * Applies high-priority overrides that take precedence over all other config sources.
   * Only applies values that are explicitly set (not undefined or null).
   *
   * This method is typically used to apply CLI arguments like:
   * - --endpoint
   * - --apiKey
   * - --project
   *
   * @param config - Base configuration to apply overrides to
   * @param overrides - Override values to apply
   * @returns New configuration object with overrides applied (input config is not mutated)
   *
   * @example
   * ```typescript
   * const overriddenConfig = mergeService.applyOverrides(config, {
   *   appwriteEndpoint: 'https://custom.appwrite.io/v1',
   *   appwriteKey: 'my-api-key',
   *   authMethod: 'apikey'
   * });
   * ```
   */
  public applyOverrides(
    config: AppwriteConfig,
    overrides: ConfigOverrides
  ): AppwriteConfig {
    // Clone config to avoid mutation
    const merged = cloneDeep(config);

    // Apply each override only if it has a value (not undefined/null)
    if (overrides.appwriteEndpoint !== undefined && overrides.appwriteEndpoint !== null) {
      merged.appwriteEndpoint = overrides.appwriteEndpoint;
    }

    if (overrides.appwriteProject !== undefined && overrides.appwriteProject !== null) {
      merged.appwriteProject = overrides.appwriteProject;
    }

    if (overrides.appwriteKey !== undefined && overrides.appwriteKey !== null) {
      merged.appwriteKey = overrides.appwriteKey;
    }

    if (overrides.sessionCookie !== undefined && overrides.sessionCookie !== null) {
      merged.sessionCookie = overrides.sessionCookie;
    }

    if (overrides.authMethod !== undefined && overrides.authMethod !== null) {
      merged.authMethod = overrides.authMethod;
    }

    return merged;
  }

  /**
   * Merges environment variables into the configuration.
   *
   * @description
   * Reads environment variables and merges them into the config with the lowest priority.
   * Only applies environment variables that are set and have non-empty values.
   *
   * Supported environment variables:
   * - APPWRITE_ENDPOINT: Appwrite API endpoint URL
   * - APPWRITE_PROJECT: Appwrite project ID
   * - APPWRITE_API_KEY: API key for authentication
   * - APPWRITE_SESSION_COOKIE: Session cookie for authentication
   *
   * Environment variables are only applied if the corresponding config value is not already set.
   *
   * @param config - Base configuration to merge environment variables into
   * @returns New configuration object with environment variables merged (input config is not mutated)
   *
   * @example
   * ```typescript
   * // With env vars: APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
   * const configWithEnv = mergeService.mergeEnvironmentVariables(config);
   * // configWithEnv.appwriteEndpoint will be set from env var if not already set
   * ```
   */
  public mergeEnvironmentVariables(config: AppwriteConfig): AppwriteConfig {
    // Clone config to avoid mutation
    const merged = cloneDeep(config);

    // Read environment variables
    const envEndpoint = process.env.APPWRITE_ENDPOINT;
    const envProject = process.env.APPWRITE_PROJECT;
    const envApiKey = process.env.APPWRITE_API_KEY;
    const envSessionCookie = process.env.APPWRITE_SESSION_COOKIE;

    // Apply environment variables only if not already set in config
    // Environment variables have the lowest priority
    if (envEndpoint && !merged.appwriteEndpoint) {
      merged.appwriteEndpoint = envEndpoint;
    }

    if (envProject && !merged.appwriteProject) {
      merged.appwriteProject = envProject;
    }

    if (envApiKey && !merged.appwriteKey) {
      merged.appwriteKey = envApiKey;
    }

    if (envSessionCookie && !merged.sessionCookie) {
      merged.sessionCookie = envSessionCookie;
    }

    return merged;
  }

  /**
   * Performs a deep merge of multiple partial configuration sources into a complete configuration.
   *
   * @description
   * Merges multiple configuration sources using a deep merge strategy that:
   * - Recursively merges nested objects
   * - Preserves array order (arrays are replaced, not merged)
   * - Skips undefined and null values (they don't overwrite existing values)
   * - Later sources in the array take precedence over earlier ones
   *
   * This method is useful when combining:
   * - Base defaults with file-based config
   * - Multiple configuration files
   * - Config fragments from different sources
   *
   * @param sources - Array of partial configurations to merge (order matters: later sources override earlier ones)
   * @returns Complete merged configuration object
   *
   * @throws {Error} If no valid configuration can be produced from the sources
   *
   * @example
   * ```typescript
   * const merged = mergeService.mergeSources([
   *   envConfig,           // Lowest priority
   *   fileConfig,          // Medium priority
   *   sessionConfig,       // Higher priority
   *   overrideConfig       // Highest priority
   * ]);
   * ```
   */
  public mergeSources(sources: Array<Partial<AppwriteConfig>>): AppwriteConfig {
    // Filter out undefined/null sources
    const validSources = sources.filter(
      (source) => source !== undefined && source !== null
    );

    if (validSources.length === 0) {
      throw new Error("No valid configuration sources provided for merging");
    }

    // Start with an empty base object
    let merged = {} as AppwriteConfig;

    // Merge each source in order (later sources override earlier ones)
    for (const source of validSources) {
      merged = this.deepMergeConfigs(merged, source);
    }

    // Validate that we have the minimum required fields
    if (!merged.appwriteEndpoint || !merged.appwriteProject) {
      throw new Error(
        "Merged configuration is missing required fields: appwriteEndpoint and/or appwriteProject"
      );
    }

    return merged;
  }

  /**
   * Internal helper for deep merging two configuration objects.
   *
   * @description
   * Performs a deep merge of two objects with special handling for:
   * - Plain objects: Recursively merged
   * - Arrays: Target array is replaced by source array (not merged)
   * - Undefined/null values in source: Skipped (don't overwrite target)
   * - Primitive values: Source overwrites target
   *
   * This is used internally by mergeSources but can also be used directly
   * for specific merge operations.
   *
   * @param target - Base configuration object
   * @param source - Configuration to merge into target
   * @returns New deeply merged configuration object
   *
   * @private
   */
  private deepMergeConfigs(
    target: Partial<AppwriteConfig>,
    source: Partial<AppwriteConfig>
  ): AppwriteConfig {
    // Clone target to avoid mutation
    const result = cloneDeep(target);

    // Iterate through source properties
    for (const key in source) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) {
        continue;
      }

      const sourceValue = source[key as keyof AppwriteConfig];
      const targetValue = result[key as keyof AppwriteConfig];

      // Skip undefined and null values from source
      if (sourceValue === undefined || sourceValue === null) {
        continue;
      }

      // Handle arrays: Replace target array with source array (don't merge)
      if (Array.isArray(sourceValue)) {
        (result as any)[key] = cloneDeep(sourceValue);
        continue;
      }

      // Handle plain objects: Recursively merge
      if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
        (result as any)[key] = this.deepMergeConfigs(
          targetValue as Partial<AppwriteConfig>,
          sourceValue as Partial<AppwriteConfig>
        );
        continue;
      }

      // For all other cases (primitives, etc.), source overwrites target
      (result as any)[key] = cloneDeep(sourceValue);
    }

    return result as AppwriteConfig;
  }

  /**
   * Creates a configuration by merging all sources in the correct priority order.
   *
   * @description
   * Convenience method that applies the full configuration merge pipeline:
   * 1. Start with base config (from file)
   * 2. Merge environment variables (lowest priority)
   * 3. Merge session information (if provided)
   * 4. Apply CLI/programmatic overrides (highest priority)
   *
   * This is the recommended way to build a final configuration from all sources.
   *
   * @param baseConfig - Configuration loaded from file (YAML/TS/JSON)
   * @param options - Optional merge options
   * @param options.session - Session authentication to merge
   * @param options.overrides - CLI/programmatic overrides to apply
   * @param options.includeEnv - Whether to include environment variables (default: true)
   * @returns Final merged configuration with all sources applied in priority order
   *
   * @example
   * ```typescript
   * const finalConfig = mergeService.mergeAllSources(fileConfig, {
   *   session: sessionInfo,
   *   overrides: cliOverrides,
   *   includeEnv: true
   * });
   * ```
   */
  public mergeAllSources(
    baseConfig: AppwriteConfig,
    options: {
      session?: SessionAuthInfo;
      overrides?: ConfigOverrides;
      includeEnv?: boolean;
    } = {}
  ): AppwriteConfig {
    const { session, overrides, includeEnv = true } = options;

    // Start with base config
    let config = cloneDeep(baseConfig);

    // Step 1: Merge environment variables (lowest priority)
    if (includeEnv) {
      config = this.mergeEnvironmentVariables(config);
    }

    // Step 2: Merge session (medium-high priority)
    if (session) {
      config = this.mergeSession(config, session);
    }

    // Step 3: Apply overrides (highest priority)
    if (overrides) {
      config = this.applyOverrides(config, overrides);
    }

    return config;
  }
}
