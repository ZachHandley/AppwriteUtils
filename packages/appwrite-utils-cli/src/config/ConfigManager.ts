import fs from "fs";
import path from "path";
import type { AppwriteConfig, Collection, CollectionCreate, AppwriteFunction } from "appwrite-utils";
import {
  ConfigDiscoveryService,
  ConfigLoaderService,
  ConfigMergeService,
  ConfigValidationService,
  SessionAuthService,
  type ConfigOverrides,
  type SessionAuthInfo,
  type AuthenticationStatus,
  type ValidationResult,
} from "./services/index.js";
import { MessageFormatter } from "../shared/messageFormatter.js";
import { logger } from "../shared/logging.js";

/**
 * Database type from AppwriteConfig
 */
type Database = {
  $id: string;
  name: string;
  bucket?: any;
};

/**
 * Bucket type from AppwriteConfig
 */
type Bucket = {
  $id: string;
  name: string;
  $permissions?: any[];
  [key: string]: any;
};

/**
 * Options for loading configuration
 */
export interface ConfigLoadOptions {
  /**
   * Directory to start searching for config files
   * @default process.cwd()
   */
  configDir?: string;

  /**
   * Force reload configuration even if cached
   * @default false
   */
  forceReload?: boolean;

  /**
   * Validate configuration after loading
   * @default false
   */
  validate?: boolean;

  /**
   * Use strict validation mode (warnings as errors)
   * @default false
   */
  strictMode?: boolean;

  /**
   * Report validation results to console
   * @default false
   */
  reportValidation?: boolean;

  /**
   * Override configuration values
   */
  overrides?: ConfigOverrides;

  /**
   * Override session authentication (used for preserving session on reload)
   */
  sessionOverride?: SessionAuthInfo;
}

/**
 * Filter function for collections (accepts both Collection and CollectionCreate)
 */
export type CollectionFilter = (collection: Collection | CollectionCreate) => boolean;

/**
 * Centralized configuration manager with intelligent caching and session management.
 *
 * This singleton provides a unified interface for:
 * - Configuration discovery and loading (YAML, TypeScript, JSON)
 * - Session authentication with automatic caching
 * - Configuration validation and merging
 * - Session preservation across reloads
 * - File watching for configuration changes
 *
 * @example
 * ```typescript
 * const configManager = ConfigManager.getInstance();
 *
 * // Load configuration (cached after first call)
 * const config = await configManager.loadConfig({
 *   validate: true,
 *   reportValidation: true,
 * });
 *
 * // Get cached config synchronously
 * const cachedConfig = configManager.getConfig();
 *
 * // Reload with session preservation
 * const reloadedConfig = await configManager.reloadConfig();
 *
 * // Watch for config changes
 * const unwatch = configManager.watchConfig(async (config) => {
 *   console.log("Config changed:", config);
 * });
 * ```
 */
export class ConfigManager {
  // ──────────────────────────────────────────────────
  // SINGLETON PATTERN
  // ──────────────────────────────────────────────────

  private static instance: ConfigManager | null = null;

  /**
   * Get the ConfigManager singleton instance
   *
   * @returns The singleton ConfigManager instance
   *
   * @example
   * ```typescript
   * const configManager = ConfigManager.getInstance();
   * ```
   */
  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   *
   * @example
   * ```typescript
   * ConfigManager.resetInstance();
   * const newInstance = ConfigManager.getInstance();
   * ```
   */
  public static resetInstance(): void {
    ConfigManager.instance = null;
  }

  // ──────────────────────────────────────────────────
  // STATE (Private)
  // ──────────────────────────────────────────────────

  private cachedConfig: AppwriteConfig | null = null;
  private cachedConfigPath: string | null = null;
  private cachedSession: SessionAuthInfo | null = null;
  private lastLoadTimestamp: number = 0;
  private isInitialized: boolean = false;

  // Service dependencies
  private discoveryService: ConfigDiscoveryService;
  private loaderService: ConfigLoaderService;
  private validationService: ConfigValidationService;
  private sessionService: SessionAuthService;
  private mergeService: ConfigMergeService;

  // ──────────────────────────────────────────────────
  // CONSTRUCTOR
  // ──────────────────────────────────────────────────

