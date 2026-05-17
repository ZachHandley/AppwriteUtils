/**
 * Meta tools for discovering and enabling tool groups at runtime.
 *
 * These tools are always exposed when the server runs in standard (non-locked)
 * mode. They let an agent pay only the context cost of the groups it actually
 * needs, expanding the visible tool surface on demand.
 *
 * @packageDocumentation
 */

import { z } from "zod";
import type { ToolGroupDefinition, ToolContext } from "../ToolGroup.js";

const ListToolGroupsInputSchema = z.object({});

const DescribeToolGroupInputSchema = z.object({
  group: z.string().describe("Group flag name (e.g., 'storage', 'functions', 'tables')."),
});

const EnableToolGroupsInputSchema = z.object({
  groups: z
    .array(z.string())
    .min(1)
    .describe("One or more group flag names to enable (e.g., ['storage', 'users'])."),
});

const DisableToolGroupsInputSchema = z.object({
  groups: z
    .array(z.string())
    .min(1)
    .describe("One or more group flag names to disable. Always-on groups (e.g., 'meta') cannot be disabled."),
});

const EnableAllToolGroupsInputSchema = z.object({});

const ListAppwriteProjectsInputSchema = z.object({});

const SelectAppwriteProjectInputSchema = z.object({
  projectId: z
    .string()
    .min(1)
    .describe("Appwrite project ID to pin as the active project for this MCP server."),
  endpoint: z
    .string()
    .url()
    .optional()
    .describe(
      "Optional endpoint URL. If omitted, the resolver tries to derive one from ~/.appwrite/prefs.json (prefs[projectId] direct match, then endpoint scan)."
    ),
  apiKey: z
    .string()
    .optional()
    .describe(
      "Optional API key. If omitted, the resolver tries to find one via prefs.json (endpoint scan)."
    ),
  sessionCookie: z
    .string()
    .optional()
    .describe("Optional session cookie. Use instead of apiKey for cookie-based auth."),
});

const ClearAppwriteProjectInputSchema = z.object({});

function requireRegistry(context: ToolContext) {
  if (!context.toolRegistry) {
    throw new Error("Meta tools require a ToolRegistry in the context — this server was not started in meta-enabled mode.");
  }
  return context.toolRegistry;
}

async function listToolGroups(input: unknown, context: ToolContext): Promise<unknown> {
  ListToolGroupsInputSchema.parse(input);
  const registry = requireRegistry(context);

  return {
    groups: registry.getAllGroups().map((group) => ({
      flag: group.flag,
      name: group.name,
      description: group.description,
      toolCount: group.tools.length,
      enabled: registry.isGroupActive(group.flag),
      alwaysOn: registry.getAlwaysOnFlags().includes(group.flag),
    })),
  };
}

async function describeToolGroup(input: unknown, context: ToolContext): Promise<unknown> {
  const parsed = DescribeToolGroupInputSchema.parse(input);
  const registry = requireRegistry(context);

  const group = registry.getAllGroups().find((g) => g.flag === parsed.group);
  if (!group) {
    throw new Error(
      `Unknown tool group: '${parsed.group}'. Call list_tool_groups to see available flags.`
    );
  }

  return {
    flag: group.flag,
    name: group.name,
    description: group.description,
    enabled: registry.isGroupActive(group.flag),
    tools: group.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      requiresAuth: tool.requiresAuth,
    })),
  };
}

async function enableToolGroups(input: unknown, context: ToolContext): Promise<unknown> {
  const parsed = EnableToolGroupsInputSchema.parse(input);
  const registry = requireRegistry(context);

  const known = new Set(registry.getAllGroups().map((g) => g.flag));
  const unknown = parsed.groups.filter((g) => !known.has(g));
  const newlyEnabled = registry.enableGroups(parsed.groups);

  if (newlyEnabled.length > 0 && context.notifyToolsChanged) {
    await context.notifyToolsChanged();
  }

  return {
    newlyEnabled,
    alreadyEnabled: parsed.groups.filter((g) => known.has(g) && !newlyEnabled.includes(g)),
    unknown,
    activeGroups: registry.getEnabledGroups().map((g) => g.flag),
    visibleToolCount: registry.getEnabledTools().length,
  };
}

