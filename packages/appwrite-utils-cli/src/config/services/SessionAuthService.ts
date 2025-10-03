import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { MessageFormatter } from "../../shared/messageFormatter.js";
import { logger } from "../../shared/logging.js";

/**
 * Session preferences stored in ~/.appwrite/prefs.json
 */
export interface AppwriteSessionPrefs {
  [projectId: string]: {
    endpoint: string;
    email: string;
    cookie: string;
    expiresAt?: string;
  };
}

/**
 * Session authentication information for a specific endpoint and project
 */
export interface SessionAuthInfo {
  endpoint: string;
  projectId: string;
  email?: string;
  cookie: string;
  expiresAt?: string;
}

/**
 * Authentication status information
 */
export interface AuthenticationStatus {
  hasValidSession: boolean;
  hasApiKey: boolean;
  sessionExists: boolean;
  endpointMatches: boolean;
  cookieValid: boolean;
  sessionInfo?: SessionAuthInfo;
  message: string;
  authMethod?: "session" | "apikey" | "none";
}

/**
 * Internal cache structure for session preferences
 */
interface SessionCache {
  data: AppwriteSessionPrefs | null;
  mtime: number;
  contentHash: string;
  timestamp: number;
}

/**
 * Service for managing Appwrite CLI session authentication with intelligent caching
 *
 * This service provides centralized session management with minimal file I/O through
 * a multi-layered caching strategy:
 * - Time-based cache (5 minute TTL)
 * - File modification time validation
 * - Content hash validation
 *
 * @example
 * ```typescript
 * const sessionService = new SessionAuthService();
 * const session = await sessionService.findSession("https://cloud.appwrite.io/v1", "my-project-id");
 *
 * if (session && sessionService.isValidSession(session)) {
 *   // Use session for authentication
 *   console.log(`Authenticated as ${session.email}`);
 * }
 * ```
 */
export class SessionAuthService {
  private cache: SessionCache | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly PREFS_PATH: string;

  /**
   * Creates a new SessionAuthService instance
   *
   * @param prefsPath - Optional custom path to prefs.json (defaults to ~/.appwrite/prefs.json)
   */
  constructor(prefsPath?: string) {
    this.PREFS_PATH = prefsPath || join(homedir(), ".appwrite", "prefs.json");
  }

  /**
   * Load session preferences from ~/.appwrite/prefs.json with intelligent caching
   *
   * Caching Strategy:
   * 1. Return cached data if TTL has not expired
   * 2. Validate file modification time - reload if changed
   * 3. Validate content hash - reload if content changed
   * 4. Cache is automatically invalidated after 5 minutes
   *
   * @returns Session preferences object or null if file doesn't exist or is invalid
   *
   * @example
   * ```typescript
   * const prefs = await sessionService.loadSessionPrefs();
   * if (prefs) {
   *   console.log(`Found ${Object.keys(prefs).length} stored sessions`);
   * }
   * ```
   */
  public async loadSessionPrefs(): Promise<AppwriteSessionPrefs | null> {
    try {
      // Check if file exists
      if (!existsSync(this.PREFS_PATH)) {
        logger.debug("Session prefs file does not exist", { path: this.PREFS_PATH });
        return null;
      }

      // Get current file stats
      const stats = statSync(this.PREFS_PATH);
      const currentMtime = stats.mtimeMs;
      const now = Date.now();

      // Check if cache is valid
      if (this.cache) {
        const cacheAge = now - this.cache.timestamp;
        const mtimeMatches = this.cache.mtime === currentMtime;
        const cacheNotExpired = cacheAge < this.CACHE_TTL;

        // If cache is still valid (not expired, mtime unchanged)
        if (cacheNotExpired && mtimeMatches) {
          logger.debug("Using cached session prefs (valid cache)", {
            cacheAge: `${Math.round(cacheAge / 1000)}s`,
            ttl: `${this.CACHE_TTL / 1000}s`
          });
          return this.cache.data;
        }

        // If TTL expired or mtime changed, we need to validate content
        if (!cacheNotExpired) {
          logger.debug("Session cache TTL expired, revalidating", {
            cacheAge: `${Math.round(cacheAge / 1000)}s`
          });
        } else if (!mtimeMatches) {
          logger.debug("Session file modified, revalidating", {
            oldMtime: this.cache.mtime,
            newMtime: currentMtime
          });
        }
      }

      // Read and parse file
      const prefsContent = readFileSync(this.PREFS_PATH, "utf-8");
      const contentHash = this.hashContent(prefsContent);

      // Check if content actually changed (even if mtime changed)
      if (this.cache && this.cache.contentHash === contentHash) {
        logger.debug("Session file content unchanged, updating cache timestamp");
        this.cache.timestamp = now;
        this.cache.mtime = currentMtime;
        return this.cache.data;
      }

      // Parse new content
      const prefs = JSON.parse(prefsContent) as AppwriteSessionPrefs;

      // Update cache
      this.cache = {
        data: prefs,
        mtime: currentMtime,
        contentHash,
        timestamp: now
      };

      logger.debug("Session prefs loaded and cached", {
        projectCount: Object.keys(prefs).length,
        path: this.PREFS_PATH
      });

      return prefs;
    } catch (error) {
      MessageFormatter.warning(
        "Failed to load Appwrite session preferences",
        { prefix: "Session" }
      );
      logger.error("Error loading session prefs", {
        error: error instanceof Error ? error.message : String(error),
        path: this.PREFS_PATH
      });
      return null;
    }
  }