  /**
   * Private constructor to enforce singleton pattern.
   * Use ConfigManager.getInstance() instead.
   */
  private constructor() {
    // Initialize all services
    this.discoveryService = new ConfigDiscoveryService();
    this.loaderService = new ConfigLoaderService();
    this.validationService = new ConfigValidationService();
    this.sessionService = new SessionAuthService();
    this.mergeService = new ConfigMergeService();

    logger.debug("ConfigManager instance created", { prefix: "ConfigManager" });
  }

  // ──────────────────────────────────────────────────
  // CORE CONFIGURATION METHODS
  // ──────────────────────────────────────────────────

  /**
   * Load configuration with intelligent caching and session management.
   *
   * This method orchestrates the entire configuration loading flow:
   * 1. Returns cached config if available (unless forceReload is true)
   * 2. Discovers config file using ConfigDiscoveryService
   * 3. Loads config from file using ConfigLoaderService
   * 4. Loads and merges session authentication using SessionAuthService
   * 5. Applies CLI/environment overrides using ConfigMergeService
   * 6. Validates configuration if requested
   * 7. Caches the result for future calls
   *
   * @param options - Configuration loading options
   * @returns The loaded and processed configuration
   * @throws Error if no configuration file is found
   * @throws Error if validation fails in strict mode
   *
   * @example
   * ```typescript
   * const config = await configManager.loadConfig({
   *   configDir: process.cwd(),
   *   validate: true,
   *   strictMode: true,
   *   reportValidation: true,
   *   overrides: {
   *     appwriteEndpoint: "https://custom.endpoint.com/v1"
   *   }
   * });
   * ```
   */
  public async loadConfig(options: ConfigLoadOptions = {}): Promise<AppwriteConfig> {
    // 1. Return cache if available and not forcing reload
    if (this.cachedConfig && !options.forceReload) {
      logger.debug("Returning cached config", { prefix: "ConfigManager" });
      return this.getCachedConfigWithOverrides(options.overrides);
    }

    logger.debug("Loading config from file", { prefix: "ConfigManager", options });

    // 2. Discover config file
    const configPath = this.discoveryService.findConfig(options.configDir || process.cwd());

    if (!configPath) {
      const searchDir = options.configDir || process.cwd();
      throw new Error(
        `No Appwrite configuration found in "${searchDir}".\n` +
        `Searched for: YAML (.appwrite/config.yaml), TypeScript (appwriteConfig.ts), or JSON (appwrite.json).\n` +
        `Suggestion: Create a configuration file using "npx appwrite-migrate --init" or refer to the documentation.`
      );
    }

    logger.debug(`Config discovered at: ${configPath}`, { prefix: "ConfigManager" });

    // 3. Load config from file
    let config = await this.loaderService.loadFromPath(configPath);

    // 4. Load session authentication
    const session =
      options.sessionOverride ||
      (await this.sessionService.findSession(config.appwriteEndpoint, config.appwriteProject));

    // 5. Merge session into config
    if (session) {
      logger.debug("Merging session authentication into config", { prefix: "ConfigManager" });
      config = this.mergeService.mergeSession(config, session);
      this.cachedSession = session;
    }

    // 6. Apply CLI/env overrides
    if (options.overrides) {
      logger.debug("Applying configuration overrides", { prefix: "ConfigManager" });
      config = this.mergeService.applyOverrides(config, options.overrides);
    }

    // 7. Validate if requested
    if (options.validate) {
      logger.debug("Validating configuration", { prefix: "ConfigManager", strictMode: options.strictMode });

      const validation = options.strictMode
        ? this.validationService.validateStrict(config)
        : this.validationService.validate(config);

      if (options.reportValidation) {
        this.validationService.reportResults(validation, { verbose: false });
      }

      if (options.strictMode && !validation.isValid) {
        throw new Error(
          `Configuration validation failed in strict mode.\n` +
          `Errors: ${validation.errors.length}, Warnings: ${validation.warnings.length}\n` +
          `Run with reportValidation: true to see details.`
        );
      }
    }

    // 8. Cache the config
    this.cachedConfig = config;
    this.cachedConfigPath = configPath;
    this.lastLoadTimestamp = Date.now();
    this.isInitialized = true;

    logger.debug("Config loaded and cached successfully", {
      prefix: "ConfigManager",
      path: configPath,
      hasSession: !!session,
    });

    return config;
  }

