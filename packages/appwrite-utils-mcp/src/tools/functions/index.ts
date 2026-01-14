/**
 * Functions tools for MCP
 * @packageDocumentation
 */

import { z } from 'zod';
import { Functions } from 'node-appwrite';
import type { ToolContext, ToolDefinition, ToolGroupDefinition } from '../ToolGroup.js';
import { FunctionManager } from 'appwrite-utils-helpers';

// ──────────────────────────────────────────────────
// INPUT SCHEMAS
// ──────────────────────────────────────────────────

/**
 * Schema for list_functions - No required params
 */
const listFunctionsSchema = z.object({}).optional();

/**
 * Schema for get_function - Requires functionId
 */
const getFunctionSchema = z.object({
  functionId: z.string().min(1, 'Function ID is required'),
});

/**
 * Schema for deploy_function - Requires functionId and optional path
 */
const deployFunctionSchema = z.object({
  functionId: z.string().min(1, 'Function ID is required'),
  path: z.string().optional().describe('Path to function source code (default: searches standard locations)'),
  activate: z.boolean().optional().default(true).describe('Whether to activate the deployment'),
  entrypoint: z.string().optional().describe('Function entrypoint file (e.g., index.js)'),
  commands: z.string().optional().describe('Build commands (e.g., npm install)'),
});

// ──────────────────────────────────────────────────
// TOOL HANDLERS
// ──────────────────────────────────────────────────

/**
 * List all functions in the Appwrite project
 */
async function handleListFunctions(
  input: unknown,
  context: ToolContext
): Promise<{ functions: Array<{ id: string; name: string; runtime: string; status: string }> }> {
  // Resolve authentication credentials
  const authResult = await context.authResolver.resolve();

  // Get or create authenticated client
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const functionManager = new FunctionManager(client);
  const result = await functionManager.listFunctions();

  return {
    functions: result.functions.map((fn: any) => ({
      id: fn.$id,
      name: fn.name,
      runtime: fn.runtime,
      status: fn.latestDeploymentStatus || 'unknown',
    })),
  };
}

/**
 * Get detailed information about a specific function
 */
async function handleGetFunction(
  input: unknown,
  context: ToolContext
): Promise<{
  id: string;
  name: string;
  runtime: string;
  status: string;
  enabled: boolean;
  logging: boolean;
  execute: string[];
  events: string[];
  schedule: string;
  timeout: number;
  entrypoint: string;
  commands: string;
  installationId?: string;
  providerRepositoryId?: string;
  providerBranch?: string;
}> {
  const validated = getFunctionSchema.parse(input);

  // Resolve authentication credentials
  const authResult = await context.authResolver.resolve();

  // Get or create authenticated client
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const functionManager = new FunctionManager(client);
  const fn: any = await functionManager.getFunction(validated.functionId);

  return {
    id: fn.$id,
    name: fn.name,
    runtime: fn.runtime,
    status: fn.latestDeploymentStatus || 'unknown',
    enabled: fn.enabled,
    logging: fn.logging,
    execute: fn.execute || [],
    events: fn.events || [],
    schedule: fn.schedule || '',
    timeout: fn.timeout,
    entrypoint: fn.entrypoint,
    commands: fn.commands,
    installationId: fn.installationId,
    providerRepositoryId: fn.providerRepositoryId,
    providerBranch: fn.providerBranch,
  };
}

/**
 * Deploy a function with optional source code path
 */
async function handleDeployFunction(
  input: unknown,
  context: ToolContext
): Promise<{
  success: boolean;
  deploymentId: string;
  functionId: string;
  functionName: string;
  status: string;
  buildLogs?: string;
}> {
  const validated = deployFunctionSchema.parse(input);

  // Resolve authentication credentials
  const authResult = await context.authResolver.resolve();

  // Get or create authenticated client
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const functionManager = new FunctionManager(client);

  // Get function details first
  const fn = await functionManager.getFunction(validated.functionId);

  // Determine function path
  let functionPath = validated.path;
  if (!functionPath) {
    // Try to find function directory automatically
    const foundPath = await functionManager.findFunctionDirectory(fn.name, {
      searchPaths: [process.cwd()],
      verbose: false,
    });

    if (!foundPath) {
      throw new Error(
        `Could not find function directory for "${fn.name}". Please provide the path parameter.`
      );
    }

    functionPath = foundPath;
  }

  // Build deployment options
  const deploymentOptions = {
    activate: validated.activate,
    entrypoint: validated.entrypoint,
    commands: validated.commands,
    verbose: false,
  };

  // Create minimal function config for deployment
  const functionConfig = {
    $id: fn.$id,
    name: fn.name,
    runtime: fn.runtime,
    execute: fn.execute,
    events: fn.events,
    schedule: fn.schedule,
    timeout: fn.timeout,
    enabled: fn.enabled,
    logging: fn.logging,
    entrypoint: validated.entrypoint || fn.entrypoint,
    commands: validated.commands || fn.commands,
    scopes: fn.scopes,
    installationId: fn.installationId,
    providerRepositoryId: fn.providerRepositoryId,
    providerBranch: fn.providerBranch,
    providerSilentMode: fn.providerSilentMode,
    providerRootDirectory: fn.providerRootDirectory,
  };

  // Deploy the function
  const deployment: any = await functionManager.deployFunction(
    functionConfig as any,
    functionPath,
    deploymentOptions
  );

  return {
    success: true,
    deploymentId: deployment.$id,
    functionId: fn.$id,
    functionName: fn.name,
    status: deployment.status,
    buildLogs: deployment.buildStdout || deployment.buildStderr || '',
  };
}

// ──────────────────────────────────────────────────
// TOOL DEFINITIONS
// ──────────────────────────────────────────────────

const listFunctionsTool: ToolDefinition = {
  name: 'list_functions',
  description: 'List all functions in the Appwrite project',
  inputSchema: listFunctionsSchema || z.object({}),
  handler: handleListFunctions,
  requiresAuth: true,
};

const getFunctionTool: ToolDefinition = {
  name: 'get_function',
  description: 'Get detailed information about a specific function including deployments',
  inputSchema: getFunctionSchema,
  handler: handleGetFunction,
  requiresAuth: true,
};

const deployFunctionTool: ToolDefinition = {
  name: 'deploy_function',
  description: 'Deploy a function with optional source code path',
  inputSchema: deployFunctionSchema,
  handler: handleDeployFunction,
  requiresAuth: true,
};

// ──────────────────────────────────────────────────
// TOOL GROUP EXPORT
// ──────────────────────────────────────────────────

/**
 * Functions tools group for MCP
 */
export const functionsToolGroup: ToolGroupDefinition = {
  name: 'Functions',
  flag: 'functions',
  description: 'Tools for managing Appwrite functions and deployments',
  tools: [
    listFunctionsTool,
    getFunctionTool,
    deployFunctionTool,
  ],
};
