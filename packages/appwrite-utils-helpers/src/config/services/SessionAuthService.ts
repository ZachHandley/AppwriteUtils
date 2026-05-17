import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { MessageFormatter } from "../../shared/messageFormatter.js";
import { logger } from "../../shared/logging.js";
import { isValidSessionCookie as isValidSessionCookieShared } from "../../clients/sessionAuth.js";
import { fetchServerVersion, isVersionAtLeast } from "../../utils/versionDetection.js";

/**
 * Session preferences stored in ~/.appwrite/prefs.json.
 *
 * Note: the file also stores a top-level `current` field (string projectId pointer)
 * which is NOT modeled here to keep the index signature clean; see
 * {@link SessionAuthService.findCurrentSession} for the helper that reads it.
 *
 * Entries may carry an API `key` instead of (or in addition to) a session
 * `cookie` — that's what the Appwrite CLI writes after `appwrite login --key`.
 */
export interface AppwriteSessionPrefs {
  [projectId: string]: {
    endpoint: string;
    email: string;
    cookie: string;
    key?: string;
    expiresAt?: string;
  };
}

/**
 * Resolved "current" CLI session — what `~/.appwrite/prefs.json`'s `current`
 * pointer dereferences to. Carries either an apiKey or a sessionCookie (or both).
 */
export interface CurrentSessionInfo {
  projectId: string;
  endpoint: string;
  apiKey?: string;
  sessionCookie?: string;
  email?: string;
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
   * Resolve the "currently selected" CLI project from `~/.appwrite/prefs.json`'s
   * top-level `current` pointer. This is what `appwrite use <project>` sets, and
   * lets MCP/SDK consumers auto-authenticate as whatever project the user last
   * touched via the CLI — no flags required.
   *
   * Unlike {@link findSession}, this does NOT require the caller to know the
   * endpoint or projectId up-front, and it handles both `key` (API key) and
   * `cookie` (session) entries. Returns null when `current` is unset, points at
   * a missing entry, or the entry has neither usable auth credential.
   *
   * No live probing — stale endpoints surface as a 401 on first API call.
   */
  public async findCurrentSession(): Promise<CurrentSessionInfo | null> {
    const prefs = await this.loadSessionPrefs();
    if (!prefs) return null;

    // `current` is a top-level sibling of the project entries, not modeled in
    // AppwriteSessionPrefs (which is a pure index signature). Read tolerantly.
    const root = prefs as unknown as { current?: unknown };
    const currentId = typeof root.current === "string" ? root.current : "";
    if (!currentId) return null;

    const rawEntry = (prefs as Record<string, unknown>)[currentId];
    if (!rawEntry || typeof rawEntry !== "object") return null;

    const entry = rawEntry as {
      endpoint?: unknown;
      email?: unknown;
      cookie?: unknown;
      key?: unknown;
    };

    if (typeof entry.endpoint !== "string" || !entry.endpoint) return null;

    const apiKey = typeof entry.key === "string" && entry.key ? entry.key : undefined;
    const sessionCookie =
      typeof entry.cookie === "string" && entry.cookie ? entry.cookie : undefined;

    // Need at least one usable auth credential
    if (!apiKey && !sessionCookie) return null;

    return {
      projectId: currentId,
      endpoint: entry.endpoint,
      apiKey,
      sessionCookie,
      email: typeof entry.email === "string" ? entry.email : undefined,
    };
  }

  /**
   * Look up the prefs.json entry for a specific projectId, regardless of auth
   * method (cookie OR key) and regardless of endpoint match. Use this when
   * the projectId is authoritative and you want whatever auth/endpoint is
   * stored for it.
   *
   * Differs from {@link findSession} (which is cookie-only AND requires an
   * endpoint match) and {@link findAuthForEndpoint} (which scans by endpoint).
   */
  public async findEntryForProject(
    projectId: string
  ): Promise<{
    projectId: string;
    endpoint: string;
    apiKey?: string;
    sessionCookie?: string;
    email?: string;
  } | null> {
    const prefs = await this.loadSessionPrefs();
    if (!prefs) return null;

    const rawEntry = (prefs as Record<string, unknown>)[projectId];
    if (!rawEntry || typeof rawEntry !== "object") return null;

    const entry = rawEntry as {
      endpoint?: unknown;
      email?: unknown;
      cookie?: unknown;
      key?: unknown;
    };

    if (typeof entry.endpoint !== "string" || !entry.endpoint) return null;

    const apiKey = typeof entry.key === "string" && entry.key ? entry.key : undefined;
    const sessionCookie =
      typeof entry.cookie === "string" && entry.cookie ? entry.cookie : undefined;

    if (!apiKey && !sessionCookie) return null;

    return {
      projectId,
      endpoint: entry.endpoint,
      apiKey,
      sessionCookie,
      email: typeof entry.email === "string" ? entry.email : undefined,
    };
  }

