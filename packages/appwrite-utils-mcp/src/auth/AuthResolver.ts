/**
 * Authentication resolver for managing Appwrite credentials
 * @packageDocumentation
 */

import {
  SessionAuthService,
  type SessionAuthInfo,
} from "appwrite-utils-helpers";
import {
  resolveProjectConfig,
  type ResolvedProjectConfig,
} from "./ProjectConfigResolver.js";

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
  source:
    | "tool-params"
    | "server-defaults"
    | "session-override"
    | "cwd-config"
    | "cwd-config+prefs-endpoint"
    | "cwd-config+prefs-current"
    | "cli-current"
    | "cli-session";
}

/**
 * Server-level default configuration (from FlagParser)
 */
export interface ServerDefaults {
  endpoint?: string;
  projectId?: string;
  apiKey?: string;
  /**
   * Directory the resolver should treat as the project root when looking for
   * `appwrite.json` or `.appwrite/config.yaml`. Defaults to `process.cwd()` at
   * resolve time.
   */
  configDir?: string;
}

/**
 * In-memory project override set via the `select_appwrite_project` meta tool.
 * Lives only for the lifetime of this AuthResolver instance — never persisted,
 * never leaks across MCP server instances.
 */
export interface ProjectOverride {
  projectId: string;
  endpoint?: string;
  apiKey?: string;
  sessionCookie?: string;
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
   * In-memory project override (set via select_appwrite_project meta tool).
   * Scoped to this resolver instance only — siblings can't see it.
   */
  private sessionOverride: ProjectOverride | null = null;

  /**
   * Cached CWD project config — read once lazily on first resolve(), kept for
   * the resolver lifetime. The mtime-aware caching the user wants for prefs
   * lives in SessionAuthService; for project config we accept "read once" since
   * the working dir doesn't change during a server lifetime.
   */
  private projectConfigCache:
    | { config: ResolvedProjectConfig | null; loaded: true }
    | { loaded: false } = { loaded: false };

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
   * Set the in-memory project override. Used by the select_appwrite_project
   * meta tool to pin the active project for this server instance.
   */
  public setOverride(override: ProjectOverride): void {
    this.sessionOverride = { ...override };
  }

  /**
   * Clear the in-memory project override.
   */
  public clearOverride(): void {
    this.sessionOverride = null;
  }

  /**
   * Get the current in-memory project override (if any).
   */
  public getOverride(): Readonly<ProjectOverride> | null {
    return this.sessionOverride ? { ...this.sessionOverride } : null;
  }

