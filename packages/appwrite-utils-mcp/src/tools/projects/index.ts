/**
 * Project tools for MCP
 *
 * Exposes Appwrite project-level configuration as MCP tools. Covers:
 *  - Project variables (inherit into every function unless function-scoped)
 *  - Project webhooks (event delivery — works on cloud + self-hosted)
 *
 * SECURITY:
 *  - Variable values flagged `secret === true` are redacted at the boundary.
 *  - Webhook `httpPass` is ALWAYS redacted in tool output. Webhook
 *    `signatureKey` is only returned in clear on `create_webhook` and
 *    `rotate_webhook_signature` responses — the caller just minted/rotated
 *    it and needs to copy it once. On `list_webhooks` / `get_webhook`,
 *    `signatureKey` is redacted.
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import { ProjectsManager, WebhookManager } from 'appwrite-utils-helpers';
import type { Models } from 'node-appwrite';
import type { ToolContext, ToolDefinition, ToolGroupDefinition } from '../ToolGroup.js';
import { normalizeQueries } from '../../utils/queryNormalizer.js';

const QUERY_HELP_SUFFIX =
  ' Accepts SDK syntax like Query.limit(10) or limit(10), or JSON wire form. Call query_help for the full reference.';

// ──────────────────────────────────────────────────
// INPUT SCHEMAS
// ──────────────────────────────────────────────────

/**
 * Schema for list_project_variables
 */
const listProjectVariablesSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(
      'Optional project ID. Falls back to the authenticated context (AuthResolver: flags → env vars → .appwrite/config.yaml).'
    ),
  queries: z
    .array(z.string())
    .optional()
    .describe('Array of Appwrite Query strings.' + QUERY_HELP_SUFFIX),
});

/**
 * Schema for get_project_variable
 */
const getProjectVariableSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('Optional project ID. Falls back to the authenticated context.'),
  variableId: z.string().min(1, 'Variable ID is required'),
});

/**
 * Schema for create_project_variable
 */
const createProjectVariableSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('Optional project ID. Falls back to the authenticated context.'),
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
  variableId: z
    .string()
    .optional()
    .describe(
      'Optional custom variable ID. Auto-generated via ID.unique() when omitted.'
    ),
});

/**
 * Schema for update_project_variable
 */
const updateProjectVariableSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('Optional project ID. Falls back to the authenticated context.'),
  variableId: z.string().min(1, 'Variable ID is required'),
  key: z
    .string()
    .max(255, 'Variable key must be 255 chars or fewer')
    .optional(),
  value: z.string().optional().describe('New value. Max length: 8192 chars.'),
  secret: z
    .boolean()
    .optional()
    .describe('Toggle secret flag.'),
});

/**
 * Schema for delete_project_variable
 */
const deleteProjectVariableSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('Optional project ID. Falls back to the authenticated context.'),
  variableId: z.string().min(1, 'Variable ID is required'),
});

/**
 * Schema for upsert_project_variable - upsert a single variable by key
 */
const upsertProjectVariableSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('Optional project ID. Falls back to the authenticated context.'),
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
 * Schema for upsert_project_variables - bulk upsert by key
 */
const upsertProjectVariablesSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('Optional project ID. Falls back to the authenticated context.'),
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
 * Schema for delete_project_variables - bulk delete by id and/or key
 */
