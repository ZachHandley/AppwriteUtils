/**
 * Teams tools for MCP
 * @packageDocumentation
 */

import { z } from 'zod';
import type { Models } from 'node-appwrite';
import type { ToolContext, ToolDefinition, ToolGroupDefinition } from '../ToolGroup.js';
import { TeamsManager } from 'appwrite-utils-helpers';

// ──────────────────────────────────────────────────
// INPUT SCHEMAS
// ──────────────────────────────────────────────────

const listTeamsSchema = z.object({
  queries: z
    .array(z.string())
    .optional()
    .describe('Array of Appwrite Query strings. Filter on: name, total, billingPlan.'),
  search: z
    .string()
    .max(256)
    .optional()
    .describe('Free-text search term (max 256 chars).'),
});

const getTeamSchema = z.object({
  teamId: z.string().min(1, 'Team ID is required'),
});

const createTeamSchema = z.object({
  teamId: z
    .string()
    .min(1, 'Team ID is required')
    .max(36, 'Team ID max length is 36 chars')
    .describe(
      "Team ID. Choose a custom ID or use ID.unique(). Valid chars: a-z, A-Z, 0-9, period, hyphen, underscore. Can't start with a special char."
    ),
  name: z
    .string()
    .min(1, 'Team name is required')
    .max(128, 'Team name max length is 128 chars'),
  roles: z
    .array(z.string().max(32, 'Each role max length is 32 chars'))
    .max(100, 'Maximum of 100 roles allowed')
    .optional()
    .describe('Roles assigned to the creator. Defaults to ["owner"] in Appwrite.'),
});

const updateTeamNameSchema = z.object({
  teamId: z.string().min(1, 'Team ID is required'),
  name: z
    .string()
    .min(1, 'Team name is required')
    .max(128, 'Team name max length is 128 chars'),
});

const deleteTeamSchema = z.object({
  teamId: z.string().min(1, 'Team ID is required'),
});

const getTeamPrefsSchema = z.object({
  teamId: z.string().min(1, 'Team ID is required'),
});

const updateTeamPrefsSchema = z.object({
  teamId: z.string().min(1, 'Team ID is required'),
  prefs: z
    .record(z.string(), z.unknown())
    .describe('Prefs key-value JSON object. Replaces previous value. Max 64kB.'),
});

const listTeamMembershipsSchema = z.object({
  teamId: z.string().min(1, 'Team ID is required'),
  queries: z
    .array(z.string())
    .optional()
    .describe(
      'Array of Appwrite Query strings. Filter on: userId, teamId, invited, joined, confirm, roles.'
    ),
  search: z
    .string()
    .max(256)
    .optional()
    .describe('Free-text search term (max 256 chars).'),
});

const getTeamMembershipSchema = z.object({
  teamId: z.string().min(1, 'Team ID is required'),
  membershipId: z.string().min(1, 'Membership ID is required'),
});

const createTeamMembershipSchema = z
  .object({
    teamId: z.string().min(1, 'Team ID is required'),
    email: z.string().email('Must be a valid email').optional(),
    userId: z.string().optional(),
    phone: z
      .string()
      .regex(
        /^\+[0-9]{1,15}$/,
        "Phone must start with '+' followed by country code and digits"
      )
      .optional(),
    roles: z
      .array(z.string().max(81, 'Each role max length is 81 chars'))
      .min(1, 'At least one role is required')
      .max(100, 'Maximum of 100 roles allowed'),
    url: z
      .string()
      .url('Must be a valid URL')
      .optional()
      .describe(
        'Redirect URL after invitation acceptance. Must match a configured platform hostname.'
      ),
    name: z
      .string()
      .max(128, 'Member name max length is 128 chars')
      .optional(),
  })
  .refine(
    (data) => Boolean(data.email || data.userId || data.phone),
    {
      message: 'At least one of email, userId, or phone must be provided',
      path: ['email'],
    }
  );

const updateTeamMembershipRolesSchema = z.object({
  teamId: z.string().min(1, 'Team ID is required'),
  membershipId: z.string().min(1, 'Membership ID is required'),
  roles: z
    .array(z.string().max(81, 'Each role max length is 81 chars'))
    .min(1, 'At least one role is required')
    .max(100, 'Maximum of 100 roles allowed'),
});

