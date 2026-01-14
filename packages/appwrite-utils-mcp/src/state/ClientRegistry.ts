/**
 * Registry for managing Appwrite client instances with caching
 * @packageDocumentation
 */

import { AdapterFactory, type DatabaseAdapter } from 'appwrite-utils-helpers';
import type { Client } from 'node-appwrite';

/**
 * Client credentials for Appwrite client (extends auth with API mode)
 */
export interface ClientCredentials {
  endpoint: string;
  projectId: string;
  apiKey?: string;
  sessionCookie?: string;
  authMethod?: 'session' | 'apikey' | 'auto';
  apiMode?: 'auto' | 'legacy' | 'tablesdb';
}

/**
 * Cached client with metadata
 */
export interface CachedClient {
  client: Client;
  adapter: DatabaseAdapter;
  credentials: ClientCredentials;
  timestamp: number;
}

/**
 * Registry for managing Appwrite client instances.
 *
 * Caches authenticated clients and database adapters with a TTL of 5 minutes.
 * Uses cache key format: endpoint:projectId:authMethod
 *
 * @example
 * ```typescript
 * const registry = new ClientRegistry();
 * const { client, adapter } = await registry.getOrCreate({
 *   endpoint: 'https://cloud.appwrite.io/v1',
 *   projectId: 'my-project',
 *   apiKey: 'my-api-key'
 * });
 * ```
 */
export class ClientRegistry {
  private clients: Map<string, CachedClient>;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.clients = new Map();
  }

  /**
   * Get or create an authenticated Appwrite client and adapter.
   *
   * @param credentials - Authentication credentials
   * @returns Cached client with adapter and metadata
   * @throws Error if authentication fails or adapter creation fails
   */
  async getOrCreate(credentials: ClientCredentials): Promise<CachedClient> {
    const cacheKey = this.generateCacheKey(credentials);

    // Check cache for valid entry
    const cached = this.clients.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    // Create new client and adapter using AdapterFactory
    const result = await AdapterFactory.create({
      appwriteEndpoint: credentials.endpoint,
      appwriteProject: credentials.projectId,
      appwriteKey: credentials.apiKey,
      sessionCookie: credentials.sessionCookie,
      authMethod: credentials.authMethod || 'auto',
      apiMode: credentials.apiMode || 'auto',
      forceRefresh: false
    });

    const cachedClient: CachedClient = {
      client: result.client,
      adapter: result.adapter,
      credentials,
      timestamp: Date.now()
    };

    // Cache the result
    this.clients.set(cacheKey, cachedClient);

    return cachedClient;
  }

  /**
   * Invalidate cached clients.
   *
   * @param key - Optional specific cache key to invalidate. If not provided, clears all cached clients.
   */
  invalidate(key?: string): void {
    if (key) {
      this.clients.delete(key);
    } else {
      this.clients.clear();
    }
  }

  /**
   * Generate cache key from credentials.
   * Format: endpoint:projectId:authMethod
   *
   * @param credentials - Authentication credentials
   * @returns Cache key string
   */
  private generateCacheKey(credentials: ClientCredentials): string {
    const authMethod = credentials.sessionCookie ? 'session' :
                      credentials.apiKey ? 'apikey' :
                      'none';
    return `${credentials.endpoint}:${credentials.projectId}:${authMethod}`;
  }

  /**
   * Check if cached client is still valid based on TTL.
   *
   * @param cached - Cached client entry
   * @returns True if cache is still valid
   */
  private isCacheValid(cached: CachedClient): boolean {
    return (Date.now() - cached.timestamp) < this.CACHE_TTL;
  }

  /**
   * Get cache statistics for monitoring.
   *
   * @returns Object with cache size and oldest entry age
   */
  getCacheStats(): { size: number; oldestEntryAge: number | null } {
    if (this.clients.size === 0) {
      return { size: 0, oldestEntryAge: null };
    }

    const now = Date.now();
    let oldestTimestamp = now;

    for (const cached of this.clients.values()) {
      if (cached.timestamp < oldestTimestamp) {
        oldestTimestamp = cached.timestamp;
      }
    }

    return {
      size: this.clients.size,
      oldestEntryAge: now - oldestTimestamp
    };
  }

  /**
   * Clean up expired cache entries.
   * Removes entries older than the TTL.
   *
   * @returns Number of entries removed
   */
  cleanupExpired(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, cached] of this.clients.entries()) {
      if ((now - cached.timestamp) >= this.CACHE_TTL) {
        this.clients.delete(key);
        removed++;
      }
    }

    return removed;
  }
}