const deleteProjectVariablesSchema = z
  .object({
    projectId: z
      .string()
      .optional()
      .describe('Optional project ID. Falls back to the authenticated context.'),
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
// REDACTION HELPER
// ──────────────────────────────────────────────────

/**
 * Variable shape returned out of the MCP. Mirrors Models.Variable but
 * intentionally typed loosely so we can attach the redaction unconditionally.
 */
interface ProjectVariableOut {
  $id: string;
  key: string;
  value: string;
  secret: boolean;
  $createdAt: string;
}

/**
 * SECURITY-CRITICAL: redact the `value` field whenever `secret === true`.
 * This is the single chokepoint through which all project-variable payloads
 * must pass before leaving the MCP boundary.
 */
function redactSecretValue(variable: any): ProjectVariableOut {
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
// TOOL HANDLERS
// ──────────────────────────────────────────────────

/**
 * Resolve the target project ID — argument first, then auth context.
 */
function resolveProjectId(
  argProjectId: string | undefined,
  credsProjectId: string | undefined
): string {
  const resolved = argProjectId ?? credsProjectId;
  if (!resolved) {
    throw new Error(
      'No projectId provided and none resolved from auth context. Pass projectId arg or configure APPWRITE_PROJECT_ID.'
    );
  }
  return resolved;
}

/**
 * List all project variables (with secret values redacted).
 */
async function handleListProjectVariables(
  input: unknown,
  context: ToolContext
): Promise<{
  total: number;
  variables: ProjectVariableOut[];
}> {
  const validated = listProjectVariablesSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const projectId = resolveProjectId(
    validated.projectId,
    authResult.credentials.projectId
  );

  const manager = new ProjectsManager(client);
  const result = await manager.listVariables(projectId, normalizeQueries(validated.queries));

  return {
    total: result.total,
    // SECURITY: redact secret values before returning.
    variables: result.variables.map(redactSecretValue),
  };
}

/**
 * Get a single project variable by ID (with secret values redacted).
 */
async function handleGetProjectVariable(
  input: unknown,
  context: ToolContext
): Promise<ProjectVariableOut> {
  const validated = getProjectVariableSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const projectId = resolveProjectId(
    validated.projectId,
    authResult.credentials.projectId
  );

  const manager = new ProjectsManager(client);
  const variable = await manager.getVariable(projectId, validated.variableId);

  // SECURITY: redact secret value before returning.
  return redactSecretValue(variable);
}

/**
 * Create a new project variable (with secret values redacted in the response).
 */
async function handleCreateProjectVariable(
  input: unknown,
  context: ToolContext
): Promise<ProjectVariableOut> {
  const validated = createProjectVariableSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const projectId = resolveProjectId(
    validated.projectId,
    authResult.credentials.projectId
  );

  const manager = new ProjectsManager(client);
  const variable = await manager.createVariable(
    projectId,
    validated.key,
    validated.value,
    {
      secret: validated.secret,
      variableId: validated.variableId,
    }
  );

  // SECURITY: redact secret value before returning.
  return redactSecretValue(variable);
}

/**
 * Update an existing project variable (with secret values redacted in the
 * response).
 */
async function handleUpdateProjectVariable(
  input: unknown,
  context: ToolContext
): Promise<ProjectVariableOut> {
  const validated = updateProjectVariableSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const projectId = resolveProjectId(
    validated.projectId,
    authResult.credentials.projectId
  );

  const manager = new ProjectsManager(client);
  const variable = await manager.updateVariable(
    projectId,
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
 * Delete a project variable by ID.
 */
async function handleDeleteProjectVariable(
  input: unknown,
  context: ToolContext
): Promise<{ success: true }> {
  const validated = deleteProjectVariableSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const projectId = resolveProjectId(
    validated.projectId,
    authResult.credentials.projectId
  );

  const manager = new ProjectsManager(client);
  await manager.deleteVariable(projectId, validated.variableId);

  return { success: true };
}

/**
 * Upsert a single project variable by key (update if present, else create).
 */
async function handleUpsertProjectVariable(
  input: unknown,
  context: ToolContext
): Promise<ProjectVariableOut> {
  const validated = upsertProjectVariableSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const projectId = resolveProjectId(validated.projectId, authResult.credentials.projectId);
  const manager = new ProjectsManager(client);
  const variable = await manager.upsertVariable(projectId, validated.key, validated.value, {
    secret: validated.secret,
  });

  return redactSecretValue(variable);
}

/**
 * Bulk upsert project variables by key.
 */
async function handleUpsertProjectVariables(
  input: unknown,
  context: ToolContext
): Promise<{ total: number; variables: ProjectVariableOut[] }> {
  const validated = upsertProjectVariablesSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const projectId = resolveProjectId(validated.projectId, authResult.credentials.projectId);
  const manager = new ProjectsManager(client);
  const variables = await manager.upsertVariables(projectId, validated.variables);

  return {
    total: variables.length,
    variables: variables.map(redactSecretValue),
  };
}

/**
 * Bulk delete project variables by ID and/or key.
 */
async function handleDeleteProjectVariables(
  input: unknown,
  context: ToolContext
): Promise<{ success: true; deleted: string[]; skipped: string[] }> {
  const validated = deleteProjectVariablesSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const projectId = resolveProjectId(validated.projectId, authResult.credentials.projectId);
  const manager = new ProjectsManager(client);
  const result = await manager.deleteVariables(projectId, {
    variableIds: validated.variableIds,
    keys: validated.keys,
  });

  return { success: true, deleted: result.deleted, skipped: result.skipped };
}

// ──────────────────────────────────────────────────
// TOOL DEFINITIONS
// ──────────────────────────────────────────────────

const listProjectVariablesTool: ToolDefinition = {
  name: 'list_project_variables',
  description:
    'List all project-level variables (which inherit into every function). Values of secret variables are returned as "<redacted>".',
  inputSchema: listProjectVariablesSchema,
  handler: handleListProjectVariables,
  requiresAuth: true,
};

const getProjectVariableTool: ToolDefinition = {
  name: 'get_project_variable',
  description:
    'Get a single project-level variable by ID. The value of a secret variable is returned as "<redacted>".',
  inputSchema: getProjectVariableSchema,
  handler: handleGetProjectVariable,
  requiresAuth: true,
};

const createProjectVariableTool: ToolDefinition = {
  name: 'create_project_variable',
  description:
    'Create a new project-level variable. The variable inherits into every function unless overridden by a function-scoped variable. variableId is auto-generated when omitted. Response redacts the value when secret=true.',
  inputSchema: createProjectVariableSchema,
  handler: handleCreateProjectVariable,
  requiresAuth: true,
};

const updateProjectVariableTool: ToolDefinition = {
  name: 'update_project_variable',
  description:
    'Update an existing project-level variable. All fields except variableId are optional. Response redacts the value when secret=true.',
  inputSchema: updateProjectVariableSchema,
  handler: handleUpdateProjectVariable,
  requiresAuth: true,
};

const deleteProjectVariableTool: ToolDefinition = {
  name: 'delete_project_variable',
  description: 'Delete a project-level variable by ID.',
  inputSchema: deleteProjectVariableSchema,
  handler: handleDeleteProjectVariable,
  requiresAuth: true,
};

const upsertProjectVariableTool: ToolDefinition = {
  name: 'upsert_project_variable',
  description:
    'Upsert a project-level variable BY KEY: updates the existing variable with that key, or creates it if absent. Response redacts the value when secret=true.',
  inputSchema: upsertProjectVariableSchema,
  handler: handleUpsertProjectVariable,
  requiresAuth: true,
};

const upsertProjectVariablesTool: ToolDefinition = {
  name: 'upsert_project_variables',
  description:
    'Bulk upsert project-level variables by key. Existing keys are updated, new keys are created. Response redacts secret values.',
  inputSchema: upsertProjectVariablesSchema,
  handler: handleUpsertProjectVariables,
  requiresAuth: true,
};

const deleteProjectVariablesTool: ToolDefinition = {
  name: 'delete_project_variables',
  description:
    'Bulk delete project-level variables by variableIds and/or keys. Keys are resolved to IDs via a single list call; unknown keys are skipped (reported in `skipped`).',
  inputSchema: deleteProjectVariablesSchema,
  handler: handleDeleteProjectVariables,
  requiresAuth: true,
};

// ──────────────────────────────────────────────────
// WEBHOOK SCHEMAS
// ──────────────────────────────────────────────────

const listWebhooksSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(
      'Optional project ID. Falls back to the authenticated context.'
    ),
  queries: z
    .array(z.string())
    .optional()
    .describe(
      'Array of Appwrite Query strings. Filterable on: name, url, httpUser, security, events, enabled, logs, attempts.' +
        QUERY_HELP_SUFFIX
    ),
});

const getWebhookSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('Optional project ID. Falls back to the authenticated context.'),
  webhookId: z.string().min(1, 'Webhook ID is required'),
});

const createWebhookSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('Optional project ID. Falls back to the authenticated context.'),
  name: z
    .string()
    .min(1, 'Webhook name is required')
    .max(128, 'Webhook name must be 128 chars or fewer'),
  url: z.string().url('Webhook URL must be a valid URL'),
  events: z
    .array(z.string().min(1))
    .min(1, 'At least one event is required')
    .max(100, 'Max 100 events per webhook')
    .describe(
      'Appwrite event strings (e.g. "databases.*.collections.*.documents.*.create"). Max 100.'
    ),
  enabled: z
    .boolean()
    .optional()
    .describe('Enable the webhook immediately. Default: server-side (typically true).'),
  security: z
    .boolean()
    .optional()
    .describe(
      'SSL/TLS certificate verification for the webhook URL. Default: server-side (typically true). Disable only for self-signed dev endpoints.'
    ),
  httpUser: z
    .string()
    .max(256, 'httpUser must be 256 chars or fewer')
    .optional()
    .describe('Optional HTTP basic-auth username for webhook delivery.'),
  httpPass: z
    .string()
    .max(256, 'httpPass must be 256 chars or fewer')
    .optional()
    .describe(
      'Optional HTTP basic-auth password for webhook delivery. Always redacted in tool output.'
    ),
  webhookId: z
    .string()
    .optional()
    .describe('Optional custom webhook ID. Auto-generated via ID.unique() when omitted.'),
});

const updateWebhookSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('Optional project ID. Falls back to the authenticated context.'),
  webhookId: z.string().min(1, 'Webhook ID is required'),
  name: z
    .string()
    .max(128, 'Webhook name must be 128 chars or fewer')
    .optional(),
  url: z.string().url('Webhook URL must be a valid URL').optional(),
  events: z
    .array(z.string().min(1))
    .max(100, 'Max 100 events per webhook')
    .optional(),
  enabled: z.boolean().optional(),
  security: z.boolean().optional(),
  httpUser: z
    .string()
    .max(256, 'httpUser must be 256 chars or fewer')
    .optional(),
  httpPass: z
    .string()
    .max(256, 'httpPass must be 256 chars or fewer')
    .optional()
    .describe('New HTTP basic-auth password. Always redacted in tool output.'),
});

const deleteWebhookSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('Optional project ID. Falls back to the authenticated context.'),
  webhookId: z.string().min(1, 'Webhook ID is required'),
});

const rotateWebhookSignatureSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('Optional project ID. Falls back to the authenticated context.'),
  webhookId: z.string().min(1, 'Webhook ID is required'),
});

// ──────────────────────────────────────────────────
// WEBHOOK REDACTION
// ──────────────────────────────────────────────────

/**
 * Webhook shape returned out of the MCP. Mirrors Models.Webhook with the
 * sensitive fields turned into booleans + an opt-in `signatureKey` slot for
 * the create / rotate paths where the caller needs the freshly-minted value.
 */
