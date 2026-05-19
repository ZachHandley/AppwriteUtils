/**
 * Users tools for MCP
 * @packageDocumentation
 */

import { z } from 'zod';
import type { Models } from 'node-appwrite';
import type { ToolContext, ToolDefinition, ToolGroupDefinition } from '../ToolGroup.js';
import { UsersManager } from 'appwrite-utils-helpers';
import { normalizeQueries } from '../../utils/queryNormalizer.js';
import { clampQueryLimit } from '../../utils/clampQueryLimit.js';

const QUERY_HELP_SUFFIX =
  ' Accepts SDK syntax like Query.limit(10) or limit(10), or JSON wire form. Call query_help for the full reference.';

// ──────────────────────────────────────────────────
// INPUT SCHEMAS
// ──────────────────────────────────────────────────

const listUsersSchema = z.object({
  queries: z
    .array(z.string())
    .optional()
    .describe(
      'Array of Appwrite Query strings. Filter on name, email, phone, status, passwordUpdate, registration, emailVerification, phoneVerification, labels, impersonator.' +
        QUERY_HELP_SUFFIX
    ),
  search: z.string().max(256).optional().describe('Free-text search string (max 256 chars).'),
});

const getUserSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

const createUserSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  email: z.string().email().optional().describe('User email.'),
  phone: z
    .string()
    .optional()
    .describe("Phone number, formatted with a leading '+' and country code (e.g., +16175551212)."),
  password: z.string().min(8).optional().describe('Plain text user password. Must be at least 8 chars.'),
  name: z.string().max(128).optional().describe('User name. Max length 128 chars.'),
});

const updateUserSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  name: z.string().max(128).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  status: z.boolean().optional().describe('User Status. true = active, false = blocked.'),
  emailVerification: z.boolean().optional(),
  phoneVerification: z.boolean().optional(),
  labels: z.array(z.string()).optional(),
  password: z.string().min(8).optional(),
  prefs: z.record(z.string(), z.any()).optional().describe('Preferences object (REPLACES existing prefs).'),
});

const deleteUserSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

const updatePasswordSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const updateStatusSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  status: z.boolean(),
});

const listUserSessionsSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

const deleteUserSessionSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  sessionId: z.string().min(1, 'Session ID is required'),
});

const deleteUserSessionsSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

const listUserMembershipsSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  queries: z
    .array(z.string())
    .optional()
    .describe(
      'Array of Appwrite Query strings. Filter on userId, teamId, invited, joined, confirm, roles.' +
        QUERY_HELP_SUFFIX
    ),
});

const listIdentitiesSchema = z.object({
  queries: z
    .array(z.string())
    .optional()
    .describe(
      'Array of Appwrite Query strings. Filter on userId, provider, providerUid, providerEmail, providerAccessTokenExpiry.' +
        QUERY_HELP_SUFFIX
    ),
  search: z.string().max(256).optional().describe('Free-text search string (max 256 chars).'),
});

const getUserPrefsSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

const updateUserPrefsSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  prefs: z.record(z.string(), z.any()).describe('Preferences object (REPLACES existing prefs, max 64kB).'),
});

// ──────────────────────────────────────────────────
// SHARED HELPERS
// ──────────────────────────────────────────────────

/**
 * Strip password/hash fields defensively from a user record before returning.
 * Appwrite normally does not return password, but defense-in-depth.
 */
function sanitizeUser<P extends Models.Preferences>(user: Models.User<P>): Omit<Models.User<P>, 'password' | 'hash' | 'hashOptions'> {
  const { password: _p, hash: _h, hashOptions: _ho, ...rest } = user as Models.User<P> & {
    password?: unknown;
    hash?: unknown;
    hashOptions?: unknown;
  };
  return rest as Omit<Models.User<P>, 'password' | 'hash' | 'hashOptions'>;
}

type SlimUserRow = {
  $id: string;
  name: string;
  email: string;
  emailVerification: boolean;
  phone: string;
  phoneVerification: boolean;
  status: boolean;
  labels: string[];
  $createdAt: string;
  $updatedAt: string;
};