  /**
   * Find session authentication info for a specific endpoint and project
   *
   * This method searches the session preferences for a matching endpoint and project ID.
   * Both endpoint and projectId must match for a session to be returned.
   *
   * @param endpoint - Appwrite endpoint URL (e.g., "https://cloud.appwrite.io/v1")
   * @param projectId - Appwrite project ID
   * @returns Session info or null if no matching session found
   *
   * @example
   * ```typescript
   * const session = await sessionService.findSession(
   *   "https://cloud.appwrite.io/v1",
   *   "my-project-id"
   * );
   *
   * if (session) {
   *   console.log(`Using session for ${session.email}`);
   * }
   * ```
   */
  public async findSession(
    endpoint: string,
    projectId: string
  ): Promise<SessionAuthInfo | null> {
    const prefs = await this.loadSessionPrefs();

    if (!prefs || !prefs[projectId]) {
      logger.debug("No session found for project", { projectId });
      return null;
    }

    const sessionData = prefs[projectId];

    // Validate session data structure
    if (!sessionData.endpoint || !sessionData.cookie) {
      MessageFormatter.warning(
        `Invalid session data for project ${projectId}`,
        { prefix: "Session" }
      );
      logger.warn("Invalid session data structure", {
        projectId,
        hasEndpoint: !!sessionData.endpoint,
        hasCookie: !!sessionData.cookie
      });
      return null;
    }

    // Normalize endpoints for comparison (remove trailing slashes, case-insensitive)
    const normalizedSessionEndpoint = this.normalizeEndpoint(sessionData.endpoint);
    const normalizedRequestEndpoint = this.normalizeEndpoint(endpoint);

    if (normalizedSessionEndpoint !== normalizedRequestEndpoint) {
      logger.debug("Session endpoint mismatch", {
        projectId,
        sessionEndpoint: sessionData.endpoint,
        requestedEndpoint: endpoint
      });
      return null;
    }

    // Return session info
    return {
      endpoint: sessionData.endpoint,
      projectId,
      email: sessionData.email,
      cookie: sessionData.cookie,
      expiresAt: sessionData.expiresAt
    };
  }

