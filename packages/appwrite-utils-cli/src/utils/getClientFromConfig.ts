import { type AppwriteConfig } from "appwrite-utils";
import { Client } from "node-appwrite";
import { AdapterFactory, type AdapterFactoryResult } from "../adapters/AdapterFactory.js";
import type { DatabaseAdapter } from "../adapters/DatabaseAdapter.js";
import { findSessionByEndpointAndProject, hasSessionAuth, isValidSessionCookie } from "./sessionAuth.js";
import { MessageFormatter } from "../shared/messageFormatter.js";

/**
 * Enhanced client creation from config with session authentication support
 * @deprecated Use getAdapterFromConfig for dual API support with session auth
 */
export const getClientFromConfig = (config: AppwriteConfig, sessionCookie?: string) => {
  let appwriteClient: Client | undefined;
  if (!config.appwriteClient) {
    appwriteClient = getClientWithAuth(
      config.appwriteEndpoint,
      config.appwriteProject,
      config.appwriteKey,
      sessionCookie
    );
    config.appwriteClient = appwriteClient;
  }
  return appwriteClient;
};

/**
 * Enhanced client creation with session authentication support
 * Priority: explicit session > session from prefs > API key
 */
export const getClientWithAuth = (
  endpoint: string,
  project: string,
  key?: string,
  sessionCookie?: string
): Client => {
  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(project);

  const authAttempts: string[] = [];

  // Priority 1: Explicit session cookie provided
  if (sessionCookie) {
    if (isValidSessionCookie(sessionCookie)) {
      client.setSession(sessionCookie);
      MessageFormatter.info(`Using explicit session authentication for project ${project}`, { prefix: "Auth" });
      return client;
    } else {
      authAttempts.push("explicit session cookie (invalid format)");
      MessageFormatter.warning(`Provided session cookie has invalid format`, { prefix: "Auth" });
    }
  }

  // Priority 2: Session from Appwrite CLI prefs
  const sessionAuth = findSessionByEndpointAndProject(endpoint, project);
  if (sessionAuth) {
    if (isValidSessionCookie(sessionAuth.sessionCookie)) {
      client.setSession(sessionAuth.sessionCookie);
      MessageFormatter.info(`Using session authentication for project ${project} (${sessionAuth.email || 'unknown user'})`, { prefix: "Auth" });
      return client;
    } else {
      authAttempts.push("session from CLI prefs (invalid/expired)");
      MessageFormatter.warning(`Session cookie from CLI prefs is invalid or expired`, { prefix: "Auth" });
    }
  }

  // Priority 3: API key fallback
  if (key) {
    if (key.trim() === "") {
      authAttempts.push("API key (empty)");
    } else {
      client.setKey(key);
      MessageFormatter.info(`Using API key authentication for project ${project}`, { prefix: "Auth" });
      return client;
    }
  }

  // Build detailed error message based on attempted methods
  const buildAuthError = (): Error => {
    let errorMessage = `No valid authentication method available for project '${project}'.\n\n`;

    if (authAttempts.length > 0) {
      errorMessage += `Authentication methods attempted:\n`;
      authAttempts.forEach(attempt => {
        errorMessage += `  ✗ ${attempt}\n`;
      });
      errorMessage += `\n`;
    }

    errorMessage += `Available authentication options:\n`;
    errorMessage += `  1. Session Authentication (Recommended):\n`;
    errorMessage += `     Run: appwrite login\n`;
    errorMessage += `     Then select your project and login with your account\n\n`;
    errorMessage += `  2. API Key Authentication:\n`;
    errorMessage += `     - Set appwriteKey in your configuration\n`;
    errorMessage += `     - Or provide via --key command line option\n`;
    errorMessage += `     - Get your API key from: ${endpoint}/console/project-${project}/settings/keys\n\n`;
    errorMessage += `  3. Environment Variables:\n`;
    errorMessage += `     Set APPWRITE_API_KEY environment variable\n\n`;

    errorMessage += `For more help, visit: https://appwrite.io/docs/tooling/command-line/installation`;

    return new Error(errorMessage);
  };

  throw buildAuthError();
};

/**
 * Legacy function - returns basic Client
 * @deprecated Use getClientWithAuth for session support or createDatabaseAdapter for dual API support
 */
export const getClient = (endpoint: string, project: string, key: string) => {
  return getClientWithAuth(endpoint, project, key);
};

/**
 * Modern adapter-based client creation with dual API support and session authentication
 * Returns both adapter and legacy client for compatibility
 */