interface WebhookOut {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  security: boolean;
  hasHttpUser: boolean;
  hasHttpPass: boolean;
  hasSignatureKey: boolean;
  /**
   * Only populated by `create_webhook` and `rotate_webhook_signature`
   * responses — the caller just minted it and needs to copy it. Always
   * absent from `list_webhooks` and `get_webhook`.
   */
  signatureKey?: string;
}

/**
 * SECURITY-CRITICAL: this is the single chokepoint through which webhook
 * payloads pass before leaving the MCP boundary. `httpPass` is dropped
 * everywhere; `signatureKey` is dropped except on create / rotate paths
 * where `revealSignatureKey` is explicitly opted into.
 *
 * @internal Exported only for unit tests.
 */
export function _redactWebhookForTest(
  webhook: Models.Webhook,
  options: { revealSignatureKey?: boolean } = {}
): WebhookOut {
  return redactWebhook(webhook, options);
}

function redactWebhook(
  webhook: Models.Webhook,
  options: { revealSignatureKey?: boolean } = {}
): WebhookOut {
  const out: WebhookOut = {
    $id: webhook.$id,
    $createdAt: webhook.$createdAt,
    $updatedAt: webhook.$updatedAt,
    name: webhook.name,
    url: webhook.url,
    events: webhook.events,
    enabled: webhook.enabled,
    security: webhook.security,
    hasHttpUser: !!webhook.httpUser,
    hasHttpPass: !!webhook.httpPass,
    hasSignatureKey: !!webhook.signatureKey,
  };
  if (options.revealSignatureKey && webhook.signatureKey) {
    out.signatureKey = webhook.signatureKey;
  }
  return out;
}

