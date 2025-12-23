import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { MessageFormatter } from "../shared/messageFormatter.js";

/**
 * Normalizes an endpoint URL by removing trailing slashes and converting to lowercase
 */
function normalizeEndpoint(url: string): string {
  return url.replace(/\/+$/, "").toLowerCase();
}

export interface AppwriteSessionPrefs {
  [projectId: string]: {
    endpoint: string;
    email: string;
    cookie: string;
  };
}

export interface SessionAuthInfo {
  projectId: string;
  endpoint: string;
  sessionCookie: string;
  email?: string;
}

/**
 * Load session preferences from ~/.appwrite/prefs.json
 */
export function loadSessionPrefs(): AppwriteSessionPrefs | null {
  try {
    const prefsPath = join(homedir(), ".appwrite", "prefs.json");

    if (!existsSync(prefsPath)) {
      return null;
    }

    const prefsContent = readFileSync(prefsPath, "utf-8");
    const prefs = JSON.parse(prefsContent) as AppwriteSessionPrefs;

    return prefs;
  } catch (error) {
    MessageFormatter.warning(
      "Failed to load Appwrite session preferences",
      { prefix: "Session" }
    );
    return null;
  }
}

/**
 * Get session authentication info for a specific project
 */
export function getSessionAuth(projectId: string): SessionAuthInfo | null {
  const prefs = loadSessionPrefs();

  if (!prefs || !prefs[projectId]) {
    return null;
  }

  const sessionData = prefs[projectId];

  // Validate session data structure
  if (!sessionData.endpoint || !sessionData.cookie) {
    MessageFormatter.warning(
      `Invalid session data for project ${projectId}`,
      { prefix: "Session" }
    );
    return null;
  }

  return {
    projectId,
    endpoint: sessionData.endpoint,
    sessionCookie: sessionData.cookie,
    email: sessionData.email,
  };
}

/**
 * Check if a session cookie appears to be valid (enhanced validation)
 */
export function isValidSessionCookie(cookie: string): boolean {
  if (!cookie || typeof cookie !== "string") {
    return false;
  }

  cookie = cookie.trim();
  if (cookie.length < 10) {
    return false;
  }

  // Accept Appwrite session cookies in any format:
  // - Full: "a_session_console=eyJ...}; expires=..."
  // - Value only: "eyJ..."
  if (cookie.includes('a_session') || cookie.startsWith('eyJ')) {
    return true;
  }

  return false;
}

/**
 * Get all available sessions from prefs
 *
 * @deprecated Use SessionAuthService.getAvailableSessions() instead.
 * This function is synchronous and doesn't support caching or async validation.
 * The SessionAuthService provides better performance and more reliable session management.
 *
 * @example
 * ```typescript
 * // Old (deprecated):
 * const sessions = getAvailableSessions();
 *
 * // New (preferred):
 * const sessionService = new SessionAuthService();
 * const sessions = await sessionService.getAvailableSessions();
 * ```
 */
export function getAvailableSessions(): SessionAuthInfo[] {
  const prefs = loadSessionPrefs();

  if (!prefs) {
    return [];
  }

  const sessions: SessionAuthInfo[] = [];

  for (const [projectId, sessionData] of Object.entries(prefs)) {
    if (sessionData.endpoint && sessionData.cookie && isValidSessionCookie(sessionData.cookie)) {
      sessions.push({
        projectId,
        endpoint: sessionData.endpoint,
        sessionCookie: sessionData.cookie,
        email: sessionData.email,
      });
    }
  }

  return sessions;
}

/**
 * Find session by endpoint and project combination
 *
 * @deprecated Use SessionAuthService.findSession() instead.
 * This function is synchronous and doesn't support caching.
 * The SessionAuthService provides better performance with async caching.
 *
 * @example
 * ```typescript
 * // Old (deprecated):
 * const session = findSessionByEndpointAndProject(endpoint, projectId);
 *
 * // New (preferred):
 * const sessionService = new SessionAuthService();
 * const session = await sessionService.findSession(endpoint, projectId);
 * ```
 */