function toSlimUserRow(u: Models.User<Models.Preferences>): SlimUserRow {
  return {
    $id: u.$id,
    name: u.name,
    email: u.email,
    emailVerification: u.emailVerification,
    phone: u.phone,
    phoneVerification: u.phoneVerification,
    status: u.status,
    labels: u.labels,
    $createdAt: u.$createdAt,
    $updatedAt: u.$updatedAt,
  };
}

async function buildManager(context: ToolContext): Promise<UsersManager> {
  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });
  return new UsersManager(client);
}

// ──────────────────────────────────────────────────
// TOOL HANDLERS
// ──────────────────────────────────────────────────

async function handleListUsers(
  input: unknown,
  context: ToolContext
) {
  const validated = listUsersSchema.parse(input);
  const manager = await buildManager(context);
  const guarded = clampQueryLimit(normalizeQueries(validated.queries), { maxLimit: 100 });
  const result = await manager.listUsers(guarded.queries, validated.search);
  const out: { total: number; users: SlimUserRow[]; _pagination?: unknown } = {
    total: result.total,
    users: result.users.map(toSlimUserRow),
  };
  if (guarded.clamped) {
    out._pagination = { appliedLimit: guarded.effectiveLimit, clamped: true };
  }
  return out;
}

async function handleGetUser(
  input: unknown,
  context: ToolContext
): Promise<Omit<Models.User<Models.Preferences>, 'password' | 'hash' | 'hashOptions'>> {
  const validated = getUserSchema.parse(input);
  const manager = await buildManager(context);
  const user = await manager.getUser(validated.userId);
  return sanitizeUser(user);
}

async function handleCreateUser(
  input: unknown,
  context: ToolContext
): Promise<Omit<Models.User<Models.Preferences>, 'password' | 'hash' | 'hashOptions'>> {
  const validated = createUserSchema.parse(input);
  const manager = await buildManager(context);
  const user = await manager.createUser({
    userId: validated.userId,
    email: validated.email,
    phone: validated.phone,
    password: validated.password,
    name: validated.name,
  });
  return sanitizeUser(user);
}

async function handleUpdateUser(
  input: unknown,
  context: ToolContext
): Promise<Omit<Models.User<Models.Preferences>, 'password' | 'hash' | 'hashOptions'>> {
  const validated = updateUserSchema.parse(input);
  const manager = await buildManager(context);
  const user = await manager.updateUser(validated.userId, {
    name: validated.name,
    email: validated.email,
    phone: validated.phone,
    status: validated.status,
    emailVerification: validated.emailVerification,
    phoneVerification: validated.phoneVerification,
    labels: validated.labels,
    password: validated.password,
    prefs: validated.prefs,
  });
  return sanitizeUser(user);
}

async function handleDeleteUser(
  input: unknown,
  context: ToolContext
): Promise<{ success: true }> {
  const validated = deleteUserSchema.parse(input);
  const manager = await buildManager(context);
  await manager.deleteUser(validated.userId);
  return { success: true };
}

async function handleUpdatePassword(
  input: unknown,
  context: ToolContext
): Promise<{ success: true }> {
  const validated = updatePasswordSchema.parse(input);
  const manager = await buildManager(context);
  await manager.updatePassword(validated.userId, validated.password);
  return { success: true };
}

async function handleUpdateStatus(
  input: unknown,
  context: ToolContext
): Promise<Omit<Models.User<Models.Preferences>, 'password' | 'hash' | 'hashOptions'>> {
  const validated = updateStatusSchema.parse(input);
  const manager = await buildManager(context);
  const user = await manager.updateStatus(validated.userId, validated.status);
  return sanitizeUser(user);
}

async function handleListUserSessions(
  input: unknown,
  context: ToolContext
): Promise<{
  total: number;
  sessions: Array<{
    $id: string;
    provider: string;
    ip: string;
    current: boolean;
    $createdAt: string;
    expire: string;
  }>;
}> {
  const validated = listUserSessionsSchema.parse(input);
  const manager = await buildManager(context);
  const result = await manager.listSessions(validated.userId);
  return {
    total: result.total,
    sessions: result.sessions.map((s) => ({
      $id: s.$id,
      provider: s.provider,
      ip: s.ip,
      current: s.current,
      $createdAt: s.$createdAt,
      expire: s.expire,
    })),
  };
}

