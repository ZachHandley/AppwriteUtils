/**
 * Project tools for MCP
 *
 * Exposes Appwrite project-level configuration as MCP tools. Specifically,
 * project variables, which inherit into every function in the project unless
 * overridden by a function-scoped variable.
 *
 * SECURITY: Variable values flagged `secret === true` are redacted to the
 * literal string `'<redacted>'` before being returned out of the MCP. Never
 * echo secret values through the MCP boundary.
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import { ProjectsManager } from 'appwrite-utils-helpers';
import type { ToolContext, ToolDefinition, ToolGroupDefinition } from '../ToolGroup.js';

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
    .describe('Array of Appwrite Query strings (see Query class).'),
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
  const result = await manager.listVariables(projectId, validated.queries);

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
    'Tools for managing Appwrite project-level configuration (project variables that inherit into every function)',
  tools: [
    listProjectVariablesTool,
    getProjectVariableTool,
    createProjectVariableTool,
    updateProjectVariableTool,
    deleteProjectVariableTool,
  ],
};
