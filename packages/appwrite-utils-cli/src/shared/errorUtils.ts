/**
 * Shared error handling utilities for consistent error processing
 */

/**
 * Extracts error message from unknown error type
 * @param error - Error of unknown type
 * @returns String error message
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Normalizes unknown error to Error instance
 * @param error - Error of unknown type
 * @returns Normalized Error object
 */
export function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Checks if error is a conflict error (409)
 * @param error - Error object to check
 * @returns True if error is a conflict (duplicate resource)
 */
export function isConflictError(error: any): boolean {
  return error?.code === 409 || (error?.message?.toLowerCase().includes('already exists') ?? false);
}

/**
 * Checks if error is a Cloudflare error (522)
 * @param error - Error object to check
 * @returns True if error is from Cloudflare connection timeout
 */
export function isCloudflareError(error: any): boolean {
  return error?.code === 522 || error?.code === "522";
}

/**
 * Checks if error is authentication/authorization related
 * @param error - Error object to check
 * @returns True if error is auth-related (401, 403)
 */
export function isAuthError(error: any): boolean {
  const code = error?.code;
  return code === 401 || code === 403 || code === "401" || code === "403";
}

/**
 * Error categorization helpers for smart fallback logic
 */

/**
 * Checks if an error is retryable (network issues, rate limits, etc.)
 * @param errorMessage - Error message to check
 * @returns True if error is retryable
 */
export function isRetryableError(errorMessage: string): boolean {
  const retryableErrors = [
    "rate limit",
    "timeout",
    "network",
    "temporary",
    "503",
    "502",
    "429"
  ];
  return retryableErrors.some(error =>
    errorMessage.toLowerCase().includes(error)
  );
}

/**
 * Checks if an error indicates bulk operations are not supported
 * @param errorMessage - Error message to check
 * @returns True if bulk operations not supported
 */
export function isBulkNotSupportedError(errorMessage: string): boolean {
  const notSupportedErrors = [
    "method not found",
    "not implemented",
    "unsupported",
    "not available",
    "404"
  ];
  return notSupportedErrors.some(error =>
    errorMessage.toLowerCase().includes(error)
  );
}

/**
 * Checks if an error is critical (authentication, authorization, permissions)
 * @param errorMessage - Error message to check
 * @returns True if error is critical
 */
export function isCriticalError(errorMessage: string): boolean {
  const criticalErrors = [
    "authentication",
    "authorization",
    "permission",
    "forbidden",
    "401",
    "403"
  ];
  return criticalErrors.some(error =>
    errorMessage.toLowerCase().includes(error)
  );
}