async function handleDeleteUserSession(
  input: unknown,
  context: ToolContext
): Promise<{ success: true }> {
  const validated = deleteUserSessionSchema.parse(input);
  const manager = await buildManager(context);
  await manager.deleteSession(validated.userId, validated.sessionId);
  return { success: true };
}

async function handleDeleteUserSessions(
  input: unknown,
  context: ToolContext
): Promise<{ success: true }> {
  const validated = deleteUserSessionsSchema.parse(input);
  const manager = await buildManager(context);
  await manager.deleteSessions(validated.userId);
  return { success: true };
}

async function handleListUserMemberships(
  input: unknown,
  context: ToolContext
): Promise<{
  total: number;
  memberships: Array<{
    $id: string;
    userId: string;
    userName: string;
    userEmail: string;
    teamId: string;
    teamName: string;
    invited: string;
    joined: string;
    confirm: boolean;
    roles: string[];
  }>;
}> {
  const validated = listUserMembershipsSchema.parse(input);
  const manager = await buildManager(context);
  const guarded = clampQueryLimit(normalizeQueries(validated.queries), { maxLimit: 100 });
  const result = await manager.listMemberships(
    validated.userId,
    guarded.queries
  );
  return {
    total: result.total,
    memberships: result.memberships.map((m) => ({
      $id: m.$id,
      userId: m.userId,
      userName: m.userName,
      userEmail: m.userEmail,
      teamId: m.teamId,
      teamName: m.teamName,
      invited: m.invited,
      joined: m.joined,
      confirm: m.confirm,
      roles: m.roles,
    })),
  };
}

async function handleListIdentities(
  input: unknown,
  context: ToolContext
): Promise<{
  total: number;
  identities: Array<{
    $id: string;
    userId: string;
    provider: string;
    providerUid: string;
    providerEmail: string;
    providerAccessTokenExpiry: string;
    $createdAt: string;
    $updatedAt: string;
  }>;
}> {
  const validated = listIdentitiesSchema.parse(input);
  const manager = await buildManager(context);
  const guarded = clampQueryLimit(normalizeQueries(validated.queries), { maxLimit: 100 });
  const result = await manager.listIdentities(
    guarded.queries,
    validated.search
  );
  return {
    total: result.total,
    identities: result.identities.map((i) => ({
      $id: i.$id,
      userId: i.userId,
      provider: i.provider,
      providerUid: i.providerUid,
      providerEmail: i.providerEmail,
      providerAccessTokenExpiry: i.providerAccessTokenExpiry,
      $createdAt: i.$createdAt,
      $updatedAt: i.$updatedAt,
    })),
  };
}

async function handleGetUserPrefs(
  input: unknown,
  context: ToolContext
): Promise<Models.Preferences> {
  const validated = getUserPrefsSchema.parse(input);
  const manager = await buildManager(context);
  return await manager.getPrefs(validated.userId);
}

async function handleUpdateUserPrefs(
  input: unknown,
  context: ToolContext
): Promise<Models.Preferences> {
  const validated = updateUserPrefsSchema.parse(input);
  const manager = await buildManager(context);
  return await manager.updatePrefs(validated.userId, validated.prefs);
}

// ──────────────────────────────────────────────────
// TOOL DEFINITIONS
// ──────────────────────────────────────────────────

const listUsersTool: ToolDefinition = {
  name: 'list_users',
  description:
    'List users in the Appwrite project. Supports Appwrite Query strings and a free-text search (max 256 chars). Returns a slim per-row projection.',
  inputSchema: listUsersSchema,
  handler: handleListUsers,
  requiresAuth: true,
};

const getUserTool: ToolDefinition = {
  name: 'get_user',
  description: 'Get a user by ID, including preferences. Password/hash fields are stripped from the response.',
  inputSchema: getUserSchema,
  handler: handleGetUser,
  requiresAuth: true,
};