  /**
   * Find an authentication entry by endpoint match only — covers the case of
   * "one cookie/key shared across N projects on the same endpoint" (e.g. a
   * single console login to appwrite.example.com that has access to a dozen
   * projects). Returns the first prefs entry whose `endpoint` matches and has
   * a usable cookie or key.
   *
   * Use this when you know the target project's endpoint and projectId, but
   * `prefs[projectId]` itself isn't populated (because the login was performed
   * under a sibling project's ID).
   */
  public async findAuthForEndpoint(
    endpoint: string
  ): Promise<{
    endpoint: string;
    apiKey?: string;
    sessionCookie?: string;
    sourceProjectId: string;
  } | null> {
    const prefs = await this.loadSessionPrefs();
    if (!prefs) return null;

    const normalizedTarget = this.normalizeEndpoint(endpoint);

    for (const [pid, raw] of Object.entries(prefs)) {
      if (pid === "current") continue;
      if (!raw || typeof raw !== "object") continue;

      const entry = raw as {
        endpoint?: unknown;
        cookie?: unknown;
        key?: unknown;
      };

      if (typeof entry.endpoint !== "string" || !entry.endpoint) continue;
      if (this.normalizeEndpoint(entry.endpoint) !== normalizedTarget) continue;

      const apiKey = typeof entry.key === "string" && entry.key ? entry.key : undefined;
      const sessionCookie =
        typeof entry.cookie === "string" && entry.cookie ? entry.cookie : undefined;

      if (!apiKey && !sessionCookie) continue;

      return {
        endpoint: entry.endpoint,
        apiKey,
        sessionCookie,
        sourceProjectId: pid,
      };
    }

    return null;
  }

  /**
   * Find session authentication info for a specific endpoint and project
   *
   * This method searches the session preferences for a matching endpoint and project ID.
   * It uses a two-phase matching strategy:
   * 1. First attempts exact projectId match
   * 2. Falls back to endpoint-based matching (since Appwrite sessions are per-endpoint)
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

    if (!prefs) {
      logger.debug("No session preferences file found");
      return null;
    }

    const normalizedRequestEndpoint = this.normalizeEndpoint(endpoint);

    // Phase 1: Try exact projectId match
    if (prefs[projectId]) {
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
      } else {
        // Normalize endpoints for comparison (remove trailing slashes, case-insensitive)
        const normalizedSessionEndpoint = this.normalizeEndpoint(sessionData.endpoint);

        if (normalizedSessionEndpoint === normalizedRequestEndpoint) {
          // Exact match found
          logger.debug("Found session via exact projectId match", { projectId });
          return {
            endpoint: sessionData.endpoint,
            projectId,
            email: sessionData.email,
            cookie: sessionData.cookie,
            expiresAt: sessionData.expiresAt
          };
        }

        logger.debug("Session endpoint mismatch for projectId", {
          projectId,
          sessionEndpoint: sessionData.endpoint,
          requestedEndpoint: endpoint
        });
      }
    }

    // Phase 2: Fall back to endpoint-based matching
    // Appwrite sessions are per-endpoint, not per-project
    // If user is logged into an endpoint, they can access ANY project on that endpoint
    logger.debug("Attempting endpoint-based session fallback", {
      requestedProjectId: projectId,
      requestedEndpoint: endpoint
    });

    const workingSessionResult = await this.findWorkingSession(endpoint, projectId);
    if (workingSessionResult) {
      MessageFormatter.info(
        `Using session from project '${workingSessionResult.prefsKey}' for endpoint-based authentication`,
        { prefix: "Session" }
      );
      return workingSessionResult.session;
    }

    logger.debug("No session found for project or endpoint", {
      projectId,
      endpoint
    });
    return null;
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
    return isValidSessionCookieShared(cookie);
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

  /**
   * Find a working session for the given endpoint and target project.
   * Tests each candidate session with a real API call.
   *
   * @param endpoint - Appwrite endpoint URL
   * @param targetProjectId - Target project ID to test against
   * @returns Object with working session and prefs key, or null if none found
   *
   * @example
   * ```typescript
   * const result = await sessionService.findWorkingSession(
   *   "https://cloud.appwrite.io/v1",
   *   "my-project-id"
   * );
   *
   * if (result) {
   *   console.log(`Found working session: ${result.prefsKey}`);
   *   // Cache this prefsKey in config for future runs
   * }
   * ```
   */
  public async findWorkingSession(
    endpoint: string,
    targetProjectId: string
  ): Promise<{
    session: SessionAuthInfo;
    prefsKey: string;
  } | null> {
    const prefs = await this.loadSessionPrefs();
    if (!prefs) {
      logger.debug("No session prefs available for testing", { prefix: "Session" });
      return null;
    }

    let candidates = this.getSessionsForEndpoint(prefs, endpoint);
    if (candidates.length === 0) {
      logger.debug("No endpoint-matched sessions, trying all sessions as cross-endpoint fallback", {
        prefix: "Session",
        endpoint,
        normalizedEndpoint: this.normalizeEndpoint(endpoint)
      });
      // Fallback: try ALL sessions regardless of endpoint (handles custom domains like
      // appwrite.socialaize.com pointing to cloud.appwrite.io)
      candidates = Object.entries(prefs)
        .filter(([key, data]) =>
          key !== 'current' &&
          typeof data === 'object' &&
          data?.endpoint &&
          data?.cookie
        ) as typeof candidates;
    }
    if (candidates.length === 0) {
      return null;
    }

    logger.debug(`Testing ${candidates.length} candidate sessions`, {
      prefix: "Session",
      endpoint,
      targetProjectId
    });

    const serverVersion = await fetchServerVersion(endpoint);
    const useTables = !!(serverVersion && isVersionAtLeast(serverVersion, "1.8.0"));
    logger.debug("Session test using health check version info", {
      prefix: "Session",
      endpoint,
      serverVersion: serverVersion || "unknown",
      useTables
    });

    for (const [prefsKey, sessionData] of candidates) {
      logger.debug(`Testing session for project key: ${prefsKey}`, { prefix: "Session" });

      // Test this session against the target project
      const works = await this.testSession(endpoint, targetProjectId, sessionData.cookie, {
        useTables,
        serverVersion
      });

      if (works) {
        logger.info(`Found working session for project ${targetProjectId}`, {
          prefix: "Session",
          prefsKey,
          email: sessionData.email
        });

        return {
          session: {
            endpoint,
            projectId: targetProjectId,
            cookie: sessionData.cookie,
            email: sessionData.email,
            expiresAt: sessionData.expiresAt
          },
          prefsKey
        };
      }
    }

    logger.debug("No working session found after testing all candidates", {
      prefix: "Session",
      testedCount: candidates.length
    });

    return null;
  }

