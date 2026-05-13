import fs from "fs";
import path from "path";
import { Client } from "node-appwrite";
import type { AppwriteConfig, Collection, CollectionCreate, AppwriteFunction, AppwriteSite } from "appwrite-utils";
import {
  ConfigDiscoveryService,
  ConfigLoaderService,
  ConfigMergeService,
  ConfigValidationService,
  SessionAuthService,
  AuthenticationError,
  type ConfigOverrides,
  type SessionAuthInfo,
  type AuthenticationStatus,
  type ValidationResult,
} from "./services/index.js";
import { MessageFormatter } from "../shared/messageFormatter.js";
import { logger } from "../shared/logging.js";
import { detectAppwriteVersionCached, type ApiMode } from "../utils/versionDetection.js";
import { ClientFactory } from "../clients/ClientFactory.js";

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

  /**
   * Prefer loading from appwrite.config.json over config.yaml
   * @default false
   */
  preferJson?: boolean;

  /**
   * Request session authentication mode
   * - true: Prefer session auth, fall back to API key if unavailable
   * - false: Use API key only
   * - undefined: Auto-detect (current behavior)
   */
  useSession?: boolean;

  /**
   * Explicit session cookie to use (bypasses session discovery)
   */
  explicitSessionCookie?: string;
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
  private cachedClient: Client | null = null;

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
    const bypassCacheForAuth = options.useSession !== undefined || !!options.explicitSessionCookie;
    if (this.cachedConfig && !options.forceReload && !bypassCacheForAuth) {
      if (this.cachedConfig.sessionCookie) {
        const sessionWorks = await this.sessionService.isSessionWorking(
          this.cachedConfig.appwriteEndpoint,
          this.cachedConfig.appwriteProject,
          this.cachedConfig.sessionCookie
        );
        if (!sessionWorks) {
          logger.warn("Cached session is not working; invalidating config cache", { prefix: "ConfigManager" });
          this.invalidateCache();
        } else {
          logger.debug("Returning cached config", { prefix: "ConfigManager" });
          return this.getCachedConfigWithOverrides(options.overrides);
        }
      } else {
        logger.debug("Returning cached config", { prefix: "ConfigManager" });
        return this.getCachedConfigWithOverrides(options.overrides);
      }
    }

    logger.debug("Loading config from file", { prefix: "ConfigManager", options });

    // 2. Discover config file
    const configPath = await this.discoveryService.findConfig(
      options.configDir || process.cwd(),
      options.preferJson || false
    );

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

    // 3b. Merge environment variables (lowest priority — only fills gaps).
    // Without this, APPWRITE_PROJECT_ID / APPWRITE_API_KEY / etc. were
    // dead-letter for Stack B and only honoured by Stack A's CLI bridge.
    config = this.mergeService.mergeEnvironmentVariables(config);

    // 4. Load session authentication with caching support
    let session: SessionAuthInfo | null = null;
    let sessionPrefsKey: string | undefined = undefined;

    if (options.sessionOverride) {
      // Session explicitly provided via options
      session = options.sessionOverride;
      logger.debug("Using session override from options", { prefix: "ConfigManager" });
    } else if (options.useSession === true) {
      // When session is explicitly requested, only accept a verified working session
      const workingSessionResult = await this.sessionService.findWorkingSession(
        config.appwriteEndpoint,
        config.appwriteProject
      );

      if (workingSessionResult) {
        session = workingSessionResult.session;
        sessionPrefsKey = workingSessionResult.prefsKey;

        logger.info(
          `Found and tested working session from project ${workingSessionResult.prefsKey}`,
          { prefix: "ConfigManager", email: workingSessionResult.session.email }
        );

        // Cache the working session key back to config file
        config.sessionProjectId = workingSessionResult.prefsKey;

        // Write the updated config back to file to cache the session key
        const { writeYamlConfig } = await import('./yamlConfig.js');
        try {
          await writeYamlConfig(configPath, config);
          logger.debug(`Cached session key ${workingSessionResult.prefsKey} to config file`, {
            prefix: "ConfigManager"
          });
        } catch (error) {
          logger.warn("Failed to cache session key to config file", {
            prefix: "ConfigManager",
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    } else {
      // First, try using cached sessionProjectId if available
      if (config.sessionProjectId) {
        logger.debug(`Attempting to use cached session key: ${config.sessionProjectId}`, {
          prefix: "ConfigManager"
        });

        const prefs = await this.sessionService.loadSessionPrefs();
        if (prefs && prefs[config.sessionProjectId]) {
          const cachedSessionData = prefs[config.sessionProjectId];

          // Verify the cached session still works
          const sessionInfo: SessionAuthInfo = {
            endpoint: cachedSessionData.endpoint,
            projectId: config.appwriteProject,
            cookie: cachedSessionData.cookie,
            email: cachedSessionData.email,
            expiresAt: cachedSessionData.expiresAt
          };

          const isValid = this.sessionService.isValidSession(sessionInfo);
          const isWorking = isValid
            ? await this.sessionService.isSessionWorking(
                config.appwriteEndpoint,
                config.appwriteProject,
                cachedSessionData.cookie
              )
            : false;

          if (isWorking) {
            session = sessionInfo;
            sessionPrefsKey = config.sessionProjectId;
            logger.info(`Using cached session key: ${config.sessionProjectId}`, {
              prefix: "ConfigManager",
              email: cachedSessionData.email
            });
          } else {
            logger.debug("Cached session is no longer valid, will search for new session", {
              prefix: "ConfigManager"
            });
          }
        } else {
          logger.debug("Cached session key not found in prefs.json, will search for new session", {
            prefix: "ConfigManager"
          });
        }
      }

      // If no cached session or it doesn't work, test all available sessions for this endpoint
      if (!session) {
        logger.debug("No direct session match, testing available sessions for endpoint", {
          prefix: "ConfigManager",
          endpoint: config.appwriteEndpoint,
          projectId: config.appwriteProject
        });

        const workingSessionResult = await this.sessionService.findWorkingSession(
          config.appwriteEndpoint,
          config.appwriteProject
        );

        if (workingSessionResult) {
          session = workingSessionResult.session;
          sessionPrefsKey = workingSessionResult.prefsKey;

          logger.info(
            `Found and tested working session from project ${workingSessionResult.prefsKey}`,
            { prefix: "ConfigManager", email: workingSessionResult.session.email }
          );

          // Cache the working session key back to config file
          config.sessionProjectId = workingSessionResult.prefsKey;

          // Write the updated config back to file to cache the session key
          const { writeYamlConfig } = await import('./yamlConfig.js');
          try {
            await writeYamlConfig(configPath, config);
            logger.debug(`Cached session key ${workingSessionResult.prefsKey} to config file`, {
              prefix: "ConfigManager"
            });
          } catch (error) {
            logger.warn("Failed to cache session key to config file", {
              prefix: "ConfigManager",
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }
    }

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

    // 8. Run version detection and set apiMode if not explicitly configured
    if (!config.apiMode || config.apiMode === 'auto') {
      try {
        logger.debug('Running version detection for API mode detection', {
          prefix: "ConfigManager",
          endpoint: config.appwriteEndpoint
        });

        const versionResult = await detectAppwriteVersionCached(
          config.appwriteEndpoint,
          config.appwriteProject,
          config.appwriteKey
        );

        config.apiMode = versionResult.apiMode;
        logger.info(`API mode detected: ${config.apiMode}`, {
          prefix: "ConfigManager",
          method: versionResult.detectionMethod,
          confidence: versionResult.confidence,
          serverVersion: versionResult.serverVersion,
        });

      } catch (error) {
        logger.warn('Version detection failed, defaulting to legacy mode', {
          prefix: "ConfigManager",
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        config.apiMode = 'legacy';
      }
    }

    // 9. Handle authentication based on hints
    if (options.useSession === true) {
      // Session auth PREFERRED (but API key fallback if available)
      let sessionToUse: SessionAuthInfo | null = null;

      if (options.explicitSessionCookie) {
        const explicitSession: SessionAuthInfo = {
          cookie: options.explicitSessionCookie,
          endpoint: config.appwriteEndpoint,
          projectId: config.appwriteProject,
          email: undefined,
          expiresAt: undefined
        };

        if (this.sessionService.isValidSession(explicitSession)) {
          const works = await this.sessionService.isSessionWorking(
            config.appwriteEndpoint,
            config.appwriteProject,
            options.explicitSessionCookie
          );
          if (works) {
            sessionToUse = explicitSession;
          }
        }
      } else {
        const workingSessionResult = await this.sessionService.findWorkingSession(
          config.appwriteEndpoint,
          config.appwriteProject
        );
        sessionToUse = workingSessionResult?.session || null;
      }

      if (sessionToUse) {
        config = this.mergeService.mergeSession(config, sessionToUse);
        logger.info(`Using session authentication for ${sessionToUse.email || 'user'}`, { prefix: "Auth" });
      } else if (config.appwriteKey?.trim()) {
        logger.warn(
          `Session requested but not available or unauthorized, falling back to API key authentication`,
          { prefix: "Auth" }
        );
        const available = await this.sessionService.getAvailableSessions();
        if (available.length > 0) {
          logger.info(`Available sessions: ${available.map(s => s.projectId).join(', ')}`, { prefix: "Auth" });
        }
      } else {
        const available = await this.sessionService.getAvailableSessions();
        throw new AuthenticationError('no-auth-available',
          `Session authentication requested but no valid session found, and no API key configured.`,
          {
            endpoint: config.appwriteEndpoint,
            projectId: config.appwriteProject,
            suggestion: "Run 'appwrite login' to create a session, or add an API key to your config.",
            availableSessions: available.map(s => ({ projectId: s.projectId, email: s.email }))
          }
        );
      }
    } else if (options.useSession === false) {
      // Explicit API key mode - skip session auth entirely
      logger.debug("Session auth disabled, using API key only", { prefix: "Auth" });
    }
    // If useSession is undefined, the existing auto-detect behavior continues (already handled above)

    // 10. Cache the config
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
    this.cachedClient = null;
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
  // CLIENT MANAGEMENT
  // ──────────────────────────────────────────────────

  /**
   * Get authenticated Appwrite client using ClientFactory.
   *
   * This method returns a cached client instance created via ClientFactory,
   * which uses the correct cookie header approach for session authentication
   * instead of the broken setSession() method.
   *
   * @returns Authenticated Appwrite client
   * @throws Error if configuration has not been loaded
   *
   * @example
   * ```typescript
   * const client = configManager.getClient();
   * const databases = new Databases(client);
   * ```
   */
  public getClient(): Client {
    if (!this.cachedConfig) {
      throw new Error(
        "Configuration not loaded. Call loadConfig() first.\n" +
        "Suggestion: await configManager.loadConfig();"
      );
    }

    if (!this.cachedClient) {
      // Use ClientFactory which has correct cookie header auth
      const client = new Client()
        .setEndpoint(this.cachedConfig.appwriteEndpoint)
        .setProject(this.cachedConfig.appwriteProject);

      // Apply authentication using the correct cookie header approach
      if (this.cachedConfig.sessionCookie) {
        // Set cookie header directly - sessionCookie is in full HTTP cookie format
        client.headers['cookie'] = this.cachedConfig.sessionCookie;
        client.headers['X-Appwrite-Mode'] = 'admin';
        logger.debug("Client created with session authentication", {
          prefix: "ConfigManager",
          email: this.cachedConfig.sessionMetadata?.email
        });
      } else if (this.cachedConfig.appwriteKey && this.cachedConfig.appwriteKey.trim().length > 0) {
        client.setKey(this.cachedConfig.appwriteKey);
        client.headers['X-Appwrite-Mode'] = 'default';
        logger.debug("Client created with API key authentication", {
          prefix: "ConfigManager"
        });
      } else {
        throw new Error(
          "No authentication method available in configuration.\n" +
          "Expected either sessionCookie or appwriteKey to be set.\n" +
          "Suggestion: Run 'appwrite login' or add an API key to your config."
        );
      }

      this.cachedClient = client;
    }

    return this.cachedClient;
  }

  /**
   * Clear the cached client instance.
   * Next call to getClient() will create a new client.
   *
   * @example
   * ```typescript
   * configManager.clearClient();
   * const freshClient = configManager.getClient();
   * ```
   */
  public clearClient(): void {
    logger.debug("Clearing cached client", { prefix: "ConfigManager" });
    this.cachedClient = null;
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
    const collections = [
      ...(config.collections || []),
      ...(config.tables || [])
    ];

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

  /**
   * Get sites from the configuration.
   *
   * @returns Array of sites
   *
   * @example
   * ```typescript
   * const sites = configManager.getSites();
   * console.log(`Found ${sites.length} sites`);
   * ```
   */
  public getSites(): AppwriteSite[] {
    const config = this.getConfig();
    return config.sites || [];
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
