/**
 * Functions tools for MCP
 *
 * SECURITY: Function variable values flagged `secret === true` are redacted to
 * the literal string `'<redacted>'` before being returned out of the MCP.
 * Never echo secret values through the MCP boundary.
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import { Functions, ExecutionMethod } from 'node-appwrite';
import type { ToolContext, ToolDefinition, ToolGroupDefinition } from '../ToolGroup.js';
import { FunctionManager } from 'appwrite-utils-helpers';

// ──────────────────────────────────────────────────
// REDACTION HELPER (function-scoped variables)
// ──────────────────────────────────────────────────

/**
 * Variable shape returned out of the MCP. Mirrors Models.Variable but
 * intentionally typed loosely so we can attach the redaction unconditionally.
 */
interface FunctionVariableOut {
  $id: string;
  key: string;
  value: string;
  secret: boolean;
  $createdAt: string;
}

/**
 * SECURITY-CRITICAL: redact the `value` field whenever `secret === true`.
 * This is the single chokepoint through which all function-variable payloads
 * must pass before leaving the MCP boundary. Duplicated (not imported) from
 * tools/projects/index.ts to keep these files independent.
 */
function redactSecretValue(variable: any): FunctionVariableOut {
  const isSecret = variable.secret === true;
  return {
    $id: variable.$id,
    key: variable.key,
    value: isSecret ? '<redacted>' : variable.value,
    secret: isSecret,
    $createdAt: variable.$createdAt,
  };
}

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

/**
 * Schema for list_executions - Requires functionId, optional queries/search
 */
const listExecutionsSchema = z.object({
  functionId: z.string().min(1, 'Function ID is required'),
  queries: z.array(z.string()).optional().describe('Array of Appwrite Query strings (see Query class). Filter on trigger, status, responseStatusCode, duration, requestMethod, requestPath, deploymentId.'),
  search: z.string().max(256).optional().describe('Free-text search string (max 256 chars). Encoded as a Query.search filter against requestPath.'),
});

/**
 * Schema for get_execution - Requires functionId + executionId
 */
const getExecutionSchema = z.object({
  functionId: z.string().min(1, 'Function ID is required'),
  executionId: z.string().min(1, 'Execution ID is required'),
});

/**
 * Schema for create_execution - Trigger a function execution
 */
const createExecutionSchema = z.object({
  functionId: z.string().min(1, 'Function ID is required'),
  body: z.string().optional().describe('HTTP body of execution (default: empty string)'),
  async: z.boolean().optional().default(false).describe('Execute in the background (default: false)'),
  path: z.string().optional().describe('HTTP path of execution. Can include query params. Default: /'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']).optional().describe('HTTP method of execution. Default: POST.'),
  headers: z.record(z.string(), z.string()).optional().describe('HTTP headers for the execution as a key-value object.'),
  scheduledAt: z.string().optional().describe('Scheduled execution time in ISO 8601 format. Must be in the future with minute precision.'),
});

/**
 * Schema for delete_execution - Requires functionId + executionId
 */
const deleteExecutionSchema = z.object({
  functionId: z.string().min(1, 'Function ID is required'),
  executionId: z.string().min(1, 'Execution ID is required'),
});

/**
 * Schema for list_deployments - Requires functionId, optional queries/search
 */
const listDeploymentsSchema = z.object({
  functionId: z.string().min(1, 'Function ID is required'),
  queries: z.array(z.string()).optional().describe('Array of Appwrite Query strings (see Query class). Filter on attributes such as size, buildDuration, status, activate, type, entrypoint, commands.'),
  search: z.string().max(256).optional().describe('Free-text search string (max 256 chars) passed to the Functions service.'),
});

/**
 * Schema for get_deployment - Requires functionId + deploymentId
 */
const getDeploymentSchema = z.object({
  functionId: z.string().min(1, 'Function ID is required'),
  deploymentId: z.string().min(1, 'Deployment ID is required'),
});

/**
 * Schema for create_vcs_deployment - Trigger a VCS-based deployment
 */
const createVcsDeploymentSchema = z.object({
  functionId: z.string().min(1, 'Function ID is required'),
  reference: z.string().min(1, 'VCS reference is required').describe('VCS reference to deploy from. For type=branch this is the branch name (e.g. "main"); for type=commit this is the commit SHA.'),
  type: z.enum(['branch', 'commit']).optional().default('branch').describe('Type of VCS reference. Default: branch.'),
  activate: z.boolean().optional().default(true).describe('Automatically activate the deployment when build finishes. Default: true.'),
});

/**
 * Schema for delete_deployment - Requires functionId + deploymentId
 */
const deleteDeploymentSchema = z.object({
  functionId: z.string().min(1, 'Function ID is required'),
  deploymentId: z.string().min(1, 'Deployment ID is required'),
});

/**
 * Schema for list_function_variables
 */
const listFunctionVariablesSchema = z.object({
  functionId: z.string().min(1, 'Function ID is required'),
  queries: z
    .array(z.string())
    .optional()
    .describe('Array of Appwrite Query strings (see Query class).'),
});

/**
 * Schema for get_function_variable
 */
const getFunctionVariableSchema = z.object({
  functionId: z.string().min(1, 'Function ID is required'),
  variableId: z.string().min(1, 'Variable ID is required'),
});

/**
 * Schema for create_function_variable
 *
 * Note: function-scoped variables are NOT user-id-able by the caller. The
 * server auto-generates the variable ID, so this schema intentionally does
 * not accept a `variableId` field.
 */
const createFunctionVariableSchema = z.object({
  functionId: z.string().min(1, 'Function ID is required'),
  key: z
    .string()
    .min(1, 'Variable key is required')
    .max(255, 'Variable key must be 255 chars or fewer'),
  value: z.string().describe('Variable value. Max length: 8192 chars.'),
  secret: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Whether to mark the variable as secret. Once secret, the value is never returned by the API.'
    ),
});

