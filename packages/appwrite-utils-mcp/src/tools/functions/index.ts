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
import { ConfigManager, FunctionManager, MessageFormatter, type BatchDeployResult } from 'appwrite-utils-helpers';
import type { AppwriteFunction } from 'appwrite-utils';
import { normalizeQueries } from '../../utils/queryNormalizer.js';
import { clampQueryLimit } from '../../utils/clampQueryLimit.js';

const QUERY_HELP_SUFFIX =
  ' Accepts SDK syntax like Query.limit(10) or limit(10), or JSON wire form. Call query_help for the full reference.';

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
// EXECUTION PAYLOAD HELPERS (size guard + tail slice)
// ──────────────────────────────────────────────────

/** Threshold above which a single execution field auto-truncates. */
const EXECUTION_FIELD_TRUNCATE_THRESHOLD = 60_000;
/** Size of the auto-truncated prefix returned in the first response. */
const EXECUTION_FIELD_FIRST_CHUNK = 50_000;

/**
 * Apply tail slicing: return only the last N lines of a string. If the input
 * has fewer than N lines, returns the whole string unchanged.
 */
function tailLines(text: string, n: number): string {
  if (!text) return text;
  const lines = text.split(/\r?\n/);
  if (lines.length <= n) return text;
  return lines.slice(-n).join('\n');
}

/**
 * Build the "truncated field + fetch hint" shape for a large execution field.
 * The agent sees enough of the content to decide whether to keep fetching,
 * plus an explicit instruction on which fetch_execution_chunk call to make.
 */
function truncateWithHint(
  field: 'responseBody' | 'logs' | 'errors',
  value: string,
  functionId: string,
  executionId: string
): {
  value: string;
  truncated: boolean;
  total?: number;
  hint?: string;
} {
  if (!value || value.length <= EXECUTION_FIELD_TRUNCATE_THRESHOLD) {
    return { value: value ?? '', truncated: false };
  }
  return {
    value: value.slice(0, EXECUTION_FIELD_FIRST_CHUNK),
    truncated: true,
    total: value.length,
    hint:
      `Field '${field}' is ${value.length} chars — truncated to first ${EXECUTION_FIELD_FIRST_CHUNK}. ` +
      `Call fetch_execution_chunk(functionId='${functionId}', executionId='${executionId}', ` +
      `field='${field}', offset=${EXECUTION_FIELD_FIRST_CHUNK}) for the next chunk.`,
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
  activationTimeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Max ms to wait for the new deployment to reach status=ready before activating. Default 600000 (10 min).'),
  activationIntervalMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Poll interval (ms) while waiting for the build. Default 3000.'),
});

/**
 * Schema for deploy_functions - Pipelined batch deploy of multiple functions
 */
const deployFunctionsSchema = z.object({
  functionIds: z
    .array(z.string().min(1))
    .optional()
    .describe('Function $ids to deploy. Omit (or set deployAll=true) to deploy every function declared in the loaded YAML config.'),
  deployAll: z
    .boolean()
    .optional()
    .default(false)
    .describe('When true (or when functionIds is omitted), deploy every function declared in the loaded YAML config.'),
  buildConcurrency: z
    .number()
    .int()
    .positive()
    .max(20)
    .optional()
    .describe('Max concurrent wait-for-build+activate tasks. Uploads always serialize. Default 5.'),
  activationTimeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Max ms to wait for any single deployment to reach status=ready. Default 600000 (10 min).'),
  activationIntervalMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Poll interval (ms) while waiting for builds. Default 3000.'),
  prebuilt: z
    .boolean()
    .optional()
    .describe(
      "When true, force every function in this batch into prebuilt mode: run each function's `commands` LOCALLY before tarring, ship the resulting build artifacts inside the tarball, and tell Appwrite to skip its build step. Bypasses Appwrite's build container entirely so private GitHub deps don't need an installation/GitHub token on Appwrite. Per-function `prebuilt: true` in the YAML config still applies when this flag is omitted."
    ),
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
  queries: z.array(z.string()).optional().describe('Array of Appwrite Query strings. Filter on trigger, status, responseStatusCode, duration, requestMethod, requestPath, deploymentId.' + QUERY_HELP_SUFFIX),
  search: z.string().max(256).optional().describe('Free-text search string (max 256 chars). Encoded as a Query.search filter against requestPath.'),
});

/**
 * Schema for get_execution - Requires functionId + executionId
 */