  /**
   * Resolve the project config bound to this MCP's working directory. Cached
   * for the resolver lifetime. Returns `null` when no config exists in CWD.
   */
  public async getProjectConfig(): Promise<ResolvedProjectConfig | null> {
    if (this.projectConfigCache.loaded) return this.projectConfigCache.config;
    const workingDir = this.serverDefaults.configDir ?? process.cwd();
    const config = await resolveProjectConfig(workingDir);
    this.projectConfigCache = { config, loaded: true };
    return config;
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
    // Tier 1+2: tool params win, then server flags, then nothing.
    let endpoint = toolParams?.endpoint ?? this.serverDefaults.endpoint;
    let projectId = toolParams?.projectId ?? this.serverDefaults.projectId;
    let apiKey = toolParams?.apiKey ?? this.serverDefaults.apiKey;
    let sessionCookie = toolParams?.sessionCookie;

    // Source tracking — set whenever a tier contributes the auth credential
    // that this resolution will actually use. The first tier to provide both
    // (endpoint+projectId) and (apiKey|sessionCookie) wins the source label.
    let contributingSource: AuthResolutionResult["source"] | null = null;

    // Tier 3: in-memory session override (select_appwrite_project meta tool).
    // Scoped to this server instance only — no leakage across MCPs.
    if (
      this.sessionOverride &&
      (!endpoint || !projectId || (!apiKey && !sessionCookie))
    ) {
      const ov = this.sessionOverride;
      if (!projectId) projectId = ov.projectId;
      if (!endpoint && ov.endpoint) endpoint = ov.endpoint;
      if (!apiKey && !sessionCookie) {
        if (ov.apiKey) {
          apiKey = ov.apiKey;
          contributingSource = "session-override";
        } else if (ov.sessionCookie) {
          sessionCookie = ov.sessionCookie;
          contributingSource = "session-override";
        }
      } else if (
        !contributingSource &&
        (projectId === ov.projectId || endpoint === ov.endpoint)
      ) {
        // Override contributed identity but not creds — still mark as the source.
        contributingSource = "session-override";
      }
    }

    // Tier 4: project config in CWD/--configDir. This is what makes each MCP
    // instance bind to ITS dir's project — isolating siblings.
    if (!projectId || !endpoint || (!apiKey && !sessionCookie)) {
      const project = await this.getProjectConfig();
      if (project) {
        // 4a: YAML config carries full creds inline.
        if (project.format === "yaml") {
          if (!projectId) projectId = project.projectId;
          if (!endpoint && project.endpoint) endpoint = project.endpoint;
          if (!apiKey && !sessionCookie) {
            if (project.apiKey) {
              apiKey = project.apiKey;
              if (!contributingSource) contributingSource = "cwd-config";
            } else if (project.sessionCookie) {
              sessionCookie = project.sessionCookie;
              if (!contributingSource) contributingSource = "cwd-config";
            }
          }
        }

        // 4b: appwrite.json (CLI format) — has only projectId. Lookup auth
        // against prefs.json via project-specific entry, then endpoint scan,
        // then prefs.current's endpoint as a last-ditch (apply project's
        // projectId on top of current's auth + endpoint).
        if (project.format === "appwrite-json") {
          if (!projectId) projectId = project.projectId;

          if (!apiKey && !sessionCookie) {
            // First try a project-specific prefs entry (key === projectId,
            // either cookie- or API-key-based — findEntryForProject handles both).
            try {
              const direct = await this.sessionService.findEntryForProject(
                project.projectId
              );
              if (direct) {
                if (!endpoint) endpoint = direct.endpoint;
                if (direct.apiKey) apiKey = direct.apiKey;
                else if (direct.sessionCookie) sessionCookie = direct.sessionCookie;
                if (!contributingSource && (apiKey || sessionCookie)) {
                  contributingSource = "cwd-config";
                }
              }
            } catch {
              /* non-fatal */
            }

            // If we know the endpoint by now, scan prefs for an entry matching
            // that endpoint with usable auth (the "12 projects on one cookie"
            // case for the user's blackleafdigital console session).
            if (!apiKey && !sessionCookie && endpoint) {
              try {
                const match = await this.sessionService.findAuthForEndpoint(endpoint);
                if (match) {
                  if (match.apiKey) apiKey = match.apiKey;
                  else if (match.sessionCookie) sessionCookie = match.sessionCookie;
                  if (!contributingSource && (apiKey || sessionCookie)) {
                    contributingSource = "cwd-config+prefs-endpoint";
                  }
                }
              } catch {
                /* non-fatal */
              }
            }

            // Final fallback: borrow prefs.current's endpoint + auth and pair
            // them with the CWD-resolved projectId.
            if (!apiKey && !sessionCookie) {
              try {
                const current = await this.sessionService.findCurrentSession();
                if (current) {
                  if (!endpoint) endpoint = current.endpoint;
                  if (current.apiKey) apiKey = current.apiKey;
                  else if (current.sessionCookie)
                    sessionCookie = current.sessionCookie;
                  if (!contributingSource && (apiKey || sessionCookie)) {
                    contributingSource = "cwd-config+prefs-current";
                  }
                }
              } catch {
                /* non-fatal */
              }
            }
          }
        }
      }
    }

    // Tier 5 (legacy): bare prefs.current fallback when CWD has no config —
    // the bare-launch case (`bunx appwrite-utils-mcp` from a non-project dir).
    let currentContributedCreds = false;
    if (!endpoint || !projectId || (!apiKey && !sessionCookie)) {
      try {
        const current = await this.sessionService.findCurrentSession();
        if (current) {
          if (!endpoint) endpoint = current.endpoint;
          if (!projectId) projectId = current.projectId;
          if (!apiKey && !sessionCookie) {
            if (current.apiKey) {
              apiKey = current.apiKey;
              currentContributedCreds = true;
            } else if (current.sessionCookie) {
              sessionCookie = current.sessionCookie;
              currentContributedCreds = true;
            }
          }
        }
      } catch (error) {
        // Non-fatal — the resolver still has the existing fallback chain.
        console.warn(
          "prefs.current discovery failed:",
          error instanceof Error ? error.message : String(error)
        );
      }
    }

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

    // Tier 3/4: credentials came from session-override or CWD project config
    // (with optional prefs.json endpoint-match or prefs.current fallback).
    if (contributingSource) {
      if (apiKey) {
        return {
          credentials: { endpoint, projectId, apiKey, authMethod: "apikey" },
          source: contributingSource,
        };
      }
      if (sessionCookie) {
        return {
          credentials: { endpoint, projectId, sessionCookie, authMethod: "session" },
          source: contributingSource,
        };
      }
    }

    // Tier 5 (legacy): Credentials resolved from bare ~/.appwrite/prefs.json `current`
    if (currentContributedCreds) {
      if (apiKey) {
        return {
          credentials: { endpoint, projectId, apiKey, authMethod: "apikey" },
          source: "cli-current",
        };
      }
      if (sessionCookie) {
        return {
          credentials: { endpoint, projectId, sessionCookie, authMethod: "session" },
          source: "cli-current",
        };
      }
    }

    // Tier 6: project-specific CLI session discovery
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