const deleteTeamMembershipSchema = z.object({
  teamId: z.string().min(1, 'Team ID is required'),
  membershipId: z.string().min(1, 'Membership ID is required'),
});

// ──────────────────────────────────────────────────
// AUTH HELPER
// ──────────────────────────────────────────────────

/**
 * Resolve credentials and return an authenticated TeamsManager instance.
 * Mirrors the helper pattern used in functions/index.ts.
 */
async function getTeamsManager(context: ToolContext): Promise<TeamsManager> {
  const authResult = await context.authResolver.resolve();
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });
  return new TeamsManager(client);
}

// ──────────────────────────────────────────────────
// TOOL HANDLERS — TEAMS
// ──────────────────────────────────────────────────

/**
 * List teams. Returns a slim per-row projection: $id, name, total members,
 * $createdAt, $updatedAt.
 */
async function handleListTeams(
  input: unknown,
  context: ToolContext
): Promise<{
  total: number;
  teams: Array<{
    $id: string;
    name: string;
    total: number;
    $createdAt: string;
    $updatedAt: string;
  }>;
}> {
  const validated = listTeamsSchema.parse(input ?? {});
  const teams = await getTeamsManager(context);
  const result = await teams.listTeams(validated.queries, validated.search);

  return {
    total: result.total,
    teams: result.teams.map((team: Models.Team<Models.Preferences>) => ({
      $id: team.$id,
      name: team.name,
      total: team.total,
      $createdAt: team.$createdAt,
      $updatedAt: team.$updatedAt,
    })),
  };
}

async function handleGetTeam(
  input: unknown,
  context: ToolContext
): Promise<{
  $id: string;
  name: string;
  total: number;
  $createdAt: string;
  $updatedAt: string;
  prefs: Record<string, unknown>;
}> {
  const validated = getTeamSchema.parse(input);
  const teams = await getTeamsManager(context);
  const team = await teams.getTeam(validated.teamId);

  return {
    $id: team.$id,
    name: team.name,
    total: team.total,
    $createdAt: team.$createdAt,
    $updatedAt: team.$updatedAt,
    prefs: (team.prefs as Record<string, unknown>) ?? {},
  };
}

async function handleCreateTeam(
  input: unknown,
  context: ToolContext
): Promise<{
  $id: string;
  name: string;
  total: number;
  $createdAt: string;
  $updatedAt: string;
}> {
  const validated = createTeamSchema.parse(input);
  const teams = await getTeamsManager(context);
  const team = await teams.createTeam({
    teamId: validated.teamId,
    name: validated.name,
    roles: validated.roles,
  });

  return {
    $id: team.$id,
    name: team.name,
    total: team.total,
    $createdAt: team.$createdAt,
    $updatedAt: team.$updatedAt,
  };
}

async function handleUpdateTeamName(
  input: unknown,
  context: ToolContext
): Promise<{
  $id: string;
  name: string;
  total: number;
  $createdAt: string;
  $updatedAt: string;
}> {
  const validated = updateTeamNameSchema.parse(input);
  const teams = await getTeamsManager(context);
  const team = await teams.updateTeam(validated.teamId, validated.name);

  return {
    $id: team.$id,
    name: team.name,
    total: team.total,
    $createdAt: team.$createdAt,
    $updatedAt: team.$updatedAt,
  };
}

async function handleDeleteTeam(
  input: unknown,
  context: ToolContext
): Promise<{ success: true }> {
  const validated = deleteTeamSchema.parse(input);
  const teams = await getTeamsManager(context);
  await teams.deleteTeam(validated.teamId);
  return { success: true };
}

async function handleGetTeamPrefs(
  input: unknown,
  context: ToolContext
): Promise<{ prefs: Record<string, unknown> }> {
  const validated = getTeamPrefsSchema.parse(input);
  const teams = await getTeamsManager(context);
  const prefs = await teams.getPrefs(validated.teamId);
  return { prefs: (prefs as Record<string, unknown>) ?? {} };
}

