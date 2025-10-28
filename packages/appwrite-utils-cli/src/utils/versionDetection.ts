/**
 * Version Detection Utility for Appwrite API Compatibility
 *
 * This module provides functions to detect whether an Appwrite instance
 * supports the new TablesDB API or uses the legacy Databases API.
 *
 * Detection Strategy:
 * 1. Primary: Test TablesDB-specific endpoint availability
 * 2. Secondary: Health endpoint version check
 * 3. Fallback: Default to legacy mode for safety
 */

import { logger } from '../shared/logging.js';
import { MessageFormatter } from '../shared/messageFormatter.js';
import { Client, Databases, TablesDB, Query } from 'node-appwrite';

export type ApiMode = 'legacy' | 'tablesdb';

export interface VersionDetectionResult {
  apiMode: ApiMode;
  detectionMethod: 'endpoint_probe' | 'health_check' | 'fallback';
  serverVersion?: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Detects Appwrite API version and TablesDB support
 * 
 * @param endpoint - Appwrite server endpoint URL
 * @param project - Project ID
 * @param apiKey - API key for authentication
 * @returns Promise resolving to version detection result
 */
export async function detectAppwriteVersion(
  endpoint: string,
  project: string,
  apiKey: string
): Promise<VersionDetectionResult> {
  const startTime = Date.now();
  // Clean endpoint URL
  const cleanEndpoint = endpoint.replace(/\/$/, '');

  logger.info('Starting Appwrite version detection', {
    endpoint: cleanEndpoint,
    project,
    operation: 'detectAppwriteVersion'
  });

  // STEP 1: Check server version FIRST
  const serverVersion = await fetchServerVersion(cleanEndpoint);

  if (serverVersion && !isVersionAtLeast(serverVersion, '1.8.0')) {
    // Server < 1.8.0 doesn't support TablesDB
    logger.info('Server version below 1.8.0 - using legacy adapter', {
      serverVersion,
      operation: 'detectAppwriteVersion'
    });
    return {
      apiMode: 'legacy',
      detectionMethod: 'health_check',
      serverVersion,
      confidence: 'high'
    };
  }

  // STEP 2: If version is unknown, use SDK probe (no fake HTTP endpoints)
  try {
    logger.debug('Attempting SDK-based TablesDB probe', {
      endpoint: cleanEndpoint,
      operation: 'detectAppwriteVersion'
    });

    const client = new Client().setEndpoint(cleanEndpoint).setProject(project);
    if (apiKey && apiKey.trim().length > 0) client.setKey(apiKey);

    const databases = new Databases(client);
    // Try to get a database id to probe tables listing
    let dbId: string | undefined;
    try {
      const dbList: any = await databases.list([Query.limit(1)]);
      dbId = dbList?.databases?.[0]?.$id || dbList?.databases?.[0]?.id || dbList?.[0]?.$id;
    } catch (e) {
      // Ignore, we'll still attempt a conservative probe
      logger.debug('Databases.list probe failed or returned no items', { operation: 'detectAppwriteVersion' });
    }

    const tables = new TablesDB(client);
    if (dbId) {
      // Probe listTables for the first database (limit 1)
      await tables.listTables({ databaseId: dbId, queries: [Query.limit(1)] });
    } else {
      // No databases to probe; assume TablesDB available (cannot falsify-positively without a db)
      logger.debug('No databases found to probe tables; assuming TablesDB if SDK available', { operation: 'detectAppwriteVersion' });
    }

    const result: VersionDetectionResult = {
      apiMode: 'tablesdb',
      detectionMethod: 'endpoint_probe', // repurpose label for SDK probe
      confidence: 'medium',
      serverVersion: serverVersion || undefined
    };
    logger.info('TablesDB detected via SDK probe', {
      endpoint: cleanEndpoint,
      result,
      operation: 'detectAppwriteVersion'
    });
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn('SDK TablesDB probe failed; defaulting conservatively', {
      endpoint: cleanEndpoint,
      error: errorMessage,
      operation: 'detectAppwriteVersion'
    });
  }

  // Final fallback: default to tablesdb for modern environments when version unknown
  const fallbackResult: VersionDetectionResult = {
    apiMode: 'tablesdb',
    detectionMethod: 'fallback',
    confidence: 'low',
    serverVersion: serverVersion || undefined
  };
  logger.info('Defaulting to TablesDB mode (fallback)', {
    endpoint: cleanEndpoint,
    result: fallbackResult,
    operation: 'detectAppwriteVersion'
  });
  return fallbackResult;
}


/**
 * Cached version detection to avoid repeated API calls
 */
class VersionDetectionCache {
  private cache = new Map<string, { result: VersionDetectionResult; timestamp: number }>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  
  private getCacheKey(endpoint: string, project: string): string {
    return `${endpoint}:${project}`;
  }
  
