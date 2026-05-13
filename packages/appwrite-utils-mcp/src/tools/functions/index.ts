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
  entrypoint: z.string().optional().describe('Function entrypoint file (e.g., main.js)'),
  commands: z.string().optional().describe('Build commands (e.g., npm install)'),
});

/**
 * Schema for deploy_function_via_cli - Delegates to the official `appwrite push function` CLI
 */
const deployFunctionViaCliSchema = z.object({
  functionId: z.string().min(1, 'Function ID is required'),
  path: z.string().optional().describe('Function source code directory (default: <cwd>/appwrite/functions/<id>/)'),
  async: z.boolean().optional().default(false).describe("Don't wait for the deployment to finish"),
  stream: z.boolean().optional().default(false).describe('Stream CLI output to MCP host (usually false for MCP — output is captured and returned in `result`)'),
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

/**
 * Deploy a function via the official `appwrite push function` CLI command.
 *
 * Fetches the existing function from Appwrite to build a minimal function
 * descriptor, then delegates the actual push to the CLI runner.
 */
async function handleDeployFunctionViaCli(
  input: unknown,
  context: ToolContext
): Promise<{ result: string; exitCode: number; tail: string }> {
  const validated = deployFunctionViaCliSchema.parse(input);
  const authResult = await context.authResolver.resolve();

  // Build a minimal AppwriteFunction by fetching the existing function from the
  // project (the function must already exist for `appwrite push function` to
  // work without an in-project appwrite.config.json). For MCP, we resolve the
  // function record from Appwrite first, then convert it.
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });
  const functions = new Functions(client);
  const fn: any = await functions.get(validated.functionId);

  // Lazy-import the CLI deploy helper to avoid loading execa for
  // non-MCP-CLI users.
  const { deployFunctionViaCli } = await import('appwrite-utils-helpers');
  const res = await deployFunctionViaCli(
    {
      $id: fn.$id,
      name: fn.name,
      runtime: fn.runtime,
      entrypoint: fn.entrypoint,
      commands: fn.commands ?? '',
      execute: fn.execute as string[],
      events: fn.events as string[],
      schedule: fn.schedule ?? '',
      timeout: fn.timeout ?? 15,
      enabled: fn.enabled ?? true,
      logging: fn.logging ?? true,
      scopes: (fn.scopes ?? []) as any,
    } as any,
    {
      codePath: validated.path,
      credentials: {
        endpoint: authResult.credentials.endpoint,
        projectId: authResult.credentials.projectId,
        apiKey: authResult.credentials.apiKey,
      },
      stream: validated.stream,
      async: validated.async,
    }
  );

  // Tail the last 30 lines of combined output for the MCP response.
  const tail = (res.stdout + '\n' + res.stderr).split('\n').slice(-30).join('\n');
  return {
    result: res.exitCode === 0 ? 'success' : 'failed',
    exitCode: res.exitCode,
    tail,
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

const deployFunctionViaCliTool: ToolDefinition = {
  name: 'deploy_function_via_cli',
  description:
    'Deploy a function by delegating to the official `appwrite push function` CLI command. Returns the CLI exit code and a tail of its combined stdout/stderr output.',
  inputSchema: deployFunctionViaCliSchema,
  handler: handleDeployFunctionViaCli,
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
    deployFunctionViaCliTool,
  ],
};
