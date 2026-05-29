/**
 * Config tools for MCP
 * @packageDocumentation
 */

import { z } from "zod";
import type { ToolGroupDefinition, ToolContext } from "../ToolGroup.js";
import { ConfigValidationService, ConfigLoaderService } from "appwrite-utils-helpers";

/**
 * Input schema for get_config tool (no parameters required)
 */
const GetConfigInputSchema = z.object({});

/**
 * Input schema for validate_config tool
 */
const ValidateConfigInputSchema = z.object({
  configPath: z.string().optional().describe("Optional path to appwrite.json config file. Defaults to auto-discovery."),
});

/**
 * Input schema for get_auth_status tool (no parameters required)
 */
const GetAuthStatusInputSchema = z.object({});

/**
 * Get current MCP server configuration and auth status
 */
async function getConfig(
  input: unknown,
  context: ToolContext
): Promise<unknown> {
  GetConfigInputSchema.parse(input);
  const serverDefaults = context.authResolver.getServerDefaults();
  const sessionService = context.authResolver.getSessionService();

  // CWD-resolved project config (the per-MCP-instance binding).
  const cwdProjectRaw = await context.authResolver.getProjectConfig();
  const cwdProject = cwdProjectRaw
    ? {
        source: cwdProjectRaw.source,
        format: cwdProjectRaw.format,
        projectId: cwdProjectRaw.projectId,
        endpoint: cwdProjectRaw.endpoint || null,
        hasInlineApiKey: !!cwdProjectRaw.apiKey,
        hasInlineCookie: !!cwdProjectRaw.sessionCookie,
      }
    : null;

  // In-memory override set via select_appwrite_project.
  const overrideRaw = context.authResolver.getOverride();
  const sessionOverride = overrideRaw
    ? {
        projectId: overrideRaw.projectId,
        endpoint: overrideRaw.endpoint || null,
        projectDir: overrideRaw.projectDir || null,
        hasApiKey: !!overrideRaw.apiKey,
        hasCookie: !!overrideRaw.sessionCookie,
      }
    : null;

  // prefs.current pointer — what the user most recently `appwrite use`'d.
  // entryKind tells the agent whether the entry carries a real project ID
  // (`project-key` from `appwrite client --project-id X --key Y`) or only
  // user-level auth (`user-session` from `appwrite login`). For the latter,
  // projectId is null because the prefs entry key is a user/session ID, not
  // a project ID — using it as X-Appwrite-Project would 404.
  let prefsCurrent: {
    endpoint: string;
    projectId: string | null;
    hasApiKey: boolean;
    hasCookie: boolean;
    entryKind: "project-key" | "user-session";
    note?: string;
  } | null = null;
  try {
    const current = await sessionService.findCurrentSession();
    if (current) {
      const entryKind = current.projectId ? "project-key" : "user-session";
      prefsCurrent = {
        endpoint: current.endpoint,
        projectId: current.projectId ?? null,
        hasApiKey: !!current.apiKey,
        hasCookie: !!current.sessionCookie,
        entryKind,
        ...(entryKind === "user-session"
          ? {
              note:
                "endpoint+auth resolved from prefs.current but no project ID — " +
                "supply --projectId / endpoint via flags or a CWD config file",
            }
          : {}),
      };
    }
  } catch {
    /* optional */
  }

  // Ask the resolver what it would actually pick right now.
  let resolved: {
    endpoint: string;
    projectId: string;
    source: string;
    authMethod: "apikey" | "session";
  } | { error: string };
  try {
    const result = await context.authResolver.resolve();
    resolved = {
      endpoint: result.credentials.endpoint,
      projectId: result.credentials.projectId,
      source: result.source,
      authMethod:
        result.credentials.authMethod === "session" ? "session" : "apikey",
    };
  } catch (err) {
    resolved = { error: err instanceof Error ? err.message : String(err) };
  }

  return {
    serverDefaults: {
      endpoint: serverDefaults.endpoint || null,
      projectId: serverDefaults.projectId || null,
      configDir: serverDefaults.configDir || null,
      hasApiKey: !!serverDefaults.apiKey,
    },
    effectiveConfigDir: context.authResolver.getEffectiveConfigDir(),
    cwdProject,
    sessionOverride,
    prefsCurrent,
    resolved,
  };
}

/**
 * Validate local Appwrite configuration file
 */
