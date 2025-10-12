/**
 * AdapterFactory - Unified Client Creation with Automatic API Detection
 * 
 * This factory creates the appropriate database adapter (TablesDB or Legacy)
 * based on version detection and configuration. It handles dynamic SDK imports
 * and provides a single entry point for all database operations.
 */

import type { AppwriteConfig } from "appwrite-utils";
import { detectAppwriteVersionCached, isVersionAtLeast, type ApiMode, type VersionDetectionResult } from "../utils/versionDetection.js";
import type { DatabaseAdapter } from './DatabaseAdapter.js';
import { TablesDBAdapter } from './TablesDBAdapter.js';
import { LegacyAdapter } from './LegacyAdapter.js';
import { logger } from '../shared/logging.js';
import { getClientWithAuth } from '../utils/getClientFromConfig.js';
import { isValidSessionCookie } from '../utils/sessionAuth.js';
import { MessageFormatter } from '../shared/messageFormatter.js';

export interface AdapterFactoryConfig {
  appwriteEndpoint: string;
  appwriteProject: string;
  appwriteKey?: string; // Made optional to support session-only auth
  apiMode?: 'auto' | 'legacy' | 'tablesdb';
  forceRefresh?: boolean; // Skip detection cache
  sessionCookie?: string; // Session authentication support
  authMethod?: 'session' | 'apikey' | 'auto'; // Authentication method preference
  preConfiguredClient?: any; // Pre-configured authenticated client
}

export interface AdapterFactoryResult {
  adapter: DatabaseAdapter;
  apiMode: ApiMode;
  detectionResult?: VersionDetectionResult;
  client: any;
}

/**
 * AdapterFactory - Main factory class for creating database adapters
 */
export class AdapterFactory {
  private static cache = new Map<string, { adapter: DatabaseAdapter; timestamp: number }>();
  private static readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  
  /**
   * Create a database adapter based on configuration and detection
   */
  static async create(config: AdapterFactoryConfig): Promise<AdapterFactoryResult> {
    const startTime = Date.now();

    // Validate authentication configuration
    this.validateAuthConfig(config);

    const cacheKey = `${config.appwriteEndpoint}:${config.appwriteProject}:${config.apiMode || 'auto'}`;

    logger.info('Creating database adapter', {
      endpoint: config.appwriteEndpoint,
      project: config.appwriteProject,
      requestedApiMode: config.apiMode || 'auto',
      authMethod: config.authMethod || 'auto',
      hasSessionCookie: !!config.sessionCookie,
      hasPreConfiguredClient: !!config.preConfiguredClient,
      forceRefresh: config.forceRefresh,
      cacheKey,
      operation: 'AdapterFactory.create'
    });

    // Check cache first (unless force refresh)
    if (!config.forceRefresh) {
      const cached = this.getCachedAdapter(cacheKey);
      if (cached) {
        const cacheAge = Date.now() - cached.timestamp;
        logger.info('Using cached adapter', {
          cacheKey,
          cacheAge,
          apiMode: cached.adapter.getApiMode(),
          operation: 'AdapterFactory.create'
        });
        return {
          adapter: cached.adapter,
          apiMode: cached.adapter.getApiMode(),
          client: cached.adapter.getRawClient()
        };
      }
    }
    
    // Determine API mode
    let apiMode: ApiMode;
    let detectionResult: VersionDetectionResult | undefined;

    if (config.apiMode && config.apiMode !== 'auto') {
      // Use explicitly configured mode
      apiMode = config.apiMode;
      logger.info('Using explicitly configured API mode', {
        apiMode,
        endpoint: config.appwriteEndpoint,
        operation: 'AdapterFactory.create'
      });
    } else {
      // Auto-detect API mode
      logger.info('Starting API mode auto-detection', {
        endpoint: config.appwriteEndpoint,
        project: config.appwriteProject,
        forceRefresh: config.forceRefresh,
        operation: 'AdapterFactory.create'
      });

      const detectionStartTime = Date.now();
      // For version detection, we need some form of authentication
      const authKey = config.appwriteKey || '';
      detectionResult = await detectAppwriteVersionCached(
        config.appwriteEndpoint,
        config.appwriteProject,
        authKey,
        config.forceRefresh
      );
      const detectionDuration = Date.now() - detectionStartTime;

      apiMode = detectionResult.apiMode;

      logger.info('API mode detection completed', {
        apiMode,
        detectionMethod: detectionResult.detectionMethod,
        confidence: detectionResult.confidence,
        serverVersion: detectionResult.serverVersion,
        detectionDuration,
        endpoint: config.appwriteEndpoint,
        operation: 'AdapterFactory.create'
      });

      // Add version-based safety check to prevent using TablesDB on old servers
      if (detectionResult.serverVersion &&
          !isVersionAtLeast(detectionResult.serverVersion, '1.8.0') &&
          apiMode === 'tablesdb') {
        logger.warn('Overriding TablesDB detection - server version too old', {
          serverVersion: detectionResult.serverVersion,
          detectedMode: apiMode,
          overrideMode: 'legacy',
          operation: 'AdapterFactory.create'
        });
        apiMode = 'legacy';
      }
    }
    
    // Create appropriate adapter
    logger.info('Creating adapter instance', {
      apiMode,
      endpoint: config.appwriteEndpoint,
      operation: 'AdapterFactory.create'
    });

    const adapterStartTime = Date.now();
    const result = await this.createAdapter(config, apiMode);
    const adapterDuration = Date.now() - adapterStartTime;

    // Cache the result
    this.setCachedAdapter(cacheKey, result.adapter);

    const totalDuration = Date.now() - startTime;
    logger.info('Adapter creation completed', {
      apiMode,
      adapterDuration,
      totalDuration,
      cached: true,
      operation: 'AdapterFactory.create'
    });

    return {
      ...result,
      apiMode,
      detectionResult
    };
  }
  