async function handleUpdateTeamPrefs(
  input: unknown,
  context: ToolContext
): Promise<{ prefs: Record<string, unknown> }> {
  const validated = updateTeamPrefsSchema.parse(input);
  const teams = await getTeamsManager(context);
  const prefs = await teams.updatePrefs(validated.teamId, validated.prefs);
  return { prefs: (prefs as Record<string, unknown>) ?? {} };
}

// ──────────────────────────────────────────────────
// TOOL HANDLERS — MEMBERSHIPS
// ──────────────────────────────────────────────────

async function handleListTeamMemberships(
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
    roles: string[];
    confirm: boolean;
    joined: string;
    invited: string;
  }>;
}> {
  const validated = listTeamMembershipsSchema.parse(input);
  const teams = await getTeamsManager(context);
  const result = await teams.listMemberships(
    validated.teamId,
    validated.queries,
    validated.search
  );

  return {
    total: result.total,
    memberships: result.memberships.map((m: Models.Membership) => ({
      $id: m.$id,
      userId: m.userId,
      userName: m.userName,
      userEmail: m.userEmail,
      teamId: m.teamId,
      teamName: m.teamName,
      roles: m.roles ?? [],
      confirm: m.confirm,
      joined: m.joined,
      invited: m.invited,
    })),
  };
}

async function handleGetTeamMembership(
  input: unknown,
  context: ToolContext
): Promise<{
  $id: string;
  userId: string;
  userName: string;
  userEmail: string;
  teamId: string;
  teamName: string;
  roles: string[];
  confirm: boolean;
  joined: string;
  invited: string;
}> {
  const validated = getTeamMembershipSchema.parse(input);
  const teams = await getTeamsManager(context);
  const m = await teams.getMembership(validated.teamId, validated.membershipId);

  return {
    $id: m.$id,
    userId: m.userId,
    userName: m.userName,
    userEmail: m.userEmail,
    teamId: m.teamId,
    teamName: m.teamName,
    roles: m.roles ?? [],
    confirm: m.confirm,
    joined: m.joined,
    invited: m.invited,
  };
}

async function handleCreateTeamMembership(
  input: unknown,
  context: ToolContext
): Promise<{
  $id: string;
  userId: string;
  teamId: string;
  roles: string[];
  confirm: boolean;
  invited: string;
}> {
  const validated = createTeamMembershipSchema.parse(input);
  const teams = await getTeamsManager(context);
  const m = await teams.createMembership({
    teamId: validated.teamId,
    email: validated.email,
    userId: validated.userId,
    phone: validated.phone,
    roles: validated.roles,
    url: validated.url,
    name: validated.name,
  });

  return {
    $id: m.$id,
    userId: m.userId,
    teamId: m.teamId,
    roles: m.roles ?? [],
    confirm: m.confirm,
    invited: m.invited,
  };
}

async function handleUpdateTeamMembershipRoles(
  input: unknown,
  context: ToolContext
): Promise<{
  $id: string;
  userId: string;
  teamId: string;
  roles: string[];
  confirm: boolean;
}> {
  const validated = updateTeamMembershipRolesSchema.parse(input);
  const teams = await getTeamsManager(context);
  const m = await teams.updateMembership(
    validated.teamId,
    validated.membershipId,
    validated.roles
  );

  return {
    $id: m.$id,
    userId: m.userId,
    teamId: m.teamId,
    roles: m.roles ?? [],
    confirm: m.confirm,
  };
}

async function handleDeleteTeamMembership(
  input: unknown,
  context: ToolContext
): Promise<{ success: true }> {
  const validated = deleteTeamMembershipSchema.parse(input);
  const teams = await getTeamsManager(context);
  await teams.deleteMembership(validated.teamId, validated.membershipId);
  return { success: true };
}

// ──────────────────────────────────────────────────
// TOOL DEFINITIONS
// ──────────────────────────────────────────────────

const listTeamsTool: ToolDefinition = {
  name: 'list_teams',
  description:
    'List all teams in the Appwrite project. Returns a slim per-row projection ($id, name, total members, $createdAt, $updatedAt).',
  inputSchema: listTeamsSchema,
  handler: handleListTeams,
  requiresAuth: true,
};