  /**
   * Validate if a session appears to be valid
   *
   * Performs structural validation of the session:
   * - Cookie format validation (JWT-like structure)
   * - Expiration check (if expiresAt is provided)
   * - Basic cookie integrity checks
   *
   * Note: This does NOT verify the session with the server.
   *
   * @param session - Session info to validate
   * @returns true if session appears valid, false otherwise
   *
   * @example
   * ```typescript
   * const session = await sessionService.findSession(endpoint, projectId);
   * if (session && sessionService.isValidSession(session)) {
   *   // Session is structurally valid
   * }
   * ```
   */
  public isValidSession(session: SessionAuthInfo): boolean {
    if (!session || typeof session !== "object") {
      return false;
    }

    // Validate required fields
    if (!session.cookie || !session.endpoint || !session.projectId) {
      logger.debug("Session missing required fields", {
        hasCookie: !!session.cookie,
        hasEndpoint: !!session.endpoint,
        hasProjectId: !!session.projectId
      });
      return false;
    }

    // Validate cookie format
    if (!this.isValidSessionCookie(session.cookie)) {
      logger.debug("Session cookie failed validation", {
        projectId: session.projectId
      });
      return false;
    }

    // Check expiration if provided
    if (session.expiresAt) {
      const expirationTime = new Date(session.expiresAt).getTime();
      const now = Date.now();

      if (expirationTime < now) {
        logger.debug("Session expired", {
          projectId: session.projectId,
          expiresAt: session.expiresAt,
          expiredBy: `${Math.round((now - expirationTime) / 1000)}s`
        });
        return false;
      }
    }

    return true;
  }

  /**
   * Get detailed authentication status for a given endpoint and project
   *
   * Provides comprehensive authentication status including:
   * - Session validation
   * - API key presence
   * - Detailed diagnostic information
   * - Actionable error messages
   *
   * @param endpoint - Appwrite endpoint URL
   * @param projectId - Appwrite project ID
   * @param apiKey - Optional API key for authentication
   * @param session - Optional pre-loaded session (avoids re-loading)
   * @returns Detailed authentication status
   *
   * @example
   * ```typescript
   * const status = await sessionService.getAuthenticationStatus(
   *   "https://cloud.appwrite.io/v1",
   *   "my-project-id",
   *   process.env.APPWRITE_API_KEY
   * );
   *
   * console.log(status.message);
   * if (status.hasValidSession) {
   *   console.log(`Authenticated as ${status.sessionInfo?.email}`);
   * } else if (status.hasApiKey) {
   *   console.log("Using API key authentication");
   * }
   * ```
   */
  public async getAuthenticationStatus(
    endpoint: string,
    projectId: string,
    apiKey?: string,
    session?: SessionAuthInfo | null
  ): Promise<AuthenticationStatus> {
    // Load session if not provided
    const sessionInfo = session !== undefined
      ? session
      : await this.findSession(endpoint, projectId);

    // Check API key presence
    const hasApiKey = !!(apiKey && apiKey.trim().length > 0);

    // If no session exists
    if (!sessionInfo) {
      if (hasApiKey) {
        return {
          hasValidSession: false,
          hasApiKey: true,
          sessionExists: false,
          endpointMatches: false,
          cookieValid: false,
          message: "Using API key authentication (no session found)",
          authMethod: "apikey"
        };
      }

      return {
        hasValidSession: false,
        hasApiKey: false,
        sessionExists: false,
        endpointMatches: false,
        cookieValid: false,
        message: `No authentication found for project ${projectId}. Run 'appwrite login' or provide an API key.`,
        authMethod: "none"
      };
    }

    // Validate session
    const endpointMatches = this.normalizeEndpoint(sessionInfo.endpoint) === this.normalizeEndpoint(endpoint);
    const cookieValid = this.isValidSessionCookie(sessionInfo.cookie);
    const hasValidSession = endpointMatches && cookieValid;

    // Generate status message
    let message = "";
    let authMethod: "session" | "apikey" | "none" = "none";

    if (!endpointMatches) {
      message = `Session endpoint mismatch. Config: ${endpoint}, Session: ${sessionInfo.endpoint}`;
      authMethod = hasApiKey ? "apikey" : "none";
    } else if (!cookieValid) {
      message = `Session cookie is invalid or expired for project ${projectId}`;
      authMethod = hasApiKey ? "apikey" : "none";
    } else {
      message = `Valid session found for ${sessionInfo.email || "unknown user"}`;
      authMethod = "session";
    }

    return {
      hasValidSession,
      hasApiKey,
      sessionExists: true,
      endpointMatches,
      cookieValid,
      sessionInfo,
      message,
      authMethod
    };
  }