  /**
   * Get the cached configuration synchronously.
   *
   * @returns The cached configuration
   * @throws Error if configuration has not been loaded yet
   *
   * @example
   * ```typescript
   * const config = configManager.getConfig();
   * ```
   */
  public getConfig(): AppwriteConfig {
    if (!this.cachedConfig) {
      throw new Error(
        "Configuration not loaded. Call loadConfig() first.\n" +
        "Suggestion: await configManager.loadConfig();"
      );
    }
    return this.cachedConfig;
  }

  /**
   * Get the path to the loaded configuration file.
   *
   * @returns The configuration file path, or null if not loaded
   *
   * @example
   * ```typescript
   * const configPath = configManager.getConfigPath();
   * console.log(`Config loaded from: ${configPath}`);
   * ```
   */
  public getConfigPath(): string | null {
    return this.cachedConfigPath;
  }

  /**
   * Check if configuration has been loaded.
   *
   * @returns True if configuration is loaded and cached
   *
   * @example
   * ```typescript
   * if (!configManager.hasConfig()) {
   *   await configManager.loadConfig();
   * }
   * ```
   */
  public hasConfig(): boolean {
    return this.cachedConfig !== null;
  }

  /**
   * Check if the ConfigManager has been initialized.
   *
   * @returns True if initialized (config loaded at least once)
   *
   * @example
   * ```typescript
   * if (configManager.isConfigInitialized()) {
   *   console.log("Config ready");
   * }
   * ```
   */
  public isConfigInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Invalidate the configuration cache.
   * Next call to loadConfig() will reload from disk.
   *
   * @example
   * ```typescript
   * configManager.invalidateCache();
   * const freshConfig = await configManager.loadConfig();
   * ```
   */
  public invalidateCache(): void {
    logger.debug("Invalidating config cache", { prefix: "ConfigManager" });
    this.cachedConfig = null;
    this.cachedConfigPath = null;
    this.lastLoadTimestamp = 0;
    // Note: session cache is preserved by SessionAuthService
  }

  /**
   * Reload configuration from disk, preserving current session.
   *
   * This is a convenience method that combines invalidation and reloading
   * while automatically preserving the current session authentication.
   *
   * @param options - Configuration loading options (forceReload is automatically set)
   * @returns The reloaded configuration
   *
   * @example
   * ```typescript
   * // Reload config after manual file changes
   * const config = await configManager.reloadConfig({
   *   validate: true,
   *   reportValidation: true
   * });
   * ```
   */
  public async reloadConfig(
    options: Omit<ConfigLoadOptions, "forceReload"> = {}
  ): Promise<AppwriteConfig> {
    logger.debug("Reloading config with session preservation", { prefix: "ConfigManager" });

    // Preserve current session during reload
    const currentSession = this.cachedSession;

    return this.loadConfig({
      ...options,
      forceReload: true,
      sessionOverride: currentSession || undefined,
    });
  }

  // ──────────────────────────────────────────────────
  // SESSION MANAGEMENT
  // ──────────────────────────────────────────────────

  /**
   * Get the current session information.
   *
   * @returns The cached session info, or null if no session
   *
   * @example
   * ```typescript
   * const session = configManager.getSession();
   * if (session) {
   *   console.log(`Authenticated as: ${session.email}`);
   * }
   * ```
   */
  public getSession(): SessionAuthInfo | null {
    return this.cachedSession;
  }

  /**
   * Check if a session is available.
   *
   * @returns True if a session is cached
   *
   * @example
   * ```typescript
   * if (configManager.hasSession()) {
   *   console.log("Using session authentication");
   * } else {
   *   console.log("Using API key authentication");
   * }
   * ```
   */
  public hasSession(): boolean {
    return this.cachedSession !== null;
  }