export const getAdapterFromConfig = async (
  config: AppwriteConfig,
  forceRefresh?: boolean,
  sessionCookie?: string
): Promise<{
  adapter: DatabaseAdapter;
  client: Client;
  apiMode: 'legacy' | 'tablesdb';
}> => {
  // Create enhanced config with session support
  const enhancedConfig = { ...config };

  // Check for session authentication if no explicit session provided
  if (!sessionCookie && !config.appwriteKey) {
    const sessionAuth = findSessionByEndpointAndProject(config.appwriteEndpoint, config.appwriteProject);
    if (sessionAuth && isValidSessionCookie(sessionAuth.sessionCookie)) {
      sessionCookie = sessionAuth.sessionCookie;
    }
  }

  // Override client creation in factory if session auth is available
  if (sessionCookie && isValidSessionCookie(sessionCookie)) {
    enhancedConfig.appwriteClient = getClientWithAuth(
      config.appwriteEndpoint,
      config.appwriteProject,
      config.appwriteKey,
      sessionCookie
    );
  }

  const result = await AdapterFactory.createFromConfig(enhancedConfig, forceRefresh);

  return {
    adapter: result.adapter,
    client: result.client,
    apiMode: result.apiMode
  };
};

/**
 * Create adapter from individual parameters with session authentication support
 */
export const getAdapter = async (
  endpoint: string,
  project: string,
  key?: string,
  apiMode: 'auto' | 'legacy' | 'tablesdb' = 'auto',
  sessionCookie?: string
): Promise<{
  adapter: DatabaseAdapter;
  client: Client;
  apiMode: 'legacy' | 'tablesdb';
}> => {
  // Create config object with session support
  const config: any = {
    appwriteEndpoint: endpoint,
    appwriteProject: project,
    appwriteKey: key || "",
    apiMode
  };

  const authAttempts: string[] = [];

  // Use session auth if available, otherwise fall back to API key
  if (sessionCookie) {
    if (isValidSessionCookie(sessionCookie)) {
      config.appwriteClient = getClientWithAuth(endpoint, project, key, sessionCookie);
    } else {
      authAttempts.push("explicit session cookie (invalid format)");
    }
  } else if (!key) {
    // Try to find session auth if no API key provided
    const sessionAuth = findSessionByEndpointAndProject(endpoint, project);
    if (sessionAuth) {
      if (isValidSessionCookie(sessionAuth.sessionCookie)) {
        config.appwriteClient = getClientWithAuth(endpoint, project, key, sessionAuth.sessionCookie);
      } else {
        authAttempts.push("session from CLI prefs (invalid/expired)");
      }
    } else {
      authAttempts.push("session from CLI prefs (not found)");
    }

    // If no valid authentication found, build detailed error
    if (!config.appwriteClient) {
      const buildDetailedAuthError = (): Error => {
        let errorMessage = `No valid authentication method available for project '${project}'.\n\n`;

        if (authAttempts.length > 0) {
          errorMessage += `Authentication methods attempted:\n`;
          authAttempts.forEach(attempt => {
            errorMessage += `  ✗ ${attempt}\n`;
          });
          errorMessage += `\n`;
        }

        errorMessage += `Available authentication options:\n`;
        errorMessage += `  1. Session Authentication (Recommended):\n`;
        errorMessage += `     Run: appwrite login\n`;
        errorMessage += `     Then select your project and login with your account\n`;
        errorMessage += `     This will save session credentials to ~/.appwrite/prefs.json\n\n`;
        errorMessage += `  2. API Key Authentication:\n`;
        errorMessage += `     - Provide API key via --key command line option\n`;
        errorMessage += `     - Or set appwriteKey in your configuration file\n`;
        errorMessage += `     - Get your API key from: ${endpoint}/console/project-${project}/settings/keys\n\n`;
        errorMessage += `  3. Environment Variables:\n`;
        errorMessage += `     Set APPWRITE_API_KEY environment variable\n\n`;

        // Check if CLI is installed
        errorMessage += `Note: Ensure Appwrite CLI is installed:\n`;
        errorMessage += `  npm install -g appwrite-cli\n\n`;

        errorMessage += `For more help, visit: https://appwrite.io/docs/tooling/command-line/installation`;

        return new Error(errorMessage);
      };

      throw buildDetailedAuthError();
    }
  }

  const result = await AdapterFactory.create(config);

  return {
    adapter: result.adapter,
    client: result.client,
    apiMode: result.apiMode
  };
};

/**
 * Check if session authentication is available for a project
 */
export const checkSessionAuth = (endpoint: string, project: string): boolean => {
  return hasSessionAuth(endpoint, project);
};
