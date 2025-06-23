import pLimit from "p-limit";
import { logger } from "../../shared/logging.js";

export interface RateLimitConfig {
  // Data operations
  dataInsertion?: number;
  dataUpdate?: number;
  dataQuery?: number;
  
  // File operations  
  fileUpload?: number;
  fileDownload?: number;
  
  // Validation operations
  validation?: number;
  
  // Relationship operations
  relationshipResolution?: number;
  
  // User operations
  userCreation?: number;
  userUpdate?: number;
  
  // API operations
  apiCalls?: number;
}

/**
 * Manages rate limiting across the import system.
 * Provides configurable p-limit instances for different operation types.
 * Builds on existing p-limit usage in attributeManager and other components.
 */
export class RateLimitManager {
  private limits: Map<string, any> = new Map();
  private config: Required<RateLimitConfig>;

  // Default rate limits based on existing usage and best practices
  private static readonly DEFAULT_LIMITS: Required<RateLimitConfig> = {
    dataInsertion: 5,           // Conservative for database writes
    dataUpdate: 8,              // Slightly higher for updates
    dataQuery: 25,              // Higher for read operations (from existing queryLimit)
    fileUpload: 2,              // Very conservative for file uploads
    fileDownload: 3,            // Slightly higher for downloads
    validation: 10,             // Higher for validation operations
    relationshipResolution: 8,  // Moderate for relationship operations
    userCreation: 3,            // Conservative for user creation
    userUpdate: 5,              // Moderate for user updates
    apiCalls: 15,               // General API call limit
  };

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = { ...RateLimitManager.DEFAULT_LIMITS, ...config };
    this.initializeLimits();
  }

  /**
   * Initializes p-limit instances for all operation types.
   */
  private initializeLimits(): void {
    for (const [operation, limit] of Object.entries(this.config)) {
      this.limits.set(operation, pLimit(limit));
      logger.debug(`Rate limit for ${operation}: ${limit} concurrent operations`);
    }
  }

  /**
   * Gets the rate limiter for data insertion operations.
   */
  get dataInsertion() {
    return this.limits.get('dataInsertion');
  }

  /**
   * Gets the rate limiter for data update operations.
   */
  get dataUpdate() {
    return this.limits.get('dataUpdate');
  }

  /**
   * Gets the rate limiter for data query operations.
   */
  get dataQuery() {
    return this.limits.get('dataQuery');
  }

  /**
   * Gets the rate limiter for file upload operations.
   */
  get fileUpload() {
    return this.limits.get('fileUpload');
  }

  /**
   * Gets the rate limiter for file download operations.
   */
  get fileDownload() {
    return this.limits.get('fileDownload');
  }

  /**
   * Gets the rate limiter for validation operations.
   */
  get validation() {
    return this.limits.get('validation');
  }

  /**
   * Gets the rate limiter for relationship resolution operations.
   */
  get relationshipResolution() {
    return this.limits.get('relationshipResolution');
  }

  /**
   * Gets the rate limiter for user creation operations.
   */
  get userCreation() {
    return this.limits.get('userCreation');
  }

  /**
   * Gets the rate limiter for user update operations.
   */
  get userUpdate() {
    return this.limits.get('userUpdate');
  }

  /**
   * Gets the rate limiter for general API calls.
   */
  get apiCalls() {
    return this.limits.get('apiCalls');
  }

  /**
   * Gets a rate limiter by operation type name.
   * 
   * @param operationType - The type of operation
   * @returns The p-limit instance for the operation type
   */
  getLimiter(operationType: keyof RateLimitConfig): any {
    const limiter = this.limits.get(operationType);
    if (!limiter) {
      logger.warn(`No rate limiter found for operation type: ${operationType}. Using default API calls limiter.`);
      return this.limits.get('apiCalls');
    }
    return limiter;
  }

  /**
   * Updates the rate limit for a specific operation type.
   * 
   * @param operationType - The operation type to update
   * @param newLimit - The new concurrent operation limit
   */
  updateLimit(operationType: keyof RateLimitConfig, newLimit: number): void {
    this.config[operationType] = newLimit;
    this.limits.set(operationType, pLimit(newLimit));
    logger.info(`Updated rate limit for ${operationType}: ${newLimit} concurrent operations`);
  }

  /**
   * Updates multiple rate limits at once.
   * 
   * @param newConfig - Partial configuration with new limits
   */
  updateLimits(newConfig: Partial<RateLimitConfig>): void {
    for (const [operation, limit] of Object.entries(newConfig)) {
      if (limit !== undefined) {
        this.updateLimit(operation as keyof RateLimitConfig, limit);
      }
    }
  }

  /**
   * Gets the current configuration.
   */
  getConfig(): Required<RateLimitConfig> {
    return { ...this.config };
  }

  /**
   * Gets statistics about pending and active operations.
   * Useful for monitoring and debugging rate limiting.
   */
  getStatistics(): { [operationType: string]: { pending: number; active: number } } {
    const stats: { [operationType: string]: { pending: number; active: number } } = {};

    for (const [operationType, limiter] of this.limits.entries()) {
      stats[operationType] = {
        pending: limiter.pendingCount,
        active: limiter.activeCount,
      };
    }

    return stats;
  }

  /**
   * Waits for all pending operations to complete.
   * Useful for graceful shutdown or testing.
   * 
   * @param timeout - Maximum time to wait in milliseconds (default: 30 seconds)
   */
  async waitForCompletion(timeout: number = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const stats = this.getStatistics();
      const hasPendingOperations = Object.values(stats).some(
        stat => stat.pending > 0 || stat.active > 0
      );

      if (!hasPendingOperations) {
        logger.info("All rate-limited operations completed");
        return;
      }

      // Log current status
      const pendingOperations = Object.entries(stats)
        .filter(([_, stat]) => stat.pending > 0 || stat.active > 0)
        .map(([type, stat]) => `${type}: ${stat.pending} pending, ${stat.active} active`)
        .join(", ");

      logger.debug(`Waiting for operations to complete: ${pendingOperations}`);

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.warn(`Timeout waiting for rate-limited operations to complete after ${timeout}ms`);
  }

  /**
   * Creates a rate limiter with automatic retry logic.
   * Combines p-limit with retry functionality for robust operation handling.
   * 
   * @param operationType - The operation type to get the limiter for
   * @param maxRetries - Maximum number of retries (default: 3)
   * @param retryDelay - Delay between retries in milliseconds (default: 1000)
   */
  createRetryLimiter(
    operationType: keyof RateLimitConfig,
    maxRetries: number = 3,
    retryDelay: number = 1000
  ) {
    const limiter = this.getLimiter(operationType);

    return async <T>(operation: () => Promise<T>): Promise<T> => {
      return limiter(async () => {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            return await operation();
          } catch (error) {
            lastError = error as Error;
            
            if (attempt < maxRetries) {
              logger.warn(
                `Operation failed (attempt ${attempt + 1}/${maxRetries + 1}): ${lastError.message}. Retrying in ${retryDelay}ms...`
              );
              await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
          }
        }

        // If we get here, all retries failed
        logger.error(`Operation failed after ${maxRetries + 1} attempts: ${lastError?.message}`);
        throw lastError;
      });
    };
  }

  /**
   * Adjusts rate limits based on API response times and error rates.
   * Implements adaptive rate limiting for optimal performance.
   * 
   * @param operationType - The operation type to adjust
   * @param responseTime - Average response time in milliseconds
   * @param errorRate - Error rate as a percentage (0-100)
   */
  adaptiveAdjust(operationType: keyof RateLimitConfig, responseTime: number, errorRate: number): void {
    const currentLimit = this.config[operationType];
    let newLimit = currentLimit;

    // If error rate is high, reduce concurrency
    if (errorRate > 10) {
      newLimit = Math.max(1, Math.floor(currentLimit * 0.7));
      logger.info(`Reducing ${operationType} limit due to high error rate (${errorRate}%): ${currentLimit} -> ${newLimit}`);
    }
    // If response time is high, reduce concurrency
    else if (responseTime > 5000) {
      newLimit = Math.max(1, Math.floor(currentLimit * 0.8));
      logger.info(`Reducing ${operationType} limit due to high response time (${responseTime}ms): ${currentLimit} -> ${newLimit}`);
    }
    // If performance is good, gradually increase concurrency
    else if (errorRate < 2 && responseTime < 1000 && currentLimit < RateLimitManager.DEFAULT_LIMITS[operationType] * 2) {
      newLimit = Math.min(RateLimitManager.DEFAULT_LIMITS[operationType] * 2, currentLimit + 1);
      logger.info(`Increasing ${operationType} limit due to good performance: ${currentLimit} -> ${newLimit}`);
    }

    if (newLimit !== currentLimit) {
      this.updateLimit(operationType, newLimit);
    }
  }

  /**
   * Resets all rate limits to default values.
   */
  resetToDefaults(): void {
    logger.info("Resetting all rate limits to default values");
    this.config = { ...RateLimitManager.DEFAULT_LIMITS };
    this.initializeLimits();
  }

  /**
   * Creates a specialized batch processor with rate limiting.
   * Useful for processing large datasets with controlled concurrency.
   * 
   * @param operationType - The operation type for rate limiting
   * @param batchSize - Number of items to process in each batch
   */
  createBatchProcessor<T, R>(
    operationType: keyof RateLimitConfig,
    batchSize: number = 50
  ) {
    const limiter = this.getLimiter(operationType);

    return async (
      items: T[],
      processor: (item: T) => Promise<R>,
      onProgress?: (processed: number, total: number) => void
    ): Promise<R[]> => {
      const results: R[] = [];
      
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        
        const batchPromises = batch.map(item =>
          limiter(() => processor(item))
        );

        const batchResults = await Promise.allSettled(batchPromises);
        
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            logger.error(`Batch item failed: ${result.reason}`);
          }
        }

        if (onProgress) {
          onProgress(Math.min(i + batchSize, items.length), items.length);
        }
      }

      return results;
    };
  }
}