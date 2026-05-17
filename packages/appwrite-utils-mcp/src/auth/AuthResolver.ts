/**
 * Authentication resolver for managing Appwrite credentials
 * @packageDocumentation
 */

import { createHash } from "node:crypto";
import {
  SessionAuthService,
  type SessionAuthInfo,
} from "appwrite-utils-helpers";
import {
  resolveProjectConfig,
  type ResolvedProjectConfig,
} from "./ProjectConfigResolver.js";

/**
 * Internal candidate shape used during resolve(). Each candidate is fully
 * self-contained — all three of (endpoint, projectId, apiKey|sessionCookie)
 * must be present for it to be probed and returned.
 */
interface Candidate {
  endpoint: string;
  projectId: string;
  apiKey?: string;
  sessionCookie?: string;
  source: AuthResolutionResult["source"];
}

type ProbeVerdict = "valid" | "valid-but-narrow-scope" | "invalid-auth" | "unreachable";

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
  /**
   * Cache of probe verdicts keyed by SHA-256 of `${endpoint}:${projectId}:${cred}`.
   * Lives for the resolver instance lifetime — bad creds aren't re-probed every
   * tool call, but a fresh server start re-validates.
   */
  private probeCache: Map<string, ProbeVerdict> = new Map();

  /**
   * Look up (or run) the probe verdict for a candidate. Cache hits are free.
   */
  private async probeAndCache(candidate: Candidate): Promise<ProbeVerdict> {
    const cred = candidate.apiKey ?? candidate.sessionCookie ?? "";
    const fingerprint = createHash("sha256")
      .update(`${candidate.endpoint}:${candidate.projectId}:${cred}`)
      .digest("hex");

    const cached = this.probeCache.get(fingerprint);
    if (cached !== undefined) return cached;

    const verdict = await this.sessionService.probeCredentials({
      endpoint: candidate.endpoint,
      projectId: candidate.projectId,
      apiKey: candidate.apiKey,
      sessionCookie: candidate.sessionCookie,
    });
    this.probeCache.set(fingerprint, verdict);
    return verdict;
  }

  /**
   * Build the ordered list of candidate credentials this resolver would try,
   * in priority order. Each candidate is fully self-contained.
   */
  private async buildCandidates(toolParams?: ToolAuthParams): Promise<Candidate[]> {
    const candidates: Candidate[] = [];

    // "Inherited" endpoint+projectId — tool params win, then server flags. CWD
    // config and prefs can fill these for tiers that don't carry them.
    const baseEndpoint = toolParams?.endpoint ?? this.serverDefaults.endpoint;
    const baseProjectId = toolParams?.projectId ?? this.serverDefaults.projectId;

    const pushIfComplete = (c: Partial<Candidate> & { source: Candidate["source"] }) => {
      if (!c.endpoint || !c.projectId) return;
      if (!c.apiKey && !c.sessionCookie) return;
      candidates.push({
        endpoint: c.endpoint,
        projectId: c.projectId,
        apiKey: c.apiKey,
        sessionCookie: c.sessionCookie,
        source: c.source,
      });
    };

    // Tier 1: tool params with explicit creds.
    if (toolParams?.sessionCookie) {
      pushIfComplete({
        endpoint: baseEndpoint,
        projectId: baseProjectId,
        sessionCookie: toolParams.sessionCookie,
        source: "tool-params",
      });
    }
    if (toolParams?.apiKey) {
      pushIfComplete({
        endpoint: baseEndpoint,
        projectId: baseProjectId,
        apiKey: toolParams.apiKey,
        source: "tool-params",
      });
    }

    // Tier 2: server-default API key (combined with baseEndpoint/baseProjectId).
    if (this.serverDefaults.apiKey) {
      pushIfComplete({
        endpoint: baseEndpoint,
        projectId: baseProjectId,
        apiKey: this.serverDefaults.apiKey,
        source: "server-defaults",
      });
    }

    // Tier 3: in-memory session override (select_appwrite_project meta tool).
    if (this.sessionOverride) {
      const ov = this.sessionOverride;
      const ovEndpoint = ov.endpoint ?? baseEndpoint;
      if (ov.sessionCookie) {
        pushIfComplete({
          endpoint: ovEndpoint,
          projectId: ov.projectId,
          sessionCookie: ov.sessionCookie,
          source: "session-override",
        });
      }
      if (ov.apiKey) {
        pushIfComplete({
          endpoint: ovEndpoint,
          projectId: ov.projectId,
          apiKey: ov.apiKey,
          source: "session-override",
        });
      }
      // Override carries only identity — pair it with prefs-derived auth below.
    }

    // Tier 4: CWD project config (per-MCP-instance isolation).
    const project = await this.getProjectConfig();
    if (project) {
      const projEndpoint = project.endpoint ?? baseEndpoint;

      if (project.format === "yaml") {
        // Respect explicit authMethod: session/apikey. For "auto"/unset, prefer
        // session (matches ClientFactory's "auto" behavior) but try both.
        const wantSession = project.authMethod === "session" || project.authMethod !== "apikey";
        const wantApiKey = project.authMethod === "apikey" || project.authMethod !== "session";

        if (wantSession && project.sessionCookie) {
          pushIfComplete({
            endpoint: projEndpoint,
            projectId: project.projectId,
            sessionCookie: project.sessionCookie,
            source: "cwd-config",
          });
        }
        if (wantApiKey && project.apiKey) {
          pushIfComplete({
            endpoint: projEndpoint,
            projectId: project.projectId,
            apiKey: project.apiKey,
            source: "cwd-config",
          });
        }
      }

      if (project.format === "appwrite-json") {
        // appwrite.json carries only projectId. Try to find auth + endpoint in
        // prefs.json via three paths, in order of specificity.
        try {
          const direct = await this.sessionService.findEntryForProject(project.projectId);
          if (direct) {
            if (direct.sessionCookie) {
              pushIfComplete({
                endpoint: direct.endpoint,
                projectId: project.projectId,
                sessionCookie: direct.sessionCookie,
                source: "cwd-config",
              });
            }
            if (direct.apiKey) {
              pushIfComplete({
                endpoint: direct.endpoint,
                projectId: project.projectId,
                apiKey: direct.apiKey,
                source: "cwd-config",
              });
            }
          }
        } catch {
          /* non-fatal */
        }

        // "12 projects on one cookie" — scan prefs by endpoint when we have one.
        const scanEndpoint = projEndpoint;
        if (scanEndpoint) {
          try {
            const match = await this.sessionService.findAuthForEndpoint(scanEndpoint);
            if (match) {
              if (match.sessionCookie) {
                pushIfComplete({
                  endpoint: match.endpoint,
                  projectId: project.projectId,
                  sessionCookie: match.sessionCookie,
                  source: "cwd-config+prefs-endpoint",
                });
              }
              if (match.apiKey) {
                pushIfComplete({
                  endpoint: match.endpoint,
                  projectId: project.projectId,
                  apiKey: match.apiKey,
                  source: "cwd-config+prefs-endpoint",
                });
              }
            }
          } catch {
            /* non-fatal */
          }
        }

        // Last-ditch: borrow prefs.current's endpoint+auth, pair with CWD projectId.
        try {
          const current = await this.sessionService.findCurrentSession();
          if (current) {
            if (current.sessionCookie) {
              pushIfComplete({
                endpoint: current.endpoint,
                projectId: project.projectId,
                sessionCookie: current.sessionCookie,
                source: "cwd-config+prefs-current",
              });
            }
            if (current.apiKey) {
              pushIfComplete({
                endpoint: current.endpoint,
                projectId: project.projectId,
                apiKey: current.apiKey,
                source: "cwd-config+prefs-current",
              });
            }
          }
        } catch {
          /* non-fatal */
        }
      }
    }

    // Tier 5: bare prefs.current — only kicks in when no CWD config exists
    // (otherwise tier 4 already consulted prefs.current as a sub-step).
    if (!project) {
      try {
        const current = await this.sessionService.findCurrentSession();
        if (current) {
          if (current.sessionCookie) {
            pushIfComplete({
              endpoint: current.endpoint,
              projectId: current.projectId,
              sessionCookie: current.sessionCookie,
              source: "cli-current",
            });
          }
          if (current.apiKey) {
            pushIfComplete({
              endpoint: current.endpoint,
              projectId: current.projectId,
              apiKey: current.apiKey,
              source: "cli-current",
            });
          }
        }
      } catch (error) {
        console.warn(
          "prefs.current discovery failed:",
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    // Tier 6: per-project session cookie lookup against (baseEndpoint, baseProjectId).
    // Only reachable when caller knows both already (e.g. via --endpoint --projectId flags).
    if (baseEndpoint && baseProjectId) {
      try {
        const session = await this.sessionService.findSession(baseEndpoint, baseProjectId);
        if (session && this.sessionService.isValidSession(session)) {
          pushIfComplete({
            endpoint: session.endpoint,
            projectId: session.projectId,
            sessionCookie: session.cookie,
            source: "cli-session",
          });
        }
      } catch (error) {
        console.warn(
          "CLI session discovery failed:",
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    return candidates;
  }

  async resolve(
    toolParams?: ToolAuthParams
  ): Promise<AuthResolutionResult> {
    const candidates = await this.buildCandidates(toolParams);

    if (candidates.length === 0) {
      throw new Error(
        "Authentication resolution failed: no candidate credentials available. " +
          "Provide endpoint+projectId+(apiKey|sessionCookie) via tool params, server flags, " +
          "a project config (appwrite.json / .appwrite/config.yaml) in the working dir, " +
          "or run `appwrite login`."
      );
    }

    // Probe each candidate in priority order. Return the first that's valid
    // (or valid-but-scope-narrow, or unreachable — unreachable isn't auth's
    // fault, so let the real call surface it). Skip only invalid-auth.
    const failures: Array<{ source: string; verdict: ProbeVerdict }> = [];
    for (const candidate of candidates) {
      const verdict = await this.probeAndCache(candidate);
      if (verdict === "invalid-auth") {
        failures.push({ source: candidate.source, verdict });
        continue;
      }
      return {
        credentials: {
          endpoint: candidate.endpoint,
          projectId: candidate.projectId,
          apiKey: candidate.apiKey,
          sessionCookie: candidate.sessionCookie,
          authMethod: candidate.sessionCookie ? "session" : "apikey",
        },
        source: candidate.source,
      };
    }

    // All candidates probed as invalid-auth.
    const summary = failures.map((f) => f.source).join(", ");
    throw new Error(
      `Authentication resolution failed: every candidate credential was rejected by Appwrite (role: guests). ` +
        `Tried in order: ${summary}. ` +
        `Check that your API keys / session cookies are valid for the target project, or run \`appwrite login\`.`
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