  /**
   * Create adapter from AppwriteConfig (convenience method)
   */
  static async createFromConfig(config: AppwriteConfig, forceRefresh?: boolean): Promise<AdapterFactoryResult> {
    return this.create({
      appwriteEndpoint: config.appwriteEndpoint,
      appwriteProject: config.appwriteProject,
      appwriteKey: config.appwriteKey,
      apiMode: (config as any).apiMode || 'auto', // Cast to access new property
      forceRefresh
    });
  }
  
  /**
   * Create specific adapter type (internal method)
   */
  private static async createAdapter(
    config: AdapterFactoryConfig, 
    apiMode: ApiMode
  ): Promise<{ adapter: DatabaseAdapter; client: any }> {
    if (apiMode === 'tablesdb') {
      return this.createTablesDBAdapter(config);
    } else {
      return this.createLegacyAdapter(config);
    }
  }
  
  /**
   * Create TablesDB adapter with dynamic import
   */
  private static async createTablesDBAdapter(
    config: AdapterFactoryConfig
  ): Promise<{ adapter: DatabaseAdapter; client: any }> {
    const startTime = Date.now();

    try {
      logger.info('Loading TablesDB SDK', {
        endpoint: config.appwriteEndpoint,
        operation: 'createTablesDBAdapter'
      });

      // Dynamic import of TablesDB SDK
      const importStartTime = Date.now();
      const { Client, TablesDB } = await import('node-appwrite-tablesdb');
      const importDuration = Date.now() - importStartTime;

      logger.debug('TablesDB SDK import successful', {
        importDuration,
        operation: 'createTablesDBAdapter'
      });

      // Use pre-configured client or create session-aware client with TablesDB Client
      let client: any;
      if (config.preConfiguredClient) {
        client = config.preConfiguredClient;
      } else {
        client = new Client()
          .setEndpoint(config.appwriteEndpoint)
          .setProject(config.appwriteProject);

        // Set authentication method with mode headers
        // Prefer session with admin mode, fallback to API key with default mode
        if (config.sessionCookie && isValidSessionCookie(config.sessionCookie)) {
          client.setSession(config.sessionCookie);
          client.headers['X-Appwrite-Mode'] = 'admin';
          logger.debug('Using session authentication for TablesDB adapter', {
            project: config.appwriteProject,
            operation: 'createTablesDBAdapter'
          });
        } else if (config.appwriteKey) {
          client.setKey(config.appwriteKey);
          client.headers['X-Appwrite-Mode'] = 'default';
          logger.debug('Using API key authentication for TablesDB adapter', {
            project: config.appwriteProject,
            operation: 'createTablesDBAdapter'
          });
        } else {
          throw new Error("No authentication available for adapter");
        }
      }

      const tablesDB = new TablesDB(client);
      const adapter = new TablesDBAdapter(tablesDB);

      const totalDuration = Date.now() - startTime;
      logger.info('TablesDB adapter created successfully', {
        totalDuration,
        importDuration,
        endpoint: config.appwriteEndpoint,
        operation: 'createTablesDBAdapter'
      });

      return { adapter, client };

    } catch (error) {
      const errorDuration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      MessageFormatter.warning('Failed to create TablesDB adapter - falling back to legacy', { prefix: "Adapter" });

      logger.warn('TablesDB adapter creation failed, falling back to legacy', {
        error: errorMessage,
        errorDuration,
        endpoint: config.appwriteEndpoint,
        operation: 'createTablesDBAdapter'
      });

      // Fallback to legacy adapter if TablesDB creation fails
      return this.createLegacyAdapter(config);
    }
  }
  