const createUserTool: ToolDefinition = {
  name: 'create_user',
  description:
    'Create a new Appwrite user. All auth fields (email, phone, password, name) are optional — v23 supports empty users.',
  inputSchema: createUserSchema,
  handler: handleCreateUser,
  requiresAuth: true,
};

const updateUserTool: ToolDefinition = {
  name: 'update_user',
  description:
    'Update one or more fields on a user. Each provided field is patched via the appropriate SDK endpoint (name, email, phone, status, emailVerification, phoneVerification, labels, password, prefs).',
  inputSchema: updateUserSchema,
  handler: handleUpdateUser,
  requiresAuth: true,
};

const deleteUserTool: ToolDefinition = {
  name: 'delete_user',
  description: 'Delete a user by ID.',
  inputSchema: deleteUserSchema,
  handler: handleDeleteUser,
  requiresAuth: true,
};

const updatePasswordTool: ToolDefinition = {
  name: 'update_password',
  description: "Update a user's password (plain text, min 8 chars). Password is never echoed in the response.",
  inputSchema: updatePasswordSchema,
  handler: handleUpdatePassword,
  requiresAuth: true,
};

const updateStatusTool: ToolDefinition = {
  name: 'update_status',
  description: "Activate (true) or block (false) a user account by ID.",
  inputSchema: updateStatusSchema,
  handler: handleUpdateStatus,
  requiresAuth: true,
};

const listUserSessionsTool: ToolDefinition = {
  name: 'list_user_sessions',
  description: "List a user's active sessions ($id, provider, ip, current, $createdAt, expire).",
  inputSchema: listUserSessionsSchema,
  handler: handleListUserSessions,
  requiresAuth: true,
};

const deleteUserSessionTool: ToolDefinition = {
  name: 'delete_user_session',
  description: 'Delete a single session for a user by sessionId.',
  inputSchema: deleteUserSessionSchema,
  handler: handleDeleteUserSession,
  requiresAuth: true,
};

const deleteUserSessionsTool: ToolDefinition = {
  name: 'delete_user_sessions',
  description: 'Delete ALL sessions for a user (force-logout).',
  inputSchema: deleteUserSessionsSchema,
  handler: handleDeleteUserSessions,
  requiresAuth: true,
};

const listUserMembershipsTool: ToolDefinition = {
  name: 'list_user_memberships',
  description: "List a user's team memberships. Supports Appwrite Query strings (userId, teamId, invited, joined, confirm, roles).",
  inputSchema: listUserMembershipsSchema,
  handler: handleListUserMemberships,
  requiresAuth: true,
};

const listIdentitiesTool: ToolDefinition = {
  name: 'list_identities',
  description:
    'List identities across all users. Supports Appwrite Query strings (userId, provider, providerUid, providerEmail, providerAccessTokenExpiry) and free-text search.',
  inputSchema: listIdentitiesSchema,
  handler: handleListIdentities,
  requiresAuth: true,
};

const getUserPrefsTool: ToolDefinition = {
  name: 'get_user_prefs',
  description: "Get a user's preferences object.",
  inputSchema: getUserPrefsSchema,
  handler: handleGetUserPrefs,
  requiresAuth: true,
};

const updateUserPrefsTool: ToolDefinition = {
  name: 'update_user_prefs',
  description: "Replace a user's preferences object (max 64kB). Note: REPLACES, does not merge.",
  inputSchema: updateUserPrefsSchema,
  handler: handleUpdateUserPrefs,
  requiresAuth: true,
};

// ──────────────────────────────────────────────────
// TOOL GROUP EXPORT
// ──────────────────────────────────────────────────

export const usersToolGroup: ToolGroupDefinition = {
  name: 'Users',
  flag: 'users',
  description: 'Tools for managing Appwrite Users (accounts, sessions, prefs, memberships, identities)',
  tools: [
    listUsersTool,
    getUserTool,
    createUserTool,
    updateUserTool,
    deleteUserTool,
    updatePasswordTool,
    updateStatusTool,
    listUserSessionsTool,
    deleteUserSessionTool,
    deleteUserSessionsTool,
    listUserMembershipsTool,
    listIdentitiesTool,
    getUserPrefsTool,
    updateUserPrefsTool,
  ],
};