  /**
   * Refresh session from disk (bypasses session cache).
   *
   * This forces SessionAuthService to reload from ~/.appwrite/prefs.json
   * and update the cached session.
   *
   * @returns The refreshed session, or null if no session found
   *
   * @example
   * ```typescript
   * // After logging in via appwrite CLI
   * const session = await configManager.refreshSession();
   * if (session) {
   *   console.log("Session refreshed successfully");
   * }
   * ```
   */
  public async refreshSession(): Promise<SessionAuthInfo | null> {
    if (!this.cachedConfig) {
      logger.debug("Cannot refresh session - no config loaded", { prefix: "ConfigManager" });
      return null;
    }

    logger.debug("Refreshing session from disk", { prefix: "ConfigManager" });

    // Invalidate session cache
    this.sessionService.invalidateCache();

    // Reload session
    const session = await this.sessionService.findSession(
      this.cachedConfig.appwriteEndpoint,
      this.cachedConfig.appwriteProject
    );

    if (session) {
      this.cachedSession = session;
      logger.debug("Session refreshed successfully", { prefix: "ConfigManager" });
    } else {
      this.cachedSession = null;
      logger.debug("No session found after refresh", { prefix: "ConfigManager" });
    }

    return session;
  }

  /**
   * Get authentication status for the current configuration.
   *
   * @returns Authentication status object with details about current auth method
   * @throws Error if configuration has not been loaded
   *
   * @example
   * ```typescript
   * const authStatus = await configManager.getAuthStatus();
   * console.log(`Auth method: ${authStatus.authMethod}`);
   * console.log(`Has valid session: ${authStatus.hasValidSession}`);
   * ```
   */
  public async getAuthStatus(): Promise<AuthenticationStatus> {
    if (!this.cachedConfig) {
      throw new Error(
        "Configuration not loaded. Call loadConfig() first.\n" +
        "Suggestion: await configManager.loadConfig();"
      );
    }

    return await this.sessionService.getAuthenticationStatus(
      this.cachedConfig.appwriteEndpoint,
      this.cachedConfig.appwriteProject,
      this.cachedConfig.appwriteKey,
      this.cachedSession
    );
  }

  /**
   * Clear the cached session.
   * Next load will attempt to find a new session.
   *
   * @example
   * ```typescript
   * configManager.clearSession();
   * const config = await configManager.reloadConfig();
   * ```
   */
  public clearSession(): void {
    logger.debug("Clearing cached session", { prefix: "ConfigManager" });
    this.cachedSession = null;
  }

  // ──────────────────────────────────────────────────
  // VALIDATION
  // ──────────────────────────────────────────────────

  /**
   * Validate the current configuration (warnings allowed).
   *
   * @param reportResults - Whether to report validation results to console
   * @returns Validation result with errors and warnings
   * @throws Error if configuration has not been loaded
   *
   * @example
   * ```typescript
   * const validation = configManager.validateConfig(true);
   * if (!validation.isValid) {
   *   console.log(`Found ${validation.errors.length} errors`);
   * }
   * ```
   */
  public validateConfig(reportResults: boolean = false): ValidationResult {
    if (!this.cachedConfig) {
      throw new Error(
        "Configuration not loaded. Call loadConfig() first.\n" +
        "Suggestion: await configManager.loadConfig();"
      );
    }

    const validation = this.validationService.validate(this.cachedConfig);

    if (reportResults) {
      this.validationService.reportResults(validation);
    }

    return validation;
  }

  /**
   * Validate the current configuration in strict mode (warnings as errors).
   *
   * @param reportResults - Whether to report validation results to console
   * @returns Validation result with errors and warnings (warnings treated as errors)
   * @throws Error if configuration has not been loaded
   *
   * @example
   * ```typescript
   * const validation = configManager.validateConfigStrict(true);
   * if (!validation.isValid) {
   *   console.log("Config validation failed (strict mode)");
   * }
   * ```
   */
  public validateConfigStrict(reportResults: boolean = false): ValidationResult {
    if (!this.cachedConfig) {
      throw new Error(
        "Configuration not loaded. Call loadConfig() first.\n" +
        "Suggestion: await configManager.loadConfig();"
      );
    }

    const validation = this.validationService.validateStrict(this.cachedConfig);

    if (reportResults) {
      this.validationService.reportResults(validation);
    }

    return validation;
  }

  // ──────────────────────────────────────────────────
  // ADVANCED / CONVENIENCE
  // ──────────────────────────────────────────────────