  /**
   * Create Legacy adapter with dynamic import
   */
  private static async createLegacyAdapter(
    config: AdapterFactoryConfig
  ): Promise<{ adapter: DatabaseAdapter; client: any }> {
    const startTime = Date.now();

    try {
      logger.info('Loading legacy Appwrite SDK', {
        endpoint: config.appwriteEndpoint,
        operation: 'createLegacyAdapter'
      });

      // Dynamic import of legacy SDK
      const importStartTime = Date.now();
      const { Client, Databases } = await import('node-appwrite');
      const importDuration = Date.now() - importStartTime;

      logger.debug('Legacy SDK import successful', {
        importDuration,
        operation: 'createLegacyAdapter'
      });

      // Use pre-configured client or create session-aware client with Legacy Client
      let client: any;
      if (config.preConfiguredClient) {
        client = config.preConfiguredClient;
      } else {
        client = new Client()
          .setEndpoint(config.appwriteEndpoint)
          .setProject(config.appwriteProject);

        // Set authentication method with mode headers
        // Prefer session with admin mode, fallback to API key with default mode
        if (config.sessionCookie && isValidSessionCookie(config.sessionCookie)) {
          (client as any).setSession(config.sessionCookie);
          client.headers['X-Appwrite-Mode'] = 'admin';
          logger.debug('Using session authentication for Legacy adapter', {
            project: config.appwriteProject,
            operation: 'createLegacyAdapter'
          });
        } else if (config.appwriteKey) {
          client.setKey(config.appwriteKey);
          client.headers['X-Appwrite-Mode'] = 'default';
          logger.debug('Using API key authentication for Legacy adapter', {
            project: config.appwriteProject,
            operation: 'createLegacyAdapter'
          });
        } else {
          throw new Error("No authentication available for adapter");
        }
      }

      const databases = new Databases(client);
      const adapter = new LegacyAdapter(databases);

      const totalDuration = Date.now() - startTime;
      logger.info('Legacy adapter created successfully', {
        totalDuration,
        importDuration,
        endpoint: config.appwriteEndpoint,
        operation: 'createLegacyAdapter'
      });

      return { adapter, client };

    } catch (error) {
      const errorDuration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Failed to load legacy Appwrite SDK', {
        error: errorMessage,
        errorDuration,
        endpoint: config.appwriteEndpoint,
        operation: 'createLegacyAdapter'
      });