  /**
   * Live-probe credentials against an Appwrite endpoint to verify they
   * authenticate. Use this before trusting creds derived from a config file
   * or prefs.json — placeholder API keys (e.g. `SET_IF_NEEDED`) and revoked
   * keys / expired cookies still LOOK valid statically but fail at the wire.
   *
   * Tri-state result:
   *  - `"valid"` — call succeeded.
   *  - `"valid-but-narrow-scope"` — Appwrite recognized the credential but
   *    the test endpoint required a scope the credential doesn't have. The
   *    credential is real and should be kept; the actual tool call may still
   *    succeed if it uses scopes the credential does have.
   *  - `"invalid-auth"` — Appwrite did NOT recognize the credential and
   *    treated the request as anonymous (`User (role: guests)` in the error).
   *    Caller should drop this credential and fall through to the next tier.
   *  - `"unreachable"` — network/DNS/timeout failure. Caller should NOT drop
   *    the credential — the wire issue is transient and unrelated to auth.
   *
   * Probes against `tables.list({queries:[Query.limit(1)]})` on Appwrite ≥1.8,
   * `databases.list(...)` otherwise. Either requires `tables.read`/`databases.read`,
   * which the user's API keys typically have for any meaningful project — but
   * the narrow-scope branch handles the case where they don't.
   */
  public async probeCredentials(input: {
    endpoint: string;
    projectId: string;
    apiKey?: string;
    sessionCookie?: string;
  }): Promise<"valid" | "valid-but-narrow-scope" | "invalid-auth" | "unreachable"> {
    if (!input.apiKey && !input.sessionCookie) return "invalid-auth";

    try {
      const { Client, Databases, TablesDB, Query } = await import("node-appwrite");

      const client = new Client()
        .setEndpoint(input.endpoint)
        .setProject(input.projectId);

      if (input.sessionCookie) {
        // Same wire shape ClientFactory uses — set raw Cookie header + admin mode.
        client.headers["cookie"] = input.sessionCookie;
        client.headers["X-Appwrite-Mode"] = "admin";
      } else if (input.apiKey) {
        client.setKey(input.apiKey);
        client.headers["X-Appwrite-Mode"] = "default";
      }

      const serverVersion = await fetchServerVersion(input.endpoint);
      const useTables = !!(serverVersion && isVersionAtLeast(serverVersion, "1.8.0"));

      if (useTables) {
        const tables = new TablesDB(client);
        await tables.list({ queries: [Query.limit(1)] });
      } else {
        const databases = new Databases(client);
        await databases.list({ queries: [Query.limit(1)] });
      }

      return "valid";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = (error as { code?: unknown }).code;

      // Appwrite returns 401 with message like:
      //   "User (role: guests) missing scopes (["tables.read"])"
      // for unrecognized API keys / invalid cookies — the role: guests marker
      // means auth was NOT applied. Distinguish from a recognized cred that
      // just lacks scope for THIS specific call.
      const looksLikeGuestRole = /role:\s*guests?/i.test(message);
      const looksLikeScopeError = /missing\s+scopes?/i.test(message);

      if (looksLikeGuestRole) {
        return "invalid-auth";
      }
      if (looksLikeScopeError) {
        // Recognized cred, just narrow scope — keep it.
        return "valid-but-narrow-scope";
      }

      // Other 401/403 → treat as invalid auth.
      if (code === 401 || code === 403 || code === "401" || code === "403") {
        return "invalid-auth";
      }

      // Network / DNS / timeout / 5xx → unreachable. Don't drop the cred.
      return "unreachable";
    }
  }

