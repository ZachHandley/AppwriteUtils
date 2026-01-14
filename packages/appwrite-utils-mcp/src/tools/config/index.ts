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

  // Check if there's an active CLI session
  let cliSession = null;
  try {
    if (serverDefaults.endpoint && serverDefaults.projectId) {
      const session = await sessionService.findSession(
        serverDefaults.endpoint,
        serverDefaults.projectId
      );
      if (session && sessionService.isValidSession(session)) {
        cliSession = {
          endpoint: session.endpoint,
          projectId: session.projectId,
          hasCookie: !!session.cookie,
        };
      }
    }
  } catch (error) {
    // CLI session discovery is optional
  }

  return {
    serverDefaults: {
      endpoint: serverDefaults.endpoint || null,
      projectId: serverDefaults.projectId || null,
      hasApiKey: !!serverDefaults.apiKey,
    },
    cliSession,
    authMethod: serverDefaults.apiKey ? "apikey" : (cliSession ? "session" : "none"),
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
      const discovered = await discoveryService.findConfig(process.cwd());
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

  // Determine the current authentication method and details
  const endpoint = serverDefaults.endpoint || null;
  const projectId = serverDefaults.projectId || null;
  const hasApiKey = !!serverDefaults.apiKey;

  // Check for CLI session if endpoint and projectId are available
  let cliSessionStatus = null;
  if (endpoint && projectId) {
    try {
      const session = await sessionService.findSession(endpoint, projectId);
      if (session) {
        cliSessionStatus = {
          isValid: sessionService.isValidSession(session),
          endpoint: session.endpoint,
          projectId: session.projectId,
          email: session.email || null,
        };
      }
    } catch (error) {
      // CLI session discovery is optional
      cliSessionStatus = null;
    }
  }

  // Determine the effective auth method
  let authMethod: string;
  let authenticated: boolean;

  if (hasApiKey) {
    authMethod = "apikey";
    authenticated = true;
  } else if (cliSessionStatus?.isValid) {
    authMethod = "session";
    authenticated = true;
  } else {
    authMethod = "none";
    authenticated = false;
  }

  return {
    authenticated,
    authMethod,
    endpoint,
    projectId,
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