// ──────────────────────────────────────────────────
// WEBHOOK HANDLERS
// ──────────────────────────────────────────────────

/**
 * Wrap an SDK call and surface a friendlier error when the Appwrite server
 * appears to lack the endpoint (older self-hosted releases, or pruned
 * deployments). 404s in the wild also come from "webhook does not exist" —
 * we only rewrite the error when the underlying path is the collection root
 * (`/webhooks`), not a specific webhook ID.
 */
async function callWebhookEndpoint<T>(
  fn: () => Promise<T>,
  hint: string
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const e = err as { code?: number; type?: string; message?: string };
    if (e?.code === 404 && /not\s*found/i.test(e?.message ?? '') && /webhook/i.test(hint) && /collection|list/i.test(hint)) {
      throw new Error(
        `${hint} returned 404. The /webhooks endpoint may not exist on this Appwrite release (older self-hosted versions ship without it). Upgrade Appwrite or switch to Appwrite Cloud.`
      );
    }
    throw err;
  }
}

async function handleListWebhooks(
  input: unknown,
  context: ToolContext
): Promise<{ total: number; webhooks: WebhookOut[] }> {
  const validated = listWebhooksSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const projectId = resolveProjectId(
    validated.projectId,
    authResult.credentials.projectId
  );

  const manager = new WebhookManager(client);
  const result = await callWebhookEndpoint(
    () => manager.listWebhooks(projectId, normalizeQueries(validated.queries)),
    'list_webhooks (collection)'
  );

  return {
    total: result.total,
    webhooks: result.webhooks.map((w) => redactWebhook(w)),
  };
}

async function handleGetWebhook(
  input: unknown,
  context: ToolContext
): Promise<WebhookOut> {
  const validated = getWebhookSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const projectId = resolveProjectId(
    validated.projectId,
    authResult.credentials.projectId
  );

  const manager = new WebhookManager(client);
  const webhook = await manager.getWebhook(projectId, validated.webhookId);
  return redactWebhook(webhook);
}

async function handleCreateWebhook(
  input: unknown,
  context: ToolContext
): Promise<WebhookOut> {
  const validated = createWebhookSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const projectId = resolveProjectId(
    validated.projectId,
    authResult.credentials.projectId
  );

  const manager = new WebhookManager(client);
  const webhook = await callWebhookEndpoint(
    () =>
      manager.createWebhook(projectId, validated.name, validated.url, validated.events, {
        webhookId: validated.webhookId,
        enabled: validated.enabled,
        security: validated.security,
        httpUser: validated.httpUser,
        httpPass: validated.httpPass,
      }),
    'create_webhook (collection)'
  );

  // Reveal the freshly-minted signature key once — the caller needs it to
  // verify incoming webhook payloads. Subsequent get/list calls redact it.
  return redactWebhook(webhook, { revealSignatureKey: true });
}

async function handleUpdateWebhook(
  input: unknown,
  context: ToolContext
): Promise<WebhookOut> {
  const validated = updateWebhookSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const projectId = resolveProjectId(
    validated.projectId,
    authResult.credentials.projectId
  );

  const manager = new WebhookManager(client);
  const webhook = await manager.updateWebhook(projectId, validated.webhookId, {
    name: validated.name,
    url: validated.url,
    events: validated.events,
    enabled: validated.enabled,
    security: validated.security,
    httpUser: validated.httpUser,
    httpPass: validated.httpPass,
  });

  return redactWebhook(webhook);
}

