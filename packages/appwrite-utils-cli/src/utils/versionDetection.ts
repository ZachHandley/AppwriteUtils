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

  // STEP 2: Only proceed with endpoint probe if version >= 1.8.0 or version unknown
  // Try primary detection method: TablesDB endpoint probe
  try {
    logger.debug('Attempting TablesDB endpoint probe', {
      endpoint: cleanEndpoint,
      serverVersion: serverVersion || 'unknown',
      operation: 'detectAppwriteVersion'
    });

    const probeStartTime = Date.now();
    const tablesDbResult = await probeTablesDbEndpoint(cleanEndpoint, project, apiKey);
    const probeDuration = Date.now() - probeStartTime;

    if (tablesDbResult.apiMode === 'tablesdb') {
      logger.info('TablesDB detected via endpoint probe', {
        endpoint: cleanEndpoint,
        detectionMethod: tablesDbResult.detectionMethod,
        confidence: tablesDbResult.confidence,
        probeDuration,
        totalDuration: Date.now() - startTime,
        operation: 'detectAppwriteVersion'
      });
      return tablesDbResult;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    MessageFormatter.warning(`TablesDB endpoint probe failed: ${errorMessage}`, { prefix: "Version Detection" });
    logger.warn('TablesDB endpoint probe failed', {
      endpoint: cleanEndpoint,
      error: errorMessage,
      operation: 'detectAppwriteVersion'
    });
  }
  
  // Try secondary detection method: SDK feature detection
  try {
    logger.debug('Attempting SDK capability probe', {
      endpoint: cleanEndpoint,
      operation: 'detectAppwriteVersion'
    });

    const sdkProbeStartTime = Date.now();
    const sdkResult = await probeSdkCapabilities();
    const sdkProbeDuration = Date.now() - sdkProbeStartTime;

    if (sdkResult.apiMode === 'tablesdb') {
      logger.info('TablesDB detected via SDK capability probe', {
        endpoint: cleanEndpoint,
        detectionMethod: sdkResult.detectionMethod,
        confidence: sdkResult.confidence,
        sdkProbeDuration,
        totalDuration: Date.now() - startTime,
        operation: 'detectAppwriteVersion'
      });
      return sdkResult;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    MessageFormatter.warning(`SDK capability probe failed: ${errorMessage}`, { prefix: "Version Detection" });
    logger.warn('SDK capability probe failed', {
      endpoint: cleanEndpoint,
      error: errorMessage,
      operation: 'detectAppwriteVersion'
    });
  }

  // Fallback to legacy mode
  const fallbackResult = {
    apiMode: 'legacy' as ApiMode,
    detectionMethod: 'fallback' as const,
    confidence: 'low' as const
  };

  logger.info('Falling back to legacy mode', {
    endpoint: cleanEndpoint,
    totalDuration: Date.now() - startTime,
    result: fallbackResult,
    operation: 'detectAppwriteVersion'
  });

  return fallbackResult;
}

/**
 * Test TablesDB endpoint availability - most reliable detection method
 */
async function probeTablesDbEndpoint(
  endpoint: string,
  project: string,
  apiKey: string
): Promise<VersionDetectionResult> {
  const startTime = Date.now();
  const url = `${endpoint}/tablesdb/`;

  logger.debug('Probing TablesDB endpoint', {
    url,
    project,
    operation: 'probeTablesDbEndpoint'
  });

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': project,
      'X-Appwrite-Key': apiKey
    },
    // Short timeout for faster detection
    signal: AbortSignal.timeout(5000)
  });

  const duration = Date.now() - startTime;

  logger.debug('TablesDB endpoint response received', {
    url,
    status: response.status,
    statusText: response.statusText,
    duration,
    operation: 'probeTablesDbEndpoint'
  });

  if (response.ok) {
    // ONLY 200 OK means TablesDB available
    // 404 means endpoint doesn't exist (server < 1.8.0)
    const result = {
      apiMode: 'tablesdb' as ApiMode,
      detectionMethod: 'endpoint_probe' as const,
      confidence: 'high' as const
    };

    logger.info('TablesDB endpoint probe successful', {
      url,
      status: response.status,
      result,
      duration,
      operation: 'probeTablesDbEndpoint'
    });

    return result;
  }

  // 501 Not Implemented or other errors = no TablesDB support
  const error = new Error(`TablesDB endpoint returned ${response.status}: ${response.statusText}`);
  logger.debug('TablesDB endpoint probe failed', {
    url,
    status: response.status,
    statusText: response.statusText,
    duration,
    operation: 'probeTablesDbEndpoint'
  });
  throw error;
}

/**
 * SDK capability detection as secondary method
 */
async function probeSdkCapabilities(): Promise<VersionDetectionResult> {
  try {
    // Try to import TablesDB SDK
    let TablesDBModule;
    try {
      TablesDBModule = await import('node-appwrite-tablesdb');
    } catch (importError) {
      // TablesDB SDK not available, will fall back to legacy
    }
    
    if (TablesDBModule?.TablesDB) {
      return {
        apiMode: 'tablesdb',
        detectionMethod: 'endpoint_probe',
        confidence: 'medium'
      };
    }
  } catch (error) {
    // TablesDB SDK not available, assume legacy
  }
  
  // Check for legacy SDK availability
  try {
    const { Databases } = await import('node-appwrite');
    if (Databases) {
      return {
        apiMode: 'legacy',
        detectionMethod: 'endpoint_probe',
        confidence: 'medium'
      };
    }
  } catch (error) {
    throw new Error('No Appwrite SDK available');
  }
  
  throw new Error('Unable to determine SDK capabilities');
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
export async function detectSdkSupport(): Promise<{
  tablesDbAvailable: boolean;
  legacyAvailable: boolean;
}> {
  const result = {
    tablesDbAvailable: false,
    legacyAvailable: false
  };
  
  // Test TablesDB SDK availability
  try {
    const tablesModule = await import('node-appwrite-tablesdb');
    if (tablesModule) {
      result.tablesDbAvailable = true;
    }
  } catch (error) {
    // TablesDB SDK not available
  }
  
  // Test legacy SDK availability  
  try {
    await import('node-appwrite');
    result.legacyAvailable = true;
  } catch (error) {
    // Legacy SDK not available
  }
  
  return result;
}

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