  /**
   * Manually invalidate the cache
   *
   * Forces the next loadSessionPrefs() call to read from disk.
   * Useful after external changes to prefs.json (e.g., after login/logout).
   *
   * @example
   * ```typescript
   * // After user logs in
   * sessionService.invalidateCache();
   * const newSession = await sessionService.loadSessionPrefs();
   * ```
   */
  public invalidateCache(): void {
    logger.debug("Session cache manually invalidated");
    this.cache = null;
  }

  /**
   * Normalize an endpoint URL for comparison
   *
   * @param url - Endpoint URL to normalize
   * @returns Normalized URL (lowercase, no trailing slashes)
   */
  private normalizeEndpoint(url: string): string {
    return url.replace(/\/+$/, "").toLowerCase();
  }

  /**
   * Validate session cookie format
   *
   * Performs basic validation to check if a cookie appears to be a valid Appwrite session:
   * - Minimum length check
   * - JWT-like structure (contains dots)
   * - Valid character set
   * - Multi-part structure
   *
   * @param cookie - Cookie string to validate
   * @returns true if cookie appears valid, false otherwise
   */
  private isValidSessionCookie(cookie: string): boolean {
    if (!cookie || typeof cookie !== "string") {
      return false;
    }

    // Trim whitespace
    cookie = cookie.trim();

    // Basic length check
    if (cookie.length < 10) {
      return false;
    }

    // Basic validation - Appwrite session cookies are typically JWT-like
    // They should contain dots and be reasonably long
    if (!cookie.includes(".")) {
      return false;
    }

    // Check for obviously expired or malformed tokens
    // JWT tokens typically have 3 parts separated by dots
    const parts = cookie.split(".");
    if (parts.length < 2) {
      return false;
    }

    // Additional validation - ensure it's not obviously corrupted
    // Should contain alphanumeric characters and common JWT characters
    const validChars = /^[A-Za-z0-9._-]+$/;
    if (!validChars.test(cookie)) {
      return false;
    }

    return true;
  }

  /**
   * Generate MD5 hash of content for cache validation
   *
   * @param content - Content to hash
   * @returns MD5 hash as hex string
   */
  private hashContent(content: string): string {
    return createHash("md5").update(content).digest("hex");
  }

  /**
   * Get all available sessions from prefs
   *
   * Returns all sessions stored in the preferences file that pass
   * basic validation checks.
   *
   * @returns Array of valid session info objects
   *
   * @example
   * ```typescript
   * const sessions = await sessionService.getAvailableSessions();
   * console.log(`Found ${sessions.length} available sessions`);
   * sessions.forEach(s => console.log(`  - ${s.projectId} (${s.email})`));
   * ```
   */
  public async getAvailableSessions(): Promise<SessionAuthInfo[]> {
    const prefs = await this.loadSessionPrefs();

    if (!prefs) {
      return [];
    }

    const sessions: SessionAuthInfo[] = [];

    for (const [projectId, sessionData] of Object.entries(prefs)) {
      if (
        sessionData.endpoint &&
        sessionData.cookie &&
        this.isValidSessionCookie(sessionData.cookie)
      ) {
        sessions.push({
          projectId,
          endpoint: sessionData.endpoint,
          cookie: sessionData.cookie,
          email: sessionData.email,
          expiresAt: sessionData.expiresAt
        });
      }
    }

    logger.debug(`Found ${sessions.length} available sessions`);
    return sessions;
  }

  /**
   * Get the path to the prefs.json file
   *
   * @returns Absolute path to prefs.json
   */
  public getPrefsPath(): string {
    return this.PREFS_PATH;
  }
}