async function handleDeleteWebhook(
  input: unknown,
  context: ToolContext
): Promise<{ success: true }> {
  const validated = deleteWebhookSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const projectId = resolveProjectId(
    validated.projectId,
    authResult.credentials.projectId
  );

  const manager = new WebhookManager(client);
  await manager.deleteWebhook(projectId, validated.webhookId);
  return { success: true };
}

async function handleRotateWebhookSignature(
  input: unknown,
  context: ToolContext
): Promise<WebhookOut> {
  const validated = rotateWebhookSignatureSchema.parse(input);

  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const projectId = resolveProjectId(
    validated.projectId,
    authResult.credentials.projectId
  );

  const manager = new WebhookManager(client);
  const webhook = await manager.rotateSignature(projectId, validated.webhookId);

  // Reveal the freshly-rotated key once — the caller needs it to update any
  // downstream signature verification. Subsequent get/list redact it again.
  return redactWebhook(webhook, { revealSignatureKey: true });
}

// ──────────────────────────────────────────────────
// WEBHOOK TOOL DEFINITIONS
// ──────────────────────────────────────────────────

const listWebhooksTool: ToolDefinition = {
  name: 'list_webhooks',
  description:
    'List all webhooks configured for the project. Available on cloud + self-hosted. httpPass and signatureKey are redacted in the response (booleans `hasHttpPass` / `hasSignatureKey` indicate presence).',
  inputSchema: listWebhooksSchema,
  handler: handleListWebhooks,
  requiresAuth: true,
};

const getWebhookTool: ToolDefinition = {
  name: 'get_webhook',
  description:
    'Get a single webhook by ID. httpPass and signatureKey are redacted in the response.',
  inputSchema: getWebhookSchema,
  handler: handleGetWebhook,
  requiresAuth: true,
};

const createWebhookTool: ToolDefinition = {
  name: 'create_webhook',
  description:
    'Create a new webhook. Returns the freshly-minted `signatureKey` UNREDACTED in this response (one-time) — copy it now to verify incoming webhook payloads. Subsequent get/list calls redact it.',
  inputSchema: createWebhookSchema,
  handler: handleCreateWebhook,
  requiresAuth: true,
};

const updateWebhookTool: ToolDefinition = {
  name: 'update_webhook',
  description:
    'Update an existing webhook. Missing required fields (name/url/events) are read from the current webhook and re-sent so this behaves as a true partial update. httpPass and signatureKey are redacted in the response.',
  inputSchema: updateWebhookSchema,
  handler: handleUpdateWebhook,
  requiresAuth: true,
};

const deleteWebhookTool: ToolDefinition = {
  name: 'delete_webhook',
  description:
    'Delete a webhook by ID. The project stops emitting events to the webhook URL immediately.',
  inputSchema: deleteWebhookSchema,
  handler: handleDeleteWebhook,
  requiresAuth: true,
};

const rotateWebhookSignatureTool: ToolDefinition = {
  name: 'rotate_webhook_signature',
  description:
    'Rotate the webhook signature key. Returns the new `signatureKey` UNREDACTED in this response (one-time) — copy it now and update any downstream signature verification. The previous key stops working immediately.',
  inputSchema: rotateWebhookSignatureSchema,
  handler: handleRotateWebhookSignature,
  requiresAuth: true,
};

// ──────────────────────────────────────────────────
// TOOL GROUP EXPORT
// ──────────────────────────────────────────────────

/**
 * Projects tools group for MCP.
 */
export const projectsToolGroup: ToolGroupDefinition = {
  name: 'Projects',
  flag: 'projects',
  description:
    'Tools for managing Appwrite project-level configuration: project variables (inherit into every function) and project webhooks (event delivery).',
  tools: [
    listProjectVariablesTool,
    getProjectVariableTool,
    createProjectVariableTool,
    updateProjectVariableTool,
    deleteProjectVariableTool,
    upsertProjectVariableTool,
    upsertProjectVariablesTool,
    deleteProjectVariablesTool,
    listWebhooksTool,
    getWebhookTool,
    createWebhookTool,
    updateWebhookTool,
    deleteWebhookTool,
    rotateWebhookSignatureTool,
  ],
};
