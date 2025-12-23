/**
 * Users tools for MCP
 * @packageDocumentation
 */

import { z } from 'zod';
import { Users } from 'node-appwrite';
import type { ToolContext, ToolDefinition, ToolGroupDefinition } from '../ToolGroup.js';

// ──────────────────────────────────────────────────
// INPUT SCHEMAS
// ──────────────────────────────────────────────────

/**
 * Schema for list_users - Optional pagination and search
 */
const listUsersSchema = z.object({
  limit: z.number().int().positive().max(100).optional().describe('Maximum number of users to return (default: 25, max: 100)'),
  offset: z.number().int().nonnegative().optional().describe('Number of users to skip (default: 0)'),
  search: z.string().optional().describe('Search query to filter users by name, email, or phone'),
});

/**
 * Schema for get_user - Requires userId
 */
const getUserSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

/**
 * Schema for count_users - No required params
 */
const countUsersSchema = z.object({}).optional();

// ──────────────────────────────────────────────────
// TOOL HANDLERS
// ──────────────────────────────────────────────────

/**
 * List all users with optional pagination and search
 */
async function handleListUsers(
  input: unknown,
  context: ToolContext
): Promise<{ users: Array<{ id: string; name: string; email: string; phone?: string; status: boolean }>; total: number }> {
  const validated = listUsersSchema.parse(input);

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

  const users = new Users(client);

  // Build queries array for filtering
  const queries: string[] = [];

  if (validated.limit !== undefined) {
    queries.push(`limit(${validated.limit})`);
  }

  if (validated.offset !== undefined) {
    queries.push(`offset(${validated.offset})`);
  }

  if (validated.search) {
    queries.push(`search("${validated.search}")`);
  }

  const result = await users.list(queries.length > 0 ? queries : undefined);

  return {
    users: result.users.map((user) => ({
      id: user.$id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      status: user.status,
    })),
    total: result.total,
  };
}

/**
 * Get details for a specific user
 */
async function handleGetUser(
  input: unknown,
  context: ToolContext
): Promise<{
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: boolean;
  emailVerification: boolean;
  phoneVerification: boolean;
  registration: string;
  prefs: Record<string, any>;
}> {
  const validated = getUserSchema.parse(input);

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

  const users = new Users(client);
  const user = await users.get(validated.userId);

  return {
    id: user.$id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    emailVerification: user.emailVerification,
    phoneVerification: user.phoneVerification,
    registration: user.registration,
    prefs: user.prefs,
  };
}

/**
 * Get total count of users in the project
 */
async function handleCountUsers(
  input: unknown,
  context: ToolContext
): Promise<{ count: number }> {
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

  const users = new Users(client);

  // List with limit 1 to get total count efficiently
  const result = await users.list(['limit(1)']);

  return {
    count: result.total,
  };
}

// ──────────────────────────────────────────────────
// TOOL DEFINITIONS
// ──────────────────────────────────────────────────

const listUsersTool: ToolDefinition = {
  name: 'list_users',
  description: 'List all users in the Appwrite project with optional pagination and search filtering',
  inputSchema: listUsersSchema,
  handler: handleListUsers,
  requiresAuth: true,
};

const getUserTool: ToolDefinition = {
  name: 'get_user',
  description: 'Get detailed information about a specific user by their user ID',
  inputSchema: getUserSchema,
  handler: handleGetUser,
  requiresAuth: true,
};

const countUsersTool: ToolDefinition = {
  name: 'count_users',
  description: 'Get the total count of users in the Appwrite project',
  inputSchema: countUsersSchema || z.object({}),
  handler: handleCountUsers,
  requiresAuth: true,
};

// ──────────────────────────────────────────────────
// TOOL GROUP EXPORT
// ──────────────────────────────────────────────────

/**
 * Users tools group for MCP
 */
export const usersToolGroup: ToolGroupDefinition = {
  name: 'Users',
  flag: 'users',
  description: 'Tools for managing and querying Appwrite users',
  tools: [
    listUsersTool,
    getUserTool,
    countUsersTool,
  ],
};
