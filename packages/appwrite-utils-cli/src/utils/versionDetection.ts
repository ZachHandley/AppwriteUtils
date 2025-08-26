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
  // Clean endpoint URL
  const cleanEndpoint = endpoint.replace(/\/$/, '');
  
  // Try primary detection method: TablesDB endpoint probe
  try {
    const tablesDbResult = await probeTablesDbEndpoint(cleanEndpoint, project, apiKey);
    if (tablesDbResult.apiMode === 'tablesdb') {
      return tablesDbResult;
    }
  } catch (error) {
    console.warn('TablesDB endpoint probe failed:', error instanceof Error ? error.message : 'Unknown error');
  }
  
  // Try secondary detection method: SDK feature detection
  try {
    const sdkResult = await probeSdkCapabilities();
    if (sdkResult.apiMode === 'tablesdb') {
      return sdkResult;
    }
  } catch (error) {
    console.warn('SDK capability probe failed:', error instanceof Error ? error.message : 'Unknown error');
  }
  
  // Fallback to legacy mode
  return {
    apiMode: 'legacy',
    detectionMethod: 'fallback',
    confidence: 'low'
  };
}

/**
 * Test TablesDB endpoint availability - most reliable detection method
 */
async function probeTablesDbEndpoint(
  endpoint: string,
  project: string,
  apiKey: string
): Promise<VersionDetectionResult> {
  const response = await fetch(`${endpoint}/tablesdb/`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': project,
      'X-Appwrite-Key': apiKey
    },
    // Short timeout for faster detection
    signal: AbortSignal.timeout(5000)
  });
  
  if (response.ok || response.status === 404) {
    // 200 = TablesDB available, 404 = endpoint exists but no tables
    // Both indicate TablesDB support
    return {
      apiMode: 'tablesdb',
      detectionMethod: 'endpoint_probe',
      confidence: 'high'
    };
  }
  
  // 501 Not Implemented or other errors = no TablesDB support
  throw new Error(`TablesDB endpoint returned ${response.status}: ${response.statusText}`);
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
  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = detectionCache.get(endpoint, project);
    if (cached) {
      return cached;
    }
  }
  
  // Perform fresh detection
  const result = await detectAppwriteVersion(endpoint, project, apiKey);
  
  // Cache the result
  detectionCache.set(endpoint, project, result);
  
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