async function disableToolGroups(input: unknown, context: ToolContext): Promise<unknown> {
  const parsed = DisableToolGroupsInputSchema.parse(input);
  const registry = requireRegistry(context);

  const { disabled, refused } = registry.disableGroups(parsed.groups);

  if (disabled.length > 0 && context.notifyToolsChanged) {
    await context.notifyToolsChanged();
  }

  return {
    disabled,
    refused,
    refusedReason: refused.length > 0 ? "These groups are always-on and cannot be disabled." : undefined,
    activeGroups: registry.getEnabledGroups().map((g) => g.flag),
    visibleToolCount: registry.getEnabledTools().length,
  };
}

async function enableAllToolGroups(input: unknown, context: ToolContext): Promise<unknown> {
  EnableAllToolGroupsInputSchema.parse(input);
  const registry = requireRegistry(context);

  const newlyEnabled = registry.enableAllGroups();

  if (newlyEnabled.length > 0 && context.notifyToolsChanged) {
    await context.notifyToolsChanged();
  }

  return {
    newlyEnabled,
    activeGroups: registry.getEnabledGroups().map((g) => g.flag),
    visibleToolCount: registry.getEnabledTools().length,
  };
}

async function listAppwriteProjects(input: unknown, context: ToolContext): Promise<unknown> {
  ListAppwriteProjectsInputSchema.parse(input);

  const sessionService = context.authResolver.getSessionService();
  const projectConfig = await context.authResolver.getProjectConfig();
  const override = context.authResolver.getOverride();
  const prefs = await sessionService.loadSessionPrefs();

  // Enumerate prefs.json entries without leaking creds.
  const prefsEntries: Array<{
    projectId: string;
    endpoint: string;
    hasApiKey: boolean;
    hasCookie: boolean;
    email: string | null;
    isCurrent: boolean;
  }> = [];

  if (prefs) {
    const root = prefs as unknown as { current?: unknown };
    const currentId = typeof root.current === "string" ? root.current : "";

    for (const [pid, raw] of Object.entries(prefs)) {
      if (pid === "current") continue;
      if (!raw || typeof raw !== "object") continue;
      const entry = raw as {
        endpoint?: unknown;
        cookie?: unknown;
        key?: unknown;
        email?: unknown;
      };
      if (typeof entry.endpoint !== "string" || !entry.endpoint) continue;
      prefsEntries.push({
        projectId: pid,
        endpoint: entry.endpoint,
        hasApiKey: typeof entry.key === "string" && !!entry.key,
        hasCookie: typeof entry.cookie === "string" && !!entry.cookie,
        email: typeof entry.email === "string" ? entry.email : null,
        isCurrent: pid === currentId,
      });
    }
  }

  return {
    cwdProject: projectConfig
      ? {
          projectId: projectConfig.projectId,
          endpoint: projectConfig.endpoint || null,
          source: projectConfig.source,
          format: projectConfig.format,
          hasInlineApiKey: !!projectConfig.apiKey,
          hasInlineSessionCookie: !!projectConfig.sessionCookie,
        }
      : null,
    sessionOverride: override
      ? {
          projectId: override.projectId,
          endpoint: override.endpoint || null,
          hasApiKey: !!override.apiKey,
          hasSessionCookie: !!override.sessionCookie,
        }
      : null,
    prefsEntries,
    prefsCount: prefsEntries.length,
  };
}