  /**
   * Test an explicit session cookie against a project/endpoint
   *
   * @param endpoint - Appwrite endpoint URL
   * @param projectId - Project ID to test against
   * @param cookie - Session cookie to test
   * @returns True if the session works, false otherwise
   */
  public async isSessionWorking(
    endpoint: string,
    projectId: string,
    cookie: string
  ): Promise<boolean> {
    if (!cookie || typeof cookie !== "string") {
      return false;
    }

    const serverVersion = await fetchServerVersion(endpoint);
    const useTables = !!(serverVersion && isVersionAtLeast(serverVersion, "1.8.0"));

    return await this.testSession(endpoint, projectId, cookie, {
      useTables,
      serverVersion
    });
  }

  /**
   * Get all sessions matching an endpoint
   *
   * @param prefs - Session preferences object
   * @param endpoint - Endpoint to match
   * @returns Array of tuples [prefsKey, sessionData]
   */
  private getSessionsForEndpoint(
    prefs: Record<string, any>,
    endpoint: string
  ): [string, { endpoint: string; cookie: string; email?: string; expiresAt?: string }][] {
    const normalizedEndpoint = this.normalizeEndpoint(endpoint);

    return Object.entries(prefs)
      .filter(([key, data]) =>
        key !== 'current' &&
        typeof data === 'object' &&
        data?.endpoint &&
        data?.cookie &&
        this.normalizeEndpoint(data.endpoint) === normalizedEndpoint
      ) as [string, { endpoint: string; cookie: string; email?: string; expiresAt?: string }][];
  }

  /**
   * Test if a session cookie works for a given endpoint/project
   *
   * @param endpoint - Appwrite endpoint URL
   * @param projectId - Project ID to test against
   * @param cookie - Session cookie to test
   * @returns True if session works, false otherwise
   */
  private async testSession(
    endpoint: string,
    projectId: string,
    cookie: string,
    options: { useTables?: boolean; serverVersion?: string | null } = {}
  ): Promise<boolean> {
    try {
      const { Client, Databases, TablesDB, Query } = await import('node-appwrite');

      const client = new Client()
        .setEndpoint(endpoint)
        .setProject(projectId);

      // Set cookie header directly - cookie is in full HTTP cookie format
      client.headers['cookie'] = cookie;
      // Set admin mode header for session testing
      client.headers['X-Appwrite-Mode'] = 'admin';

      let useTables = options.useTables;
      if (useTables === undefined) {
        const version = options.serverVersion ?? await fetchServerVersion(endpoint);
        useTables = !!(version && isVersionAtLeast(version, "1.8.0"));
      }

      if (useTables) {
        const tables = new TablesDB(client);
        await tables.list({ queries: [Query.limit(1)] });
      } else {
        const databases = new Databases(client);
        await databases.list({ queries: [Query.limit(1)] });
      }

      logger.debug("Session test successful", {
        prefix: "Session",
        endpoint,
        projectId
      });

      return true;
    } catch (error) {
      logger.debug("Session test failed", {
        prefix: "Session",
        endpoint,
        projectId,
        error: error instanceof Error ? error.message : String(error)
      });

      return false;
    }
  }
}