export function findSessionByEndpointAndProject(
  endpoint: string,
  projectId: string
): SessionAuthInfo | null {
  const sessionAuth = getSessionAuth(projectId);

  if (!sessionAuth) {
    MessageFormatter.debug(
      `No session found for project ${projectId}`,
      { prefix: "Session" }
    );
    return null;
  }

  // Normalize endpoints for comparison (remove trailing slashes, etc.)
  if (normalizeEndpoint(sessionAuth.endpoint) !== normalizeEndpoint(endpoint)) {
    MessageFormatter.warning(
      `Session endpoint mismatch for project ${projectId}:\n` +
      `  Session endpoint: ${sessionAuth.endpoint}\n` +
      `  Config endpoint:  ${endpoint}\n` +
      `  Tip: Run 'appwrite login' to update session for this endpoint`,
      { prefix: "Session" }
    );
    return null;
  }

  return sessionAuth;
}

/**
 * Check if session authentication is available for a project configuration
 *
 * @deprecated Use SessionAuthService.findSession() and isValidSession() instead.
 * This function is synchronous and doesn't support caching.
 * The SessionAuthService provides better performance with async caching and more comprehensive validation.
 *
 * @example
 * ```typescript
 * // Old (deprecated):
 * const hasAuth = hasSessionAuth(endpoint, projectId);
 *
 * // New (preferred):
 * const sessionService = new SessionAuthService();
 * const session = await sessionService.findSession(endpoint, projectId);
 * const hasAuth = session !== null && sessionService.isValidSession(session);
 * ```
 */
export function hasSessionAuth(endpoint: string, projectId: string): boolean {
  const sessionAuth = findSessionByEndpointAndProject(endpoint, projectId);
  return sessionAuth !== null && isValidSessionCookie(sessionAuth.sessionCookie);
}

/**
 * Get detailed authentication status for debugging and error reporting
 *
 * @deprecated Use SessionAuthService.getAuthenticationStatus() instead.
 * This function is synchronous and doesn't support caching.
 * The SessionAuthService provides better performance with async caching and more detailed status information.
 *
 * @example
 * ```typescript
 * // Old (deprecated):
 * const status = getAuthenticationStatus(endpoint, projectId);
 *
 * // New (preferred):
 * const sessionService = new SessionAuthService();
 * const status = await sessionService.getAuthenticationStatus(endpoint, projectId);
 * ```
 */
export function getAuthenticationStatus(endpoint: string, projectId: string): {
  hasValidSession: boolean;
  sessionExists: boolean;
  endpointMatches: boolean;
  cookieValid: boolean;
  sessionInfo?: SessionAuthInfo;
  message: string;
} {
  const sessionAuth = getSessionAuth(projectId);

  if (!sessionAuth) {
    return {
      hasValidSession: false,
      sessionExists: false,
      endpointMatches: false,
      cookieValid: false,
      message: `No session found for project ${projectId}. Run 'appwrite login' to authenticate.`
    };
  }

  const endpointMatches = normalizeEndpoint(sessionAuth.endpoint) === normalizeEndpoint(endpoint);
  const cookieValid = isValidSessionCookie(sessionAuth.sessionCookie);
  const hasValidSession = endpointMatches && cookieValid;

  let message = "";
  if (!endpointMatches) {
    message = `Session endpoint mismatch. Expected: ${endpoint}, Found: ${sessionAuth.endpoint}`;
  } else if (!cookieValid) {
    message = `Session cookie is invalid or expired for project ${projectId}`;
  } else {
    message = `Valid session found for ${sessionAuth.email || 'unknown user'}`;
  }

  return {
    hasValidSession,
    sessionExists: true,
    endpointMatches,
    cookieValid,
    sessionInfo: sessionAuth,
    message
  };
}