/**
 * Schema for update_function_variable
 */
const updateFunctionVariableSchema = z.object({
  functionId: z.string().min(1, 'Function ID is required'),
  variableId: z.string().min(1, 'Variable ID is required'),
  key: z
    .string()
    .max(255, 'Variable key must be 255 chars or fewer')
    .optional()
    .describe(
      'New variable key. If omitted, the existing key is preserved (one extra GET round-trip).'
    ),
  value: z.string().optional().describe('New value. Max length: 8192 chars.'),
  secret: z
    .boolean()
    .optional()
    .describe('Toggle secret flag.'),
});

/**
 * Schema for delete_function_variable
 */
const deleteFunctionVariableSchema = z.object({
  functionId: z.string().min(1, 'Function ID is required'),
  variableId: z.string().min(1, 'Variable ID is required'),
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
      searchPaths: [context.configDir ?? process.cwd()],
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

/**
 * List executions for a function with a slim per-row projection.
 */
async function handleListExecutions(
  input: unknown,
  context: ToolContext
): Promise<{
  total: number;
  executions: Array<{
    $id: string;
    status: string;
    trigger: string;
    responseStatusCode: number;
    duration: number;
    $createdAt: string;
    errorExcerpt?: string;
  }>;
}> {
  const validated = listExecutionsSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const functionManager = new FunctionManager(client);
  const result = await functionManager.listExecutions(
    validated.functionId,
    validated.queries,
    validated.search
  );

  return {
    total: result.total,
    executions: result.executions.map((ex: any) => {
      const errors: string = ex.errors || '';
      const errorExcerpt = errors.length > 0 ? errors.slice(0, 280) : undefined;
      return {
        $id: ex.$id,
        status: ex.status,
        trigger: ex.trigger,
        responseStatusCode: ex.responseStatusCode,
        duration: ex.duration,
        $createdAt: ex.$createdAt,
        ...(errorExcerpt ? { errorExcerpt } : {}),
      };
    }),
  };
}

/**
 * Get a single execution including full logs and errors.
 */
async function handleGetExecution(
  input: unknown,
  context: ToolContext
): Promise<{
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  functionId: string;
  deploymentId: string;
  trigger: string;
  status: string;
  requestMethod: string;
  requestPath: string;
  responseStatusCode: number;
  responseBody: string;
  logs: string;
  errors: string;
  duration: number;
  scheduledAt?: string;
}> {
  const validated = getExecutionSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const functionManager = new FunctionManager(client);
  const ex: any = await functionManager.getExecution(validated.functionId, validated.executionId);

  return {
    $id: ex.$id,
    $createdAt: ex.$createdAt,
    $updatedAt: ex.$updatedAt,
    functionId: ex.functionId,
    deploymentId: ex.deploymentId,
    trigger: ex.trigger,
    status: ex.status,
    requestMethod: ex.requestMethod,
    requestPath: ex.requestPath,
    responseStatusCode: ex.responseStatusCode,
    responseBody: ex.responseBody,
    logs: ex.logs,
    errors: ex.errors,
    duration: ex.duration,
    scheduledAt: ex.scheduledAt,
  };
}

/**
 * Trigger a function execution.
 */
async function handleCreateExecution(
  input: unknown,
  context: ToolContext
): Promise<{
  $id: string;
  $createdAt: string;
  functionId: string;
  status: string;
  trigger: string;
  requestMethod: string;
  requestPath: string;
  responseStatusCode: number;
  responseBody: string;
  duration: number;
  scheduledAt?: string;
}> {
  const validated = createExecutionSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const functionManager = new FunctionManager(client);
  const ex: any = await functionManager.createExecution(
    validated.functionId,
    validated.body,
    validated.async,
    validated.path,
    validated.method ? (ExecutionMethod[validated.method as keyof typeof ExecutionMethod]) : undefined,
    validated.headers,
    validated.scheduledAt
  );

  return {
    $id: ex.$id,
    $createdAt: ex.$createdAt,
    functionId: ex.functionId,
    status: ex.status,
    trigger: ex.trigger,
    requestMethod: ex.requestMethod,
    requestPath: ex.requestPath,
    responseStatusCode: ex.responseStatusCode,
    responseBody: ex.responseBody,
    duration: ex.duration,
    scheduledAt: ex.scheduledAt,
  };
}

/**
 * Delete a function execution by ID.
 */
async function handleDeleteExecution(
  input: unknown,
  context: ToolContext
): Promise<{ success: true }> {
  const validated = deleteExecutionSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const functionManager = new FunctionManager(client);
  await functionManager.deleteExecution(validated.functionId, validated.executionId);

  return { success: true };
}

/**
 * List code deployments for a function with a slim per-row projection.
 */
async function handleListDeployments(
  input: unknown,
  context: ToolContext
): Promise<{
  total: number;
  deployments: Array<{
    $id: string;
    status: string;
    type: string;
    sourceSize: number;
    buildSize: number;
    buildDuration: number;
    $createdAt: string;
    activate: boolean;
    entrypoint: string;
    commands?: string;
    buildLogsExcerpt?: string;
  }>;
}> {
  const validated = listDeploymentsSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const functionManager = new FunctionManager(client);
  const result = await functionManager.listDeployments(
    validated.functionId,
    validated.queries,
    validated.search
  );

  return {
    total: result.total,
    deployments: result.deployments.map((dep: any) => {
      const buildLogs: string = dep.buildLogs || '';
      const buildLogsExcerpt = buildLogs.length > 0 ? buildLogs.slice(0, 280) : undefined;
      const rawCommands: string | undefined = dep.commands;
      const commands =
        typeof rawCommands === 'string' && rawCommands.length > 200
          ? rawCommands.slice(0, 200)
          : rawCommands;
      return {
        $id: dep.$id,
        status: dep.status,
        type: dep.type,
        sourceSize: dep.sourceSize,
        buildSize: dep.buildSize,
        buildDuration: dep.buildDuration,
        $createdAt: dep.$createdAt,
        activate: dep.activate,
        entrypoint: dep.entrypoint,
        ...(commands !== undefined ? { commands } : {}),
        ...(buildLogsExcerpt ? { buildLogsExcerpt } : {}),
      };
    }),
  };
}

/**
 * Get a single function deployment including full buildLogs and buildAttempts.
 */
async function handleGetDeployment(
  input: unknown,
  context: ToolContext
): Promise<Record<string, unknown>> {
  const validated = getDeploymentSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const functionManager = new FunctionManager(client);
  const dep: any = await functionManager.getDeployment(
    validated.functionId,
    validated.deploymentId
  );

  // Return the full deployment payload as-is so callers get every field the
  // server provides, including buildLogs and any buildAttempts surfaced by the
  // API (not in the strict SDK type but present on the wire).
  return { ...dep };
}

/**
 * Create a VCS deployment (branch or commit) for a VCS-connected function.
 */
async function handleCreateVcsDeployment(
  input: unknown,
  context: ToolContext
): Promise<Record<string, unknown>> {
  const validated = createVcsDeploymentSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const functionManager = new FunctionManager(client);
  const deployment: any = await functionManager.createVcsDeployment(
    validated.functionId,
    validated.reference,
    {
      type: validated.type,
      activate: validated.activate,
    }
  );

  return { ...deployment };
}

/**
 * Delete a function deployment by ID.
 */
async function handleDeleteDeployment(
  input: unknown,
  context: ToolContext
): Promise<{ success: true }> {
  const validated = deleteDeploymentSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const functionManager = new FunctionManager(client);
  await functionManager.deleteDeployment(validated.functionId, validated.deploymentId);

  return { success: true };
}

/**
 * List per-function (function-scoped) environment variables. Values flagged
 * `secret === true` are redacted to `'<redacted>'`.
 */
async function handleListFunctionVariables(
  input: unknown,
  context: ToolContext
): Promise<{
  total: number;
  variables: FunctionVariableOut[];
}> {
  const validated = listFunctionVariablesSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const functionManager = new FunctionManager(client);
  const result = await functionManager.listVariables(
    validated.functionId,
    validated.queries
  );

  return {
    total: result.total,
    // SECURITY: redact secret values before returning.
    variables: result.variables.map(redactSecretValue),
  };
}

/**
 * Get a single per-function (function-scoped) environment variable. The value
 * is redacted when `secret === true`.
 */
async function handleGetFunctionVariable(
  input: unknown,
  context: ToolContext
): Promise<FunctionVariableOut> {
  const validated = getFunctionVariableSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const functionManager = new FunctionManager(client);
  const variable = await functionManager.getVariable(
    validated.functionId,
    validated.variableId
  );

  // SECURITY: redact secret value before returning.
  return redactSecretValue(variable);
}

/**
 * Create a new per-function (function-scoped) environment variable. The value
 * is redacted in the response when `secret === true`.
 */
async function handleCreateFunctionVariable(
  input: unknown,
  context: ToolContext
): Promise<FunctionVariableOut> {
  const validated = createFunctionVariableSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const functionManager = new FunctionManager(client);
  const variable = await functionManager.createVariable(
    validated.functionId,
    validated.key,
    validated.value,
    {
      secret: validated.secret,
    }
  );

  // SECURITY: redact secret value before returning.
  return redactSecretValue(variable);
}

/**
 * Update an existing per-function (function-scoped) environment variable. The
 * value is redacted in the response when `secret === true`.
 */
async function handleUpdateFunctionVariable(
  input: unknown,
  context: ToolContext
): Promise<FunctionVariableOut> {
  const validated = updateFunctionVariableSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const functionManager = new FunctionManager(client);
  const variable = await functionManager.updateVariable(
    validated.functionId,
    validated.variableId,
    {
      key: validated.key,
      value: validated.value,
      secret: validated.secret,
    }
  );

  // SECURITY: redact secret value before returning.
  return redactSecretValue(variable);
}

/**
 * Delete a per-function (function-scoped) environment variable by ID.
 */
async function handleDeleteFunctionVariable(
  input: unknown,
  context: ToolContext
): Promise<{ success: true }> {
  const validated = deleteFunctionVariableSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const functionManager = new FunctionManager(client);
  await functionManager.deleteVariable(
    validated.functionId,
    validated.variableId
  );

  return { success: true };
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

const listExecutionsTool: ToolDefinition = {
  name: 'list_executions',
  description:
    'List executions for a function. Returns a slim per-row projection ($id, status, trigger, responseStatusCode, duration, $createdAt, short errorExcerpt). Use get_execution for full logs/errors.',
  inputSchema: listExecutionsSchema,
  handler: handleListExecutions,
  requiresAuth: true,
};

const getExecutionTool: ToolDefinition = {
  name: 'get_execution',
  description:
    'Get a single function execution by ID including full logs, errors, request and response details.',
  inputSchema: getExecutionSchema,
  handler: handleGetExecution,
  requiresAuth: true,
};

const createExecutionTool: ToolDefinition = {
  name: 'create_execution',
  description:
    'Trigger a function execution. Supports sync/async, custom HTTP method/path/headers/body, and optional ISO 8601 scheduledAt for delayed runs.',
  inputSchema: createExecutionSchema,
  handler: handleCreateExecution,
  requiresAuth: true,
};

const deleteExecutionTool: ToolDefinition = {
  name: 'delete_execution',
  description: 'Delete a function execution by ID.',
  inputSchema: deleteExecutionSchema,
  handler: handleDeleteExecution,
  requiresAuth: true,
};

const listDeploymentsTool: ToolDefinition = {
  name: 'list_deployments',
  description:
    "List code deployments for a function. Returns a slim per-row projection ($id, status, type, sourceSize, buildSize, buildDuration, $createdAt, activate, entrypoint, commands truncated to 200 chars, buildLogsExcerpt of first 280 chars). Use get_deployment for full buildLogs and buildAttempts.",
  inputSchema: listDeploymentsSchema,
  handler: handleListDeployments,
  requiresAuth: true,
};

const getDeploymentTool: ToolDefinition = {
  name: 'get_deployment',
  description:
    'Get a single function deployment by ID including full buildLogs and any buildAttempts surfaced by the API.',
  inputSchema: getDeploymentSchema,
  handler: handleGetDeployment,
  requiresAuth: true,
};

const createVcsDeploymentTool: ToolDefinition = {
  name: 'create_vcs_deployment',
  description:
    "Create a deployment for a VCS-connected function from a branch or commit reference. This is the redeploy-from-current-branch-HEAD path used for VCS-connected functions. Defaults: type='branch', activate=true.",
  inputSchema: createVcsDeploymentSchema,
  handler: handleCreateVcsDeployment,
  requiresAuth: true,
};

const deleteDeploymentTool: ToolDefinition = {
  name: 'delete_deployment',
  description: 'Delete a function deployment by ID.',
  inputSchema: deleteDeploymentSchema,
  handler: handleDeleteDeployment,
  requiresAuth: true,
};

const listFunctionVariablesTool: ToolDefinition = {
  name: 'list_function_variables',
  description:
    'List all per-function (function-scoped) environment variables for a function. These override project-level variables for the specific function. Values of secret variables are returned as "<redacted>".',
  inputSchema: listFunctionVariablesSchema,
  handler: handleListFunctionVariables,
  requiresAuth: true,
};

const getFunctionVariableTool: ToolDefinition = {
  name: 'get_function_variable',
  description:
    'Get a single per-function (function-scoped) environment variable by ID. The value of a secret variable is returned as "<redacted>".',
  inputSchema: getFunctionVariableSchema,
  handler: handleGetFunctionVariable,
  requiresAuth: true,
};

const createFunctionVariableTool: ToolDefinition = {
  name: 'create_function_variable',
  description:
    'Create a new per-function (function-scoped) environment variable. Overrides any project-level variable with the same key for this function. The variable ID is auto-generated server-side (function-scoped variables are not user-id-able by the caller). Response redacts the value when secret=true.',
  inputSchema: createFunctionVariableSchema,
  handler: handleCreateFunctionVariable,
  requiresAuth: true,
};

const updateFunctionVariableTool: ToolDefinition = {
  name: 'update_function_variable',
  description:
    'Update an existing per-function (function-scoped) environment variable. All fields except functionId and variableId are optional. Response redacts the value when secret=true.',
  inputSchema: updateFunctionVariableSchema,
  handler: handleUpdateFunctionVariable,
  requiresAuth: true,
};

const deleteFunctionVariableTool: ToolDefinition = {
  name: 'delete_function_variable',
  description: 'Delete a per-function (function-scoped) environment variable by ID.',
  inputSchema: deleteFunctionVariableSchema,
  handler: handleDeleteFunctionVariable,
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
    listExecutionsTool,
    getExecutionTool,
    createExecutionTool,
    deleteExecutionTool,
    listDeploymentsTool,
    getDeploymentTool,
    createVcsDeploymentTool,
    deleteDeploymentTool,
    listFunctionVariablesTool,
    getFunctionVariableTool,
    createFunctionVariableTool,
    updateFunctionVariableTool,
    deleteFunctionVariableTool,
  ],
};
