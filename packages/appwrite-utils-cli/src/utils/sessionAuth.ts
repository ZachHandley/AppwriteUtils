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
  const parts = cookie.split('.');
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
 * Get all available sessions from prefs
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
 */
export function hasSessionAuth(endpoint: string, projectId: string): boolean {
  const sessionAuth = findSessionByEndpointAndProject(endpoint, projectId);
  return sessionAuth !== null && isValidSessionCookie(sessionAuth.sessionCookie);
}

/**
 * Get detailed authentication status for debugging and error reporting
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