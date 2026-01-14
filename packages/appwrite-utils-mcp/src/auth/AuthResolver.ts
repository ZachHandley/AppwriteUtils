/**
 * Authentication resolver for managing Appwrite credentials
 * @packageDocumentation
 */

import {
  SessionAuthService,
  type SessionAuthInfo,
} from "appwrite-utils-helpers";

/**
 * Authentication credentials with source information
 */
export interface AuthCredentials {
  endpoint: string;
  projectId: string;
  apiKey?: string;
  sessionCookie?: string;
  authMethod: "apikey" | "session";
}

/**
 * Tool-level authentication parameters (highest priority)
 */
export interface ToolAuthParams {
  endpoint?: string;
  projectId?: string;
  apiKey?: string;
  sessionCookie?: string;
}

/**
 * Result of authentication resolution with source tracking
 */
export interface AuthResolutionResult {
  credentials: AuthCredentials;
  source: "tool-params" | "server-defaults" | "cli-session";
}

/**
 * Server-level default configuration (from FlagParser)
 */
export interface ServerDefaults {
  endpoint?: string;
  projectId?: string;
  apiKey?: string;
}

/**
 * AuthResolver implements a 3-tier authentication priority system:
 *
 * 1. Tool Parameters (highest priority)
 *    - Credentials passed directly to MCP tool calls
 *    - Allows per-tool override of authentication
 *
 * 2. Server Defaults (medium priority)
 *    - Configuration set when MCP server starts via command-line flags
 *    - Provides consistent defaults across all tool calls
 *
 * 3. CLI Session Discovery (lowest priority)
 *    - Automatic discovery of active Appwrite CLI sessions
 *    - Reads from ~/.appwrite/prefs.json
 *    - Enables seamless integration with existing CLI workflows
 *
 * @example
 * ```typescript
 * const resolver = new AuthResolver({
 *   endpoint: "https://cloud.appwrite.io/v1",
 *   projectId: "my-project",
 *   apiKey: "secret-key"
 * });
 *
 * // Resolve with tool-level override
 * const result = await resolver.resolve({
 *   projectId: "different-project"
 * });
 *
 * console.log(result.source); // "tool-params"
 * console.log(result.credentials.projectId); // "different-project"
 * ```
 */
export class AuthResolver {
  private readonly serverDefaults: ServerDefaults;
  private readonly sessionService: SessionAuthService;

  /**
   * Creates a new AuthResolver with server-level defaults
   *
   * @param serverDefaults - Default authentication configuration from FlagParser
   */
  constructor(serverDefaults: ServerDefaults = {}) {
    this.serverDefaults = serverDefaults;
    this.sessionService = new SessionAuthService();
  }

  /**
   * Resolve authentication credentials using 3-tier priority system
   *
   * Priority Order:
   * 1. Tool parameters (if provided)
   * 2. Server defaults (if set)
   * 3. CLI session discovery (if available)
   *
   * @param toolParams - Optional tool-level authentication parameters
   * @returns Authentication resolution result with credentials and source
   * @throws Error if no valid authentication can be resolved
   *
   * @example
   * ```typescript
   * // Using tool parameters (highest priority)
   * const result = await resolver.resolve({
   *   endpoint: "https://cloud.appwrite.io/v1",
   *   projectId: "my-project",
   *   apiKey: "secret-key"
   * });
   *
   * // Using server defaults (medium priority)
   * const result = await resolver.resolve();
   *
   * // Using CLI session (lowest priority)
   * const result = await resolver.resolve({
   *   endpoint: "https://cloud.appwrite.io/v1",
   *   projectId: "my-project"
   * });
   * ```
   */
  async resolve(
    toolParams?: ToolAuthParams
  ): Promise<AuthResolutionResult> {
    // Merge parameters with priority: tool > server > undefined
    const endpoint =
      toolParams?.endpoint ?? this.serverDefaults.endpoint;
    const projectId =
      toolParams?.projectId ?? this.serverDefaults.projectId;
    const apiKey =
      toolParams?.apiKey ?? this.serverDefaults.apiKey;
    const sessionCookie = toolParams?.sessionCookie;

    // Validate minimum required parameters
    if (!endpoint || !projectId) {
      throw new Error(
        "Authentication resolution failed: endpoint and projectId are required. " +
          "Provide them via tool parameters, server defaults, or CLI session."
      );
    }

    // Tier 1: Tool parameters with explicit session cookie
    if (toolParams?.sessionCookie) {
      return {
        credentials: {
          endpoint,
          projectId,
          sessionCookie: toolParams.sessionCookie,
          authMethod: "session",
        },
        source: "tool-params",
      };
    }

    // Tier 1: Tool parameters with API key
    if (toolParams?.apiKey) {
      return {
        credentials: {
          endpoint,
          projectId,
          apiKey: toolParams.apiKey,
          authMethod: "apikey",
        },
        source: "tool-params",
      };
    }

    // Tier 2: Server defaults with API key
    if (
      this.serverDefaults.apiKey &&
      (!toolParams?.endpoint || !toolParams?.projectId)
    ) {
      return {
        credentials: {
          endpoint,
          projectId,
          apiKey: this.serverDefaults.apiKey,
          authMethod: "apikey",
        },
        source: "server-defaults",
      };
    }

    // Tier 3: CLI session discovery
    try {
      const session = await this.sessionService.findSession(
        endpoint,
        projectId
      );

      if (session && this.sessionService.isValidSession(session)) {
        return {
          credentials: {
            endpoint: session.endpoint,
            projectId: session.projectId,
            sessionCookie: session.cookie,
            authMethod: "session",
          },
          source: "cli-session",
        };
      }
    } catch (error) {
      // Session discovery failure is not fatal - continue to fallback
      console.warn(
        "CLI session discovery failed:",
        error instanceof Error ? error.message : String(error)
      );
    }

    // If we have an API key from any source, use it as final fallback
    if (apiKey) {
      return {
        credentials: {
          endpoint,
          projectId,
          apiKey,
          authMethod: "apikey",
        },
        source: "server-defaults",
      };
    }

    // No valid authentication found
    throw new Error(
      `Authentication resolution failed for endpoint="${endpoint}" projectId="${projectId}". ` +
        "No API key or valid CLI session found. " +
        "Run 'appwrite login' or provide an API key."
    );
  }

  /**
   * Get the SessionAuthService instance for advanced session operations
   *
   * @returns The SessionAuthService instance used by this resolver
   */
  public getSessionService(): SessionAuthService {
    return this.sessionService;
  }

  /**
   * Get the server defaults configuration
   *
   * @returns The server defaults used by this resolver
   */
  public getServerDefaults(): Readonly<ServerDefaults> {
    return { ...this.serverDefaults };
  }
}