const getTeamTool: ToolDefinition = {
  name: 'get_team',
  description: 'Get detailed information about a specific team by its ID, including team preferences.',
  inputSchema: getTeamSchema,
  handler: handleGetTeam,
  requiresAuth: true,
};

const createTeamTool: ToolDefinition = {
  name: 'create_team',
  description:
    "Create a new team. The creating user is automatically assigned the 'owner' role unless `roles` overrides it.",
  inputSchema: createTeamSchema,
  handler: handleCreateTeam,
  requiresAuth: true,
};

const updateTeamNameTool: ToolDefinition = {
  name: 'update_team_name',
  description: "Update a team's display name. Backed by Teams.updateName.",
  inputSchema: updateTeamNameSchema,
  handler: handleUpdateTeamName,
  requiresAuth: true,
};

const deleteTeamTool: ToolDefinition = {
  name: 'delete_team',
  description:
    "Delete a team by its ID. Only team members with the 'owner' role can perform this operation.",
  inputSchema: deleteTeamSchema,
  handler: handleDeleteTeam,
  requiresAuth: true,
};

const getTeamPrefsTool: ToolDefinition = {
  name: 'get_team_prefs',
  description: "Get a team's shared preferences as a key-value JSON object.",
  inputSchema: getTeamPrefsSchema,
  handler: handleGetTeamPrefs,
  requiresAuth: true,
};

const updateTeamPrefsTool: ToolDefinition = {
  name: 'update_team_prefs',
  description:
    "Replace a team's shared preferences with the provided key-value object. The supplied object replaces any previous value (max 64kB).",
  inputSchema: updateTeamPrefsSchema,
  handler: handleUpdateTeamPrefs,
  requiresAuth: true,
};

const listTeamMembershipsTool: ToolDefinition = {
  name: 'list_team_memberships',
  description:
    'List a team\'s members. Supports Appwrite Query strings (filter on userId, teamId, invited, joined, confirm, roles) and a free-text search term.',
  inputSchema: listTeamMembershipsSchema,
  handler: handleListTeamMemberships,
  requiresAuth: true,
};

const getTeamMembershipTool: ToolDefinition = {
  name: 'get_team_membership',
  description: 'Get a single team membership by its membership ID.',
  inputSchema: getTeamMembershipSchema,
  handler: handleGetTeamMembership,
  requiresAuth: true,
};

const createTeamMembershipTool: ToolDefinition = {
  name: 'create_team_membership',
  description:
    'Invite or add a new member to a team. Provide at least one of email, userId, or phone (priority order: userId > email > phone). The `roles` array is required.',
  inputSchema: createTeamMembershipSchema,
  handler: handleCreateTeamMembership,
  requiresAuth: true,
};

const updateTeamMembershipRolesTool: ToolDefinition = {
  name: 'update_team_membership_roles',
  description:
    "Modify the roles of an existing team member. Only team members with the 'owner' role can call this.",
  inputSchema: updateTeamMembershipRolesSchema,
  handler: handleUpdateTeamMembershipRoles,
  requiresAuth: true,
};

const deleteTeamMembershipTool: ToolDefinition = {
  name: 'delete_team_membership',
  description:
    'Remove a team membership. Allows a user to leave a team or an owner to remove any member (including non-accepted invites).',
  inputSchema: deleteTeamMembershipSchema,
  handler: handleDeleteTeamMembership,
  requiresAuth: true,
};

// ──────────────────────────────────────────────────
// TOOL GROUP EXPORT
// ──────────────────────────────────────────────────

/**
 * Teams tools group for MCP — covers the full Teams + Memberships surface
 * exposed by the node-appwrite v23 `Teams` service.
 */
export const teamsToolGroup: ToolGroupDefinition = {
  name: 'Teams',
  flag: 'teams',
  description: 'Tools for managing Appwrite Teams and memberships',
  tools: [
    listTeamsTool,
    getTeamTool,
    createTeamTool,
    updateTeamNameTool,
    deleteTeamTool,
    getTeamPrefsTool,
    updateTeamPrefsTool,
    listTeamMembershipsTool,
    getTeamMembershipTool,
    createTeamMembershipTool,
    updateTeamMembershipRolesTool,
    deleteTeamMembershipTool,
  ],
};