async function validateConfig(
  input: unknown,
  context: ToolContext
): Promise<unknown> {
  // Validate and parse input
  const parsed = ValidateConfigInputSchema.parse(input);
  const { configPath } = parsed;

  const configLoader = new ConfigLoaderService();
  const validationService = new ConfigValidationService();

  try {
    // Discover config if path not provided
    let actualConfigPath = configPath;
    if (!actualConfigPath) {
      const { ConfigDiscoveryService } = await import("appwrite-utils-helpers");
      const discoveryService = new ConfigDiscoveryService();
      const discovered = await discoveryService.findConfig(
        context.authResolver.getEffectiveConfigDir()
      );
      if (!discovered) {
        throw new Error("No Appwrite configuration file found. Please provide a configPath or ensure appwrite.json exists.");
      }
      actualConfigPath = discovered;
    }

    // Load the configuration
    const config = await configLoader.loadFromPath(actualConfigPath);

    // Validate the configuration
    const validation = validationService.validate(config);

    // Get summary
    const summary = validationService.getSummary(validation);

    return {
      isValid: validation.isValid,
      summary,
      errors: validation.errors.map(err => ({
        type: err.type,
        message: err.message,
        details: err.details,
        suggestion: err.suggestion,
        affectedItems: err.affectedItems,
      })),
      warnings: validation.warnings.map(warn => ({
        type: warn.type,
        message: warn.message,
        details: warn.details,
        suggestion: warn.suggestion,
        affectedItems: warn.affectedItems,
      })),
      suggestions: validation.suggestions?.map(sugg => ({
        type: sugg.type,
        message: sugg.message,
        details: sugg.details,
        suggestion: sugg.suggestion,
        affectedItems: sugg.affectedItems,
      })) || [],
    };
  } catch (error) {
    return {
      isValid: false,
      summary: "Configuration validation failed",
      errors: [
        {
          type: "load_error",
          message: error instanceof Error ? error.message : String(error),
          details: "Failed to load or parse configuration file",
          suggestion: configPath
            ? `Check that the file exists at ${configPath} and is valid JSON`
            : "Ensure appwrite.json exists in the current directory or parent directories",
        },
      ],
      warnings: [],
      suggestions: [],
    };
  }
}

/**
 * Get current authentication status
 */
async function getAuthStatus(
  input: unknown,
  context: ToolContext
): Promise<unknown> {
  GetAuthStatusInputSchema.parse(input);
  const serverDefaults = context.authResolver.getServerDefaults();

  // CWD project + override state for visibility.
  const cwdProjectRaw = await context.authResolver.getProjectConfig();
  const cwdProject = cwdProjectRaw
    ? {
        source: cwdProjectRaw.source,
        format: cwdProjectRaw.format,
        projectId: cwdProjectRaw.projectId,
        endpoint: cwdProjectRaw.endpoint || null,
        hasInlineApiKey: !!cwdProjectRaw.apiKey,
        hasInlineCookie: !!cwdProjectRaw.sessionCookie,
      }
    : null;

  const overrideRaw = context.authResolver.getOverride();
  const sessionOverride = overrideRaw
    ? {
        projectId: overrideRaw.projectId,
        endpoint: overrideRaw.endpoint || null,
        projectDir: overrideRaw.projectDir || null,
        hasApiKey: !!overrideRaw.apiKey,
        hasCookie: !!overrideRaw.sessionCookie,
      }
    : null;

  // Truth: what would the resolver actually pick right now?
  let authenticated = false;
  let authMethod: "apikey" | "session" | "none" = "none";
  let endpoint: string | null = null;
  let projectId: string | null = null;
  let source: string | null = null;
  let resolveError: string | null = null;

  try {
    const result = await context.authResolver.resolve();
    authenticated = true;
    authMethod = result.credentials.authMethod === "session" ? "session" : "apikey";
    endpoint = result.credentials.endpoint;
    projectId = result.credentials.projectId;
    source = result.source;
  } catch (err) {
    resolveError = err instanceof Error ? err.message : String(err);
  }

  return {
    authenticated,
    authMethod,
    endpoint,
    projectId,
    source,
    resolveError,
    serverDefaults: {
      hasEndpoint: !!serverDefaults.endpoint,
      hasProjectId: !!serverDefaults.projectId,
      hasApiKey: !!serverDefaults.apiKey,
      configDir: serverDefaults.configDir || null,
    },
    effectiveConfigDir: context.authResolver.getEffectiveConfigDir(),
    cwdProject,
    sessionOverride,
  };
}

/**
 * Config tool group definition
 */
export const configToolGroup: ToolGroupDefinition = {
  name: "Config",
  flag: "config",
  description: "Tools for managing Appwrite configuration and authentication",
  tools: [
    {
      name: "get_config",
      description: "Get current MCP server configuration and auth status",
      inputSchema: GetConfigInputSchema,
      handler: getConfig,
      requiresAuth: false,
    },
    {
      name: "validate_config",
      description: "Validate local Appwrite configuration file (appwrite.json)",
      inputSchema: ValidateConfigInputSchema,
      handler: validateConfig,
      requiresAuth: false,
    },
    {
      name: "get_auth_status",
      description: "Get current authentication status including server defaults and CLI sessions",
      inputSchema: GetAuthStatusInputSchema,
      handler: getAuthStatus,
      requiresAuth: false,
    },
  ],
};
