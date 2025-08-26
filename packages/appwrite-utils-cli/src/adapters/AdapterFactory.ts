/**
 * AdapterFactory - Unified Client Creation with Automatic API Detection
 * 
 * This factory creates the appropriate database adapter (TablesDB or Legacy)
 * based on version detection and configuration. It handles dynamic SDK imports
 * and provides a single entry point for all database operations.
 */

import type { AppwriteConfig } from "appwrite-utils";
import { detectAppwriteVersionCached, type ApiMode, type VersionDetectionResult } from "../utils/versionDetection.js";
import type { DatabaseAdapter } from './DatabaseAdapter.js';
import { TablesDBAdapter } from './TablesDBAdapter.js';
import { LegacyAdapter } from './LegacyAdapter.js';

export interface AdapterFactoryConfig {
  appwriteEndpoint: string;
  appwriteProject: string;
  appwriteKey: string;
  apiMode?: 'auto' | 'legacy' | 'tablesdb';
  forceRefresh?: boolean; // Skip detection cache
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
    const cacheKey = `${config.appwriteEndpoint}:${config.appwriteProject}:${config.apiMode || 'auto'}`;
    
    // Check cache first (unless force refresh)
    if (!config.forceRefresh) {
      const cached = this.getCachedAdapter(cacheKey);
      if (cached) {
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
    } else {
      // Auto-detect API mode
      detectionResult = await detectAppwriteVersionCached(
        config.appwriteEndpoint,
        config.appwriteProject,
        config.appwriteKey,
        config.forceRefresh
      );
      apiMode = detectionResult.apiMode;
    }
    
    // Create appropriate adapter
    const result = await this.createAdapter(config, apiMode);
    
    // Cache the result
    this.setCachedAdapter(cacheKey, result.adapter);
    
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
    try {
      // Dynamic import of TablesDB SDK
      const { Client, TablesDB } = await import('node-appwrite-tablesdb');
      
      const client = new Client()
        .setEndpoint(config.appwriteEndpoint)
        .setProject(config.appwriteProject)
        .setKey(config.appwriteKey);
      
      const tablesDB = new TablesDB(client);
      const adapter = new TablesDBAdapter(tablesDB);
      
      return { adapter, client };
      
    } catch (error) {
      console.warn('Failed to load TablesDB SDK, falling back to legacy:', error);
      
      // Fallback to legacy adapter if TablesDB SDK is not available
      return this.createLegacyAdapter(config);
    }
  }
  
  /**
   * Create Legacy adapter with dynamic import
   */
  private static async createLegacyAdapter(
    config: AdapterFactoryConfig
  ): Promise<{ adapter: DatabaseAdapter; client: any }> {
    try {
      // Dynamic import of legacy SDK
      const { Client, Databases } = await import('node-appwrite');
      
      const client = new Client()
        .setEndpoint(config.appwriteEndpoint)
        .setProject(config.appwriteProject)
        .setKey(config.appwriteKey);
      
      const databases = new Databases(client);
      const adapter = new LegacyAdapter(databases);
      
      return { adapter, client };
      
    } catch (error) {
      throw new Error(`Failed to load legacy Appwrite SDK: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
  apiKey: string,
  mode: 'auto' | 'legacy' | 'tablesdb' = 'auto'
): Promise<DatabaseAdapter> {
  const result = await AdapterFactory.create({
    appwriteEndpoint: endpoint,
    appwriteProject: project,
    appwriteKey: apiKey,
    apiMode: mode
  });
  
  return result.adapter;
}

/**
 * Helper function to get adapter metadata without creating full adapter
 */
export async function getApiCapabilities(
  endpoint: string,
  project: string,
  apiKey: string
): Promise<{
  apiMode: ApiMode;
  terminology: { container: string; item: string; service: string };
  capabilities: string[];
}> {
  const adapter = await createDatabaseAdapter(endpoint, project, apiKey, 'auto');
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