      throw new Error(`Failed to load legacy Appwrite SDK: ${errorMessage}`);
    }
  }
  
  /**
   * Get cached adapter if available and not expired
   */
  private static getCachedAdapter(cacheKey: string): { adapter: DatabaseAdapter; timestamp: number } | null {
    const cached = this.cache.get(cacheKey);
    
    if (!cached) {
      return null;
    }
    
    // Check if cache is expired
    if (Date.now() - cached.timestamp > this.CACHE_DURATION) {
      this.cache.delete(cacheKey);
      return null;
    }
    
    return cached;
  }
  
  /**
   * Cache adapter instance
   */
  private static setCachedAdapter(cacheKey: string, adapter: DatabaseAdapter): void {
    this.cache.set(cacheKey, {
      adapter,
      timestamp: Date.now()
    });
  }
  
  /**
   * Clear adapter cache (useful for testing)
   */
  static clearCache(): void {
    this.cache.clear();
  }

  /**
   * Validate authentication configuration
   */
  private static validateAuthConfig(config: AdapterFactoryConfig): void {
    const hasApiKey = config.appwriteKey && config.appwriteKey.trim().length > 0;
    const hasSessionCookie = config.sessionCookie && isValidSessionCookie(config.sessionCookie);
    const hasPreConfiguredClient = !!config.preConfiguredClient;

    // Must have at least one authentication method
    if (!hasApiKey && !hasSessionCookie && !hasPreConfiguredClient) {
      throw new Error(
        `No valid authentication method provided for project ${config.appwriteProject}. ` +
        `Please provide an API key, session cookie, or pre-configured client.`
      );
    }

    // Validate session cookie format if provided
    if (config.sessionCookie && !isValidSessionCookie(config.sessionCookie)) {
      throw new Error(
        `Invalid session cookie format provided for project ${config.appwriteProject}. ` +
        `Session cookie must be a valid JWT token.`
      );
    }

    logger.debug('Authentication configuration validated', {
      hasApiKey,
      hasSessionCookie,
      hasPreConfiguredClient,
      authMethod: config.authMethod || 'auto',
      operation: 'validateAuthConfig'
    });
  }
  
  /**
   * Test connection and API capabilities
   */
  static async testConnection(config: AdapterFactoryConfig): Promise<{
    success: boolean;
    apiMode: ApiMode;
    capabilities: string[];
    error?: string;
  }> {
    try {
      const result = await this.create({ ...config, forceRefresh: true });
      const metadata = result.adapter.getMetadata();
      
      // Test basic operations
      const capabilities = [];
      
      if (metadata.capabilities.bulkOperations) {
        capabilities.push('Bulk Operations');
      }
      
      if (metadata.capabilities.advancedQueries) {
        capabilities.push('Advanced Queries');
      }
      
      if (metadata.capabilities.realtime) {
        capabilities.push('Realtime');
      }
      
      if (metadata.capabilities.transactions) {
        capabilities.push('Transactions');
      }
      
      return {
        success: true,
        apiMode: result.apiMode,
        capabilities
      };
      
    } catch (error) {
      return {
        success: false,
        apiMode: 'legacy', // Default fallback
        capabilities: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

/**
 * Convenience function for quick adapter creation
 */
export async function createDatabaseAdapter(
  endpoint: string,
  project: string,
  apiKey?: string,
  mode: 'auto' | 'legacy' | 'tablesdb' = 'auto',
  sessionCookie?: string
): Promise<DatabaseAdapter> {
  const result = await AdapterFactory.create({
    appwriteEndpoint: endpoint,
    appwriteProject: project,
    appwriteKey: apiKey,
    apiMode: mode,
    sessionCookie
  });

  return result.adapter;
}

/**
 * Helper function to get adapter metadata without creating full adapter
 */
export async function getApiCapabilities(
  endpoint: string,
  project: string,
  apiKey?: string,
  sessionCookie?: string
): Promise<{
  apiMode: ApiMode;
  terminology: { container: string; item: string; service: string };
  capabilities: string[];
}> {
  const adapter = await createDatabaseAdapter(endpoint, project, apiKey, 'auto', sessionCookie);
  const metadata = adapter.getMetadata();

  const capabilities = [];
  if (metadata.capabilities.bulkOperations) capabilities.push('Bulk Operations');
  if (metadata.capabilities.advancedQueries) capabilities.push('Advanced Queries');
  if (metadata.capabilities.realtime) capabilities.push('Realtime');
  if (metadata.capabilities.transactions) capabilities.push('Transactions');

  return {
    apiMode: metadata.apiMode,
    terminology: metadata.terminology,
    capabilities
  };
}