async function selectAppwriteProject(input: unknown, context: ToolContext): Promise<unknown> {
  const parsed = SelectAppwriteProjectInputSchema.parse(input);

  context.authResolver.setOverride({
    projectId: parsed.projectId,
    endpoint: parsed.endpoint,
    apiKey: parsed.apiKey,
    sessionCookie: parsed.sessionCookie,
  });

  // Invalidate any cached clients keyed on the previous credentials so the
  // next tool call goes through full re-resolution.
  context.clientRegistry.invalidate();

  const override = context.authResolver.getOverride()!;
  return {
    active: true,
    projectId: override.projectId,
    endpoint: override.endpoint || null,
    hasApiKey: !!override.apiKey,
    hasSessionCookie: !!override.sessionCookie,
    note: "Override is in-memory only and dies when this MCP server stops. Use clear_appwrite_project to drop it.",
  };
}

async function clearAppwriteProject(input: unknown, context: ToolContext): Promise<unknown> {
  ClearAppwriteProjectInputSchema.parse(input);

  const had = context.authResolver.getOverride() !== null;
  context.authResolver.clearOverride();
  context.clientRegistry.invalidate();

  return {
    cleared: had,
    note: had
      ? "Override removed. Resolution falls back to CWD project config / prefs.current."
      : "No override was set.",
  };
}

export const metaToolGroup: ToolGroupDefinition = {
  name: "Meta",
  flag: "meta",
  description:
    "Discover and control which Appwrite tool groups are exposed to the agent. Use these first to keep context small, then enable groups on demand.",
  tools: [
    {
      name: "list_tool_groups",
      description:
        "List every registered tool group with its description, tool count, and current enabled state. Call this first to discover what's available.",
      inputSchema: ListToolGroupsInputSchema,
      handler: listToolGroups,
      requiresAuth: false,
    },
    {
      name: "describe_tool_group",
      description:
        "Show the tools inside one group (name, description, auth requirement) without enabling it. Cheap preview before deciding to load it.",
      inputSchema: DescribeToolGroupInputSchema,
      handler: describeToolGroup,
      requiresAuth: false,
    },
    {
      name: "enable_tool_groups",
      description:
        "Enable one or more tool groups so their tools become callable. Emits notifications/tools/list_changed; the client will refresh its tool list automatically.",
      inputSchema: EnableToolGroupsInputSchema,
      handler: enableToolGroups,
      requiresAuth: false,
    },
    {
      name: "disable_tool_groups",
      description:
        "Disable one or more tool groups to shrink the visible surface and free context. Always-on groups (e.g., 'meta') are refused.",
      inputSchema: DisableToolGroupsInputSchema,
      handler: disableToolGroups,
      requiresAuth: false,
    },
    {
      name: "enable_all_tool_groups",
      description:
        "Enable every registered tool group at once. Use when you know you'll need broad access; prefer enable_tool_groups for targeted enabling.",
      inputSchema: EnableAllToolGroupsInputSchema,
      handler: enableAllToolGroups,
      requiresAuth: false,
    },
    {
      name: "list_appwrite_projects",
      description:
        "List all Appwrite projects this MCP can see: the project bound to this CWD (from appwrite.json / .appwrite/config.yaml), any in-memory override, and every entry in ~/.appwrite/prefs.json. Output is redacted — only hasApiKey/hasCookie booleans, never raw creds.",
      inputSchema: ListAppwriteProjectsInputSchema,
      handler: listAppwriteProjects,
      requiresAuth: false,
    },
    {
      name: "select_appwrite_project",
      description:
        "Pin a project as the active one for THIS MCP server (in-memory only — dies on restart, never persists, never leaks to other MCP instances). Use when auto-resolution picks wrong or you need to temporarily target a different project. Pass only projectId to inherit endpoint/auth from prefs.json; pass endpoint/apiKey/sessionCookie to override them too.",
      inputSchema: SelectAppwriteProjectInputSchema,
      handler: selectAppwriteProject,
      requiresAuth: false,
    },
    {
      name: "clear_appwrite_project",
      description:
        "Remove the in-memory project override set via select_appwrite_project. Resolution falls back to CWD project config / prefs.json.",
      inputSchema: ClearAppwriteProjectInputSchema,
      handler: clearAppwriteProject,
      requiresAuth: false,
    },
  ],
};
