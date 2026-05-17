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
  // Validate input
  GetConfigInputSchema.parse(input);
  const serverDefaults = context.authResolver.getServerDefaults();
  const sessionService = context.authResolver.getSessionService();

  // 1) Project-specific session lookup (only when both endpoint and projectId
  //    are known from server flags or env).
  let cliSession:
    | {
        source: "project-session" | "prefs.current";
        endpoint: string;
        projectId: string;
        hasApiKey: boolean;
        hasCookie: boolean;
      }
    | null = null;

  try {
    if (serverDefaults.endpoint && serverDefaults.projectId) {
      const session = await sessionService.findSession(
        serverDefaults.endpoint,
        serverDefaults.projectId
      );
      if (session && sessionService.isValidSession(session)) {
        cliSession = {
          source: "project-session",
          endpoint: session.endpoint,
          projectId: session.projectId,
          hasApiKey: false,
          hasCookie: !!session.cookie,
        };
      }
    }
  } catch (error) {
    // CLI session discovery is optional
  }

  // 2) prefs.current fallback — what the AuthResolver itself will use when no
  //    endpoint/projectId were passed (bare-launch case).
  if (!cliSession) {
    try {
      const current = await sessionService.findCurrentSession();
      if (current) {
        cliSession = {
          source: "prefs.current",
          endpoint: current.endpoint,
          projectId: current.projectId,
          hasApiKey: !!current.apiKey,
          hasCookie: !!current.sessionCookie,
        };
      }
    } catch (error) {
      // prefs.current discovery is optional
    }
  }

  // Effective auth method the resolver would pick right now.
  let authMethod: "apikey" | "session" | "none" = "none";
  if (serverDefaults.apiKey) authMethod = "apikey";
  else if (cliSession?.hasApiKey) authMethod = "apikey";
  else if (cliSession?.hasCookie) authMethod = "session";

  return {
    serverDefaults: {
      endpoint: serverDefaults.endpoint || null,
      projectId: serverDefaults.projectId || null,
      hasApiKey: !!serverDefaults.apiKey,
    },
    cliSession,
    authMethod,
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
      const discovered = await discoveryService.findConfig(context.configDir ?? process.cwd());
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
  // Validate input
  GetAuthStatusInputSchema.parse(input);
  const serverDefaults = context.authResolver.getServerDefaults();
  const sessionService = context.authResolver.getSessionService();

  const serverDefaultEndpoint = serverDefaults.endpoint || null;
  const serverDefaultProjectId = serverDefaults.projectId || null;
  const hasApiKey = !!serverDefaults.apiKey;

  // 1) Project-specific session lookup when server defaults have both
  //    endpoint and projectId.
  let cliSessionStatus:
    | {
        source: "project-session" | "prefs.current";
        isValid: boolean;
        endpoint: string;
        projectId: string;
        email: string | null;
        hasApiKey: boolean;
        hasCookie: boolean;
      }
    | null = null;

  if (serverDefaultEndpoint && serverDefaultProjectId) {
    try {
      const session = await sessionService.findSession(
        serverDefaultEndpoint,
        serverDefaultProjectId
      );
      if (session) {
        cliSessionStatus = {
          source: "project-session",
          isValid: sessionService.isValidSession(session),
          endpoint: session.endpoint,
          projectId: session.projectId,
          email: session.email || null,
          hasApiKey: false,
          hasCookie: !!session.cookie,
        };
      }
    } catch (error) {
      // CLI session discovery is optional
      cliSessionStatus = null;
    }
  }

  // 2) prefs.current fallback — what the AuthResolver will actually use when
  //    no endpoint/projectId are passed via flags.
  if (!cliSessionStatus) {
    try {
      const current = await sessionService.findCurrentSession();
      if (current) {
        cliSessionStatus = {
          source: "prefs.current",
          // Without live probing we treat the resolved entry as usable.
          isValid: true,
          endpoint: current.endpoint,
          projectId: current.projectId,
          email: current.email || null,
          hasApiKey: !!current.apiKey,
          hasCookie: !!current.sessionCookie,
        };
      }
    } catch (error) {
      // prefs.current discovery is optional
    }
  }

  // Effective endpoint/projectId the resolver would use right now.
  const effectiveEndpoint = serverDefaultEndpoint ?? cliSessionStatus?.endpoint ?? null;
  const effectiveProjectId = serverDefaultProjectId ?? cliSessionStatus?.projectId ?? null;

  // Effective auth method.
  let authMethod: "apikey" | "session" | "none";
  let authenticated: boolean;

  if (hasApiKey) {
    authMethod = "apikey";
    authenticated = true;
  } else if (cliSessionStatus?.hasApiKey) {
    authMethod = "apikey";
    authenticated = true;
  } else if (cliSessionStatus?.isValid && cliSessionStatus.hasCookie) {
    authMethod = "session";
    authenticated = true;
  } else {
    authMethod = "none";
    authenticated = false;
  }

  return {
    authenticated,
    authMethod,
    endpoint: effectiveEndpoint,
    projectId: effectiveProjectId,
    serverDefaults: {
      hasEndpoint: !!serverDefaults.endpoint,
      hasProjectId: !!serverDefaults.projectId,
      hasApiKey,
    },
    cliSession: cliSessionStatus,
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