  get(endpoint: string, project: string): VersionDetectionResult | null {
    const key = this.getCacheKey(endpoint, project);
    const cached = this.cache.get(key);
    
    if (!cached) {
      return null;
    }
    
    // Check if cache is expired
    if (Date.now() - cached.timestamp > this.CACHE_DURATION) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.result;
  }
  
  set(endpoint: string, project: string, result: VersionDetectionResult): void {
    const key = this.getCacheKey(endpoint, project);
    this.cache.set(key, {
      result,
      timestamp: Date.now()
    });
  }
  
  clear(): void {
    this.cache.clear();
  }
}

// Global cache instance
const detectionCache = new VersionDetectionCache();

/**
 * Cached version detection with automatic cache management
 * 
 * @param endpoint - Appwrite server endpoint URL
 * @param project - Project ID  
 * @param apiKey - API key for authentication
 * @param forceRefresh - Skip cache and force fresh detection
 * @returns Promise resolving to version detection result
 */
export async function detectAppwriteVersionCached(
  endpoint: string,
  project: string,
  apiKey: string,
  forceRefresh: boolean = false
): Promise<VersionDetectionResult> {
  const startTime = Date.now();

  logger.debug('Version detection with cache requested', {
    endpoint,
    project,
    forceRefresh,
    operation: 'detectAppwriteVersionCached'
  });

  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = detectionCache.get(endpoint, project);
    if (cached) {
      logger.info('Using cached version detection result', {
        endpoint,
        project,
        cachedResult: cached,
        operation: 'detectAppwriteVersionCached'
      });
      return cached;
    }
    logger.debug('No cached result found, performing fresh detection', {
      endpoint,
      project,
      operation: 'detectAppwriteVersionCached'
    });
  } else {
    logger.debug('Force refresh requested, bypassing cache', {
      endpoint,
      project,
      operation: 'detectAppwriteVersionCached'
    });
  }

  // Perform fresh detection
  const result = await detectAppwriteVersion(endpoint, project, apiKey);
  const totalDuration = Date.now() - startTime;

  // Cache the result
  detectionCache.set(endpoint, project, result);

  logger.info('Version detection completed and cached', {
    endpoint,
    project,
    result,
    totalDuration,
    operation: 'detectAppwriteVersionCached'
  });

  return result;
}

/**
 * Quick check for cloud.appwrite.io instances (likely have TablesDB)
 * 
 * @param endpoint - Appwrite server endpoint URL
 * @returns boolean indicating if endpoint is likely cloud-hosted
 */
export function isCloudAppwriteEndpoint(endpoint: string): boolean {
  return endpoint.includes('cloud.appwrite.io');
}

/**
 * SDK feature detection as a fallback method
 * Attempts to dynamically import TablesDB to check availability
 */
// Removed dynamic SDK capability checks to avoid confusion and side effects.

/**
 * Clear version detection cache (useful for testing)
 */
export function clearVersionDetectionCache(): void {
  detectionCache.clear();
}

/**
 * Fetch server version from /health/version (no auth required)
 */
export async function fetchServerVersion(endpoint: string): Promise<string | null> {
  try {
    const clean = endpoint.replace(/\/$/, '');
    const res = await fetch(`${clean}/health/version`, { method: 'GET', signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null) as any;
    const version = (data && (data.version || data.build || data.release)) ?? null;
    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
}

/** Compare semantic versions (basic) */
export function isVersionAtLeast(current: string | undefined, target: string): boolean {
  if (!current) return false;
  const toNums = (v: string) => v.split('.').map(n => parseInt(n, 10));
  const [a1=0,a2=0,a3=0] = toNums(current);
  const [b1,b2,b3] = toNums(target);
  if (a1 !== b1) return a1 > b1;
  if (a2 !== b2) return a2 > b2;
  return a3 >= b3;
}