const getExecutionSchema = z.object({
  functionId: z.string().min(1, 'Function ID is required'),
  executionId: z.string().min(1, 'Execution ID is required'),
  excludeResponseBody: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Drop the responseBody field from the response. Most common overflow trigger ' +
        '(responseBody can be ~1MB). Set true when you only need metadata/logs/errors/headers.'
    ),
});

/**
 * Schema for get_execution_logs - Requires functionId + executionId, optional tail
 */
const getExecutionLogsSchema = z.object({
  functionId: z.string().min(1, 'Function ID is required'),
  executionId: z.string().min(1, 'Execution ID is required'),
  tail: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Return only the last N lines of logs and errors. Useful when each field ' +
        'is near the 4KB Appwrite cap and you only want the failure tail.'
    ),
});

/**
 * Schema for fetch_execution_chunk - Pull a slice of one large execution field.
 *
 * Pagination primitive for execution payloads that exceed the MCP result cap.
 * When `get_execution` or `get_execution_logs` truncates a field, it includes
 * a hint pointing at this tool with the right offset.
 */
const fetchExecutionChunkSchema = z.object({
  functionId: z.string().min(1, 'Function ID is required'),
  executionId: z.string().min(1, 'Execution ID is required'),
  field: z
    .enum(['responseBody', 'logs', 'errors'])
    .describe('Which large field to slice.'),
  offset: z
    .number()
    .int()
    .nonnegative()
    .default(0)
    .describe('Byte offset to start reading from. Default 0.'),
  length: z
    .number()
    .int()
    .positive()
    .default(50_000)
    .describe('Max bytes to return in this chunk. Default 50_000.'),
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
  queries: z.array(z.string()).optional().describe('Array of Appwrite Query strings. Filter on attributes such as size, buildDuration, status, activate, type, entrypoint, commands.' + QUERY_HELP_SUFFIX),
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
    .describe('Array of Appwrite Query strings.' + QUERY_HELP_SUFFIX),
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

/**
 * Schema for delete_function - Requires functionId
 */
const deleteFunctionSchema = z.object({
  functionId: z.string().min(1, 'Function ID is required'),
});

/**
 * Schema for upsert_function_variable - upsert a single variable by key
 */
const upsertFunctionVariableSchema = z.object({
  functionId: z.string().min(1, 'Function ID is required'),
  key: z
    .string()
    .min(1, 'Variable key is required')
    .max(255, 'Variable key must be 255 chars or fewer'),
  value: z.string().describe('Variable value. Max length: 8192 chars.'),
  secret: z
    .boolean()
    .optional()
    .describe('Whether to mark the variable as secret. Once secret, the value is never returned by the API.'),
});

/**
 * Schema for upsert_function_variables - bulk upsert by key
 */
const upsertFunctionVariablesSchema = z.object({
  functionId: z.string().min(1, 'Function ID is required'),
  variables: z
    .array(
      z.object({
        key: z.string().min(1).max(255),
        value: z.string(),
        secret: z.boolean().optional(),
      })
    )
    .min(1, 'At least one variable is required')
    .describe('Variables to upsert (matched by key). Existing keys are updated, new keys are created.'),
});

/**
 * Schema for delete_function_variables - bulk delete by id and/or key
 */
const deleteFunctionVariablesSchema = z
  .object({
    functionId: z.string().min(1, 'Function ID is required'),
    variableIds: z
      .array(z.string().min(1))
      .optional()
      .describe('Variable IDs to delete.'),
    keys: z
      .array(z.string().min(1))
      .optional()
      .describe('Variable keys to delete (resolved to IDs via a single list call). Unknown keys are skipped.'),
  })
  .refine((v) => (v.variableIds?.length ?? 0) + (v.keys?.length ?? 0) > 0, {
    message: 'Provide at least one of variableIds or keys.',
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
      searchPaths: [context.authResolver.getEffectiveConfigDir()],
      verbose: false,
    });

    if (!foundPath) {
      throw new Error(
        `Could not find function directory for "${fn.name}". Please provide the path parameter.`
      );
    }

    functionPath = foundPath;
  }

  // Prefer the local YAML entry for this function so spec/scope/schedule/
  // env-affecting fields get pushed on deploy (matching the CLI's
  // deployLocalFunction behavior). Fall back to a remote-derived config
  // if no YAML entry matches this $id.
  let localConfig: AppwriteFunction | undefined;
  try {
    const configManager = ConfigManager.getInstance();
    if (!configManager.hasConfig()) {
      await configManager.loadConfig({ validate: false, reportValidation: false });
    }
    const config = configManager.getConfig();
    localConfig = (config.functions ?? []).find((f) => f?.$id === validated.functionId);
  } catch (error) {
    MessageFormatter.warning(
      `Could not load local AppwriteConfig: ${error instanceof Error ? error.message : String(error)}. ` +
        `Falling back to remote-derived function config; spec/scope/schedule changes from local YAML will NOT be applied.`,
      { prefix: 'Functions' }
    );
  }

  if (!localConfig) {
    MessageFormatter.warning(
      `No local YAML entry found for function $id '${validated.functionId}'. ` +
        `Falling back to remote-derived config; spec/scope/schedule changes from local YAML will NOT be applied.`,
      { prefix: 'Functions' }
    );
  }

  const functionConfig: AppwriteFunction = localConfig
    ? {
        ...localConfig,
        entrypoint: validated.entrypoint || localConfig.entrypoint,
        commands: validated.commands || localConfig.commands,
      }
    : ({
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
      } as unknown as AppwriteFunction);

  // Build deployment options
  const deploymentOptions = {
    activate: validated.activate,
    entrypoint: validated.entrypoint,
    commands: validated.commands,
    verbose: false,
    pollOptions:
      validated.activationTimeoutMs !== undefined || validated.activationIntervalMs !== undefined
        ? { timeoutMs: validated.activationTimeoutMs, intervalMs: validated.activationIntervalMs }
        : undefined,
  };

  // Deploy the function
  const deployment: any = await functionManager.deployFunction(
    functionConfig,
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
 * Pipelined batch deploy: uploads each requested function sequentially,
 * but kicks off wait-for-build+activate concurrently (bounded by
 * buildConcurrency, default 5). One failed build does not abort the
 * batch — all results are returned in the response.
 */
async function handleDeployFunctions(
  input: unknown,
  context: ToolContext
): Promise<{
  success: boolean;
  totalRequested: number;
  totalReady: number;
  totalFailed: number;
  results: Array<{
    functionId: string;
    functionName: string;
    status: 'ready' | 'failed';
    deploymentId?: string;
    durationMs: number;
    error?: string;
  }>;
}> {
  const validated = deployFunctionsSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const functionManager = new FunctionManager(client);

  // Load local YAML config so we can deploy with the local spec/scope/
  // schedule fields (matches deploy_function semantics). Required for
  // batch — if there is no local config, we have nothing to deploy.
  const configManager = ConfigManager.getInstance();
  if (!configManager.hasConfig()) {
    await configManager.loadConfig({ validate: false, reportValidation: false });
  }
  const config = configManager.getConfig();
  const allLocal: AppwriteFunction[] = (config.functions ?? []).filter(
    (f): f is AppwriteFunction => !!f && typeof f.$id === 'string'
  );

  if (allLocal.length === 0) {
    throw new Error(
      'No functions found in local YAML config. deploy_functions requires the loaded AppwriteConfig to contain a functions[] list.'
    );
  }

  const requestedIds = validated.functionIds && validated.functionIds.length > 0
    ? validated.functionIds
    : undefined;

  const selected: AppwriteFunction[] = requestedIds
    ? requestedIds.map((id) => {
        const match = allLocal.find((f) => f.$id === id);
        if (!match) {
          throw new Error(
            `Function $id "${id}" not found in local YAML config. Available: ${allLocal.map((f) => f.$id).join(', ') || '<none>'}`
          );
        }
        return match;
      })
    : allLocal;

  // Resolve a code directory for each function.
  const items: Array<{
    functionConfig: AppwriteFunction;
    functionPath: string;
    options?: { prebuilt?: boolean };
  }> = [];
  const earlyFailures: BatchDeployResult[] = [];
  // Batch-level prebuilt forces every item into prebuilt mode. Per-function
  // YAML `prebuilt: true` still applies when this is omitted.
  const batchPrebuilt = validated.prebuilt === true ? { prebuilt: true } : undefined;
  for (const fnCfg of selected) {
    try {
      const foundPath = await functionManager.findFunctionDirectory(fnCfg.name, {
        searchPaths: [context.authResolver.getEffectiveConfigDir()],
        verbose: false,
      });
      if (!foundPath) {
        throw new Error(
          `Could not find function directory for "${fnCfg.name}" (id ${fnCfg.$id}). Place the source under <configDir>/functions/<name>/ or pre-set dirPath in the YAML.`
        );
      }
      items.push({
        functionConfig: fnCfg,
        functionPath: foundPath,
        options: batchPrebuilt,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      earlyFailures.push({
        functionName: fnCfg.name,
        functionId: fnCfg.$id,
        status: 'failed',
        error: err,
        durationMs: 0,
      });
    }
  }

  const pollOptions =
    validated.activationTimeoutMs !== undefined || validated.activationIntervalMs !== undefined
      ? { timeoutMs: validated.activationTimeoutMs, intervalMs: validated.activationIntervalMs }
      : undefined;

  const batchResults = await functionManager.deployFunctionsBatch(items, {
    buildConcurrency: validated.buildConcurrency,
    verbose: false,
    pollOptions,
  });

  const combined: BatchDeployResult[] = [...earlyFailures, ...batchResults];
  const ready = combined.filter((r) => r.status === 'ready').length;
  const failed = combined.length - ready;

  return {
    success: failed === 0,
    totalRequested: selected.length,
    totalReady: ready,
    totalFailed: failed,
    results: combined.map((r) => ({
      functionId: r.functionId,
      functionName: r.functionName,
      status: r.status,
      deploymentId: r.deploymentId,
      durationMs: r.durationMs,
      error: r.error?.message,
    })),
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
  const guarded = clampQueryLimit(normalizeQueries(validated.queries), { maxLimit: 100 });
  const result = await functionManager.listExecutions(
    validated.functionId,
    guarded.queries,
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
 *
 * Large string fields (`responseBody`, `logs`, `errors`) auto-truncate to
 * `EXECUTION_FIELD_FIRST_CHUNK` chars when they exceed `EXECUTION_FIELD_TRUNCATE_THRESHOLD`.
 * When truncation happens, the returned object gets sibling fields like
 * `responseBodyTruncated: true`, `responseBodyTotal: <full length>`, and a
 * `responseBodyFetchHint` string telling the agent exactly which
 * `fetch_execution_chunk` call to make. This prevents the MCP 90K result cap
 * from silently dropping payloads.
 */
async function handleGetExecution(
  input: unknown,
  context: ToolContext
): Promise<Record<string, unknown>> {
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

  const out: Record<string, unknown> = {
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
    duration: ex.duration,
    scheduledAt: ex.scheduledAt,
  };

  // responseBody — the most common overflow trigger. Optional drop via
  // excludeResponseBody, otherwise auto-truncate if oversized.
  if (!validated.excludeResponseBody) {
    const rb = truncateWithHint(
      'responseBody',
      ex.responseBody ?? '',
      validated.functionId,
      validated.executionId
    );
    out.responseBody = rb.value;
    if (rb.truncated) {
      out.responseBodyTruncated = true;
      out.responseBodyTotal = rb.total;
      out.responseBodyFetchHint = rb.hint;
    }
  }

  // logs and errors — auto-truncate too (defensive; Appwrite caps both at
  // ~4KB but this future-proofs if that ever changes).
  const logs = truncateWithHint(
    'logs',
    ex.logs ?? '',
    validated.functionId,
    validated.executionId
  );
  out.logs = logs.value;
  if (logs.truncated) {
    out.logsTruncated = true;
    out.logsTotal = logs.total;
    out.logsFetchHint = logs.hint;
  }

  const errors = truncateWithHint(
    'errors',
    ex.errors ?? '',
    validated.functionId,
    validated.executionId
  );
  out.errors = errors.value;
  if (errors.truncated) {
    out.errorsTruncated = true;
    out.errorsTotal = errors.total;
    out.errorsFetchHint = errors.hint;
  }

  return out;
}

/**
 * Get just the logs + errors for a single execution. Slim projection optimized
 * for failure triage — drops responseBody, headers, request method/path which
 * are noise when you're trying to find out what crashed.
 *
 * Appwrite caps `logs` and `errors` at the last 4000 chars each, and only
 * populates them when the request was authenticated with an API key (not a
 * session cookie). If they come back empty, double-check the auth method.
 */
async function handleGetExecutionLogs(
  input: unknown,
  context: ToolContext
): Promise<Record<string, unknown>> {
  const validated = getExecutionLogsSchema.parse(input);

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

  // Apply tail slicing BEFORE truncation so `tail` doesn't fight `auto-truncate`.
  let logsStr = ex.logs ?? '';
  let errorsStr = ex.errors ?? '';
  if (validated.tail !== undefined) {
    logsStr = tailLines(logsStr, validated.tail);
    errorsStr = tailLines(errorsStr, validated.tail);
  }

  const logs = truncateWithHint('logs', logsStr, validated.functionId, validated.executionId);
  const errors = truncateWithHint('errors', errorsStr, validated.functionId, validated.executionId);

  const out: Record<string, unknown> = {
    $id: ex.$id,
    $createdAt: ex.$createdAt,
    status: ex.status,
    trigger: ex.trigger,
    duration: ex.duration,
    responseStatusCode: ex.responseStatusCode,
    scheduledAt: ex.scheduledAt,
    logs: logs.value,
    errors: errors.value,
  };
  if (logs.truncated) {
    out.logsTruncated = true;
    out.logsTotal = logs.total;
    out.logsFetchHint = logs.hint;
  }
  if (errors.truncated) {
    out.errorsTruncated = true;
    out.errorsTotal = errors.total;
    out.errorsFetchHint = errors.hint;
  }
  return out;
}

/**
 * Fetch a slice of a single large execution field. Pagination primitive that
 * the agent uses to walk past the MCP 90K result cap when `get_execution` or
 * `get_execution_logs` had to truncate. Always re-fetches the execution from
 * Appwrite (no MCP-side caching — keeps state simple, retry-safe, and
 * tolerant of executions that change mid-loop).
 */
async function handleFetchExecutionChunk(
  input: unknown,
  context: ToolContext
): Promise<{
  field: string;
  offset: number;
  length: number;
  total: number;
  content: string;
  hasMore: boolean;
}> {
  const validated = fetchExecutionChunkSchema.parse(input);

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
  const full: string = ex[validated.field] ?? '';
  const total = full.length;
  const start = Math.min(validated.offset, total);
  const end = Math.min(start + validated.length, total);
  const content = full.slice(start, end);

  return {
    field: validated.field,
    offset: start,
    length: end - start,
    total,
    content,
    hasMore: end < total,
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
  const guarded = clampQueryLimit(normalizeQueries(validated.queries), { maxLimit: 100 });
  const result = await functionManager.listDeployments(
    validated.functionId,
    guarded.queries,
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
  const guarded = clampQueryLimit(normalizeQueries(validated.queries), { maxLimit: 100 });
  const result = await functionManager.listVariables(
    validated.functionId,
    guarded.queries
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

/**
 * Delete a function and all its deployments/variables. Irreversible.
 */
async function handleDeleteFunction(
  input: unknown,
  context: ToolContext
): Promise<{ success: true }> {
  const validated = deleteFunctionSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const functionManager = new FunctionManager(client);
  await functionManager.deleteFunction(validated.functionId);

  return { success: true };
}

/**
 * Upsert a single function-scoped variable by key (update if present, else
 * create). Response redacts the value when secret=true.
 */
async function handleUpsertFunctionVariable(
  input: unknown,
  context: ToolContext
): Promise<FunctionVariableOut> {
  const validated = upsertFunctionVariableSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const functionManager = new FunctionManager(client);
  const variable = await functionManager.upsertVariable(
    validated.functionId,
    validated.key,
    validated.value,
    { secret: validated.secret }
  );

  return redactSecretValue(variable);
}

/**
 * Bulk upsert function-scoped variables by key. Response redacts secret values.
 */
async function handleUpsertFunctionVariables(
  input: unknown,
  context: ToolContext
): Promise<{ total: number; variables: FunctionVariableOut[] }> {
  const validated = upsertFunctionVariablesSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const functionManager = new FunctionManager(client);
  const variables = await functionManager.upsertVariables(
    validated.functionId,
    validated.variables
  );

  return {
    total: variables.length,
    variables: variables.map(redactSecretValue),
  };
}

/**
 * Bulk delete function-scoped variables by ID and/or key.
 */
async function handleDeleteFunctionVariables(
  input: unknown,
  context: ToolContext
): Promise<{ success: true; deleted: string[]; skipped: string[] }> {
  const validated = deleteFunctionVariablesSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const functionManager = new FunctionManager(client);
  const result = await functionManager.deleteVariables(validated.functionId, {
    variableIds: validated.variableIds,
    keys: validated.keys,
  });

  return { success: true, deleted: result.deleted, skipped: result.skipped };
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

const deployFunctionsTool: ToolDefinition = {
  name: 'deploy_functions',
  description:
    'Deploy multiple functions in a pipelined batch: uploads serialize one-at-a-time, but build-wait+activate runs concurrently across functions (default 5 in parallel). Pass functionIds to pick specific functions, or deployAll=true (or omit functionIds) to deploy every function in the loaded YAML config. Returns a per-function result array — one failed build does not abort the rest. Spec/scope/schedule/env-affecting fields are pushed from local YAML before each upload.',
  inputSchema: deployFunctionsSchema,
  handler: handleDeployFunctions,
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
    'List executions for a function. Returns a slim per-row projection ($id, status, trigger, responseStatusCode, duration, $createdAt, short errorExcerpt). Logs and full errors are intentionally NOT included — use get_execution_logs(functionId, executionId) for just logs/errors/status, or get_execution for the full payload (logs + responseBody + headers).',
  inputSchema: listExecutionsSchema,
  handler: handleListExecutions,
  requiresAuth: true,
};

const getExecutionTool: ToolDefinition = {
  name: 'get_execution',
  description:
    'Get a single function execution by ID — returns the FULL payload (logs, errors, responseBody, request/response headers, request method/path, duration, scheduledAt). For just logs + errors + status (smaller payload, better for failure triage), use get_execution_logs.',
  inputSchema: getExecutionSchema,
  handler: handleGetExecution,
  requiresAuth: true,
};

const getExecutionLogsTool: ToolDefinition = {
  name: 'get_execution_logs',
  description:
    'Get logs + errors for a single function execution. Returns a slim projection ($id, status, trigger, duration, responseStatusCode, scheduledAt, $createdAt, logs, errors) — drops responseBody and request/response headers. Optional `tail: N` returns only the last N lines of logs/errors. Fields that exceed ~60K chars auto-truncate to first 50K with a `*FetchHint` pointing at fetch_execution_chunk. Use this for failure triage. Appwrite caps logs/errors at the last 4000 chars each and only populates them when the request was authenticated with an API key.',
  inputSchema: getExecutionLogsSchema,
  handler: handleGetExecutionLogs,
  requiresAuth: true,
};

const fetchExecutionChunkTool: ToolDefinition = {
  name: 'fetch_execution_chunk',
  description:
    'Fetch a slice of one large execution field (responseBody, logs, or errors). Pagination primitive — when get_execution or get_execution_logs truncates a field (responseBody can be ~1MB), it emits a hint pointing at this tool with the right offset. Loop until hasMore=false, concatenating `content` chunks to reassemble the full field.',
  inputSchema: fetchExecutionChunkSchema,
  handler: handleFetchExecutionChunk,
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

const deleteFunctionTool: ToolDefinition = {
  name: 'delete_function',
  description:
    'Delete a function and all of its deployments and variables. Irreversible — the function ID stops resolving immediately.',
  inputSchema: deleteFunctionSchema,
  handler: handleDeleteFunction,
  requiresAuth: true,
};

const upsertFunctionVariableTool: ToolDefinition = {
  name: 'upsert_function_variable',
  description:
    'Upsert a per-function variable BY KEY: updates the existing variable with that key, or creates it if absent. Response redacts the value when secret=true.',
  inputSchema: upsertFunctionVariableSchema,
  handler: handleUpsertFunctionVariable,
  requiresAuth: true,
};

const upsertFunctionVariablesTool: ToolDefinition = {
  name: 'upsert_function_variables',
  description:
    'Bulk upsert per-function variables by key. Existing keys are updated, new keys are created. Response redacts secret values.',
  inputSchema: upsertFunctionVariablesSchema,
  handler: handleUpsertFunctionVariables,
  requiresAuth: true,
};

const deleteFunctionVariablesTool: ToolDefinition = {
  name: 'delete_function_variables',
  description:
    'Bulk delete per-function variables by variableIds and/or keys. Keys are resolved to IDs via a single list call; unknown keys are skipped (reported in `skipped`).',
  inputSchema: deleteFunctionVariablesSchema,
  handler: handleDeleteFunctionVariables,
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
    deployFunctionsTool,
    deployFunctionViaCliTool,
    listExecutionsTool,
    getExecutionTool,
    getExecutionLogsTool,
    fetchExecutionChunkTool,
    createExecutionTool,
    deleteExecutionTool,
    listDeploymentsTool,
    getDeploymentTool,
    createVcsDeploymentTool,
    deleteDeploymentTool,
    deleteFunctionTool,
    listFunctionVariablesTool,
    getFunctionVariableTool,
    createFunctionVariableTool,
    updateFunctionVariableTool,
    deleteFunctionVariableTool,
    upsertFunctionVariableTool,
    upsertFunctionVariablesTool,
    deleteFunctionVariablesTool,
  ],
};