  /**
   * Watch configuration file for changes and reload automatically.
   *
   * Returns a function to stop watching.
   *
   * @param callback - Function to call when config changes
   * @returns Function to stop watching
   *
   * @example
   * ```typescript
   * const unwatch = configManager.watchConfig(async (config) => {
   *   console.log("Config changed, reloading...");
   *   // Handle config change
   * });
   *
   * // Later, stop watching
   * unwatch();
   * ```
   */
  public watchConfig(callback: (config: AppwriteConfig) => void | Promise<void>): () => void {
    if (!this.cachedConfigPath) {
      throw new Error(
        "Cannot watch config - no config file loaded.\n" +
        "Suggestion: Call loadConfig() before watchConfig()."
      );
    }

    const configPath = this.cachedConfigPath;
    logger.debug(`Setting up config file watcher: ${configPath}`, { prefix: "ConfigManager" });

    let isProcessing = false;

    const watcher = fs.watch(configPath, async (eventType) => {
      if (eventType === "change" && !isProcessing) {
        isProcessing = true;
        logger.debug("Config file changed, reloading...", { prefix: "ConfigManager" });

        try {
          const newConfig = await this.reloadConfig();
          await callback(newConfig);
        } catch (error) {
          MessageFormatter.error(
            "Failed to reload config after file change",
            error instanceof Error ? error : String(error),
            { prefix: "ConfigManager" }
          );
        } finally {
          isProcessing = false;
        }
      }
    });

    // Return cleanup function
    return () => {
      logger.debug("Stopping config file watcher", { prefix: "ConfigManager" });
      watcher.close();
    };
  }

  /**
   * Merge overrides into the current configuration without persisting.
   *
   * This creates a new config object with overrides applied, without
   * affecting the cached configuration.
   *
   * @param overrides - Configuration overrides to apply
   * @returns New configuration with overrides applied
   * @throws Error if configuration has not been loaded
   *
   * @example
   * ```typescript
   * const customConfig = configManager.mergeOverrides({
   *   appwriteEndpoint: "https://test.endpoint.com/v1"
   * });
   * ```
   */
  public mergeOverrides(overrides: ConfigOverrides): AppwriteConfig {
    if (!this.cachedConfig) {
      throw new Error(
        "Configuration not loaded. Call loadConfig() first.\n" +
        "Suggestion: await configManager.loadConfig();"
      );
    }

    return this.mergeService.applyOverrides(this.cachedConfig, overrides);
  }

  /**
   * Get collections from the configuration, optionally filtered.
   *
   * @param filter - Optional filter function for collections
   * @returns Array of collections (or tables, depending on API mode)
   *
   * @example
   * ```typescript
   * // Get all collections
   * const allCollections = configManager.getCollections();
   *
   * // Get enabled collections only
   * const enabledCollections = configManager.getCollections(
   *   (c) => c.enabled !== false
   * );
   * ```
   */
  public getCollections(filter?: CollectionFilter): (Collection | CollectionCreate)[] {
    const config = this.getConfig();
    const collections = config.collections || config.tables || [];

    if (filter) {
      return collections.filter(filter);
    }

    return collections;
  }

  /**
   * Get databases from the configuration.
   *
   * @returns Array of databases
   *
   * @example
   * ```typescript
   * const databases = configManager.getDatabases();
   * console.log(`Found ${databases.length} databases`);
   * ```
   */
  public getDatabases(): Database[] {
    const config = this.getConfig();
    return config.databases || [];
  }

  /**
   * Get buckets from the configuration.
   *
   * @returns Array of buckets
   *
   * @example
   * ```typescript
   * const buckets = configManager.getBuckets();
   * console.log(`Found ${buckets.length} buckets`);
   * ```
   */
  public getBuckets(): Bucket[] {
    const config = this.getConfig();
    return config.buckets || [];
  }

  /**
   * Get functions from the configuration.
   *
   * @returns Array of functions
   *
   * @example
   * ```typescript
   * const functions = configManager.getFunctions();
   * console.log(`Found ${functions.length} functions`);
   * ```
   */
  public getFunctions(): AppwriteFunction[] {
    const config = this.getConfig();
    return config.functions || [];
  }

  // ──────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ──────────────────────────────────────────────────

  /**
   * Get cached config with optional overrides applied.
   * Used internally to avoid reloading when only overrides change.
   */
  private getCachedConfigWithOverrides(overrides?: ConfigOverrides): AppwriteConfig {
    if (!this.cachedConfig) {
      throw new Error("No cached config available");
    }

    if (!overrides) {
      return this.cachedConfig;
    }

    logger.debug("Applying overrides to cached config", { prefix: "ConfigManager" });
    return this.mergeService.applyOverrides(this.cachedConfig, overrides);
  }
}
