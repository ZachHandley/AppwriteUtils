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
import { chunkCache } from "../../state/chunkCache.js";

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

const QueryHelpInputSchema = z.object({});

const FetchPayloadChunkInputSchema = z.object({
  kind: z
    .string()
    .min(1)
    .describe(
      "Namespace of the cached payload (e.g. 'table-rows', 'table-schema'). Returned to you in a previous tool's chunkRef."
    ),
  key: z
    .string()
    .min(1)
    .describe("Identifier of the cached payload — copy verbatim from the chunkRef."),
  offset: z
    .number()
    .int()
    .nonnegative()
    .default(0)
    .describe("Char offset to start reading from. Default 0."),
  length: z
    .number()
    .int()
    .positive()
    .default(50_000)
    .describe("Max chars to return in this chunk. Default 50_000."),
});

async function fetchPayloadChunk(input: unknown, _context: ToolContext): Promise<unknown> {
  const validated = FetchPayloadChunkInputSchema.parse(input);
  const slice = chunkCache.slice(
    validated.kind,
    validated.key,
    validated.offset,
    validated.length
  );
  if (!slice) {
    throw new Error(
      `No cached payload for kind='${validated.kind}', key='${validated.key}'. Cache entries expire after 5 minutes; re-run the producing tool to refresh.`
    );
  }
  return {
    kind: validated.kind,
    key: validated.key,
    offset: validated.offset,
    length: slice.payload.length,
    totalLength: slice.totalLength,
    eof: slice.eof,
    nextOffset: slice.eof ? null : validated.offset + slice.payload.length,
    payload: slice.payload,
  };
}

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

async function queryHelp(input: unknown, _context: ToolContext): Promise<unknown> {
  QueryHelpInputSchema.parse(input);
  return {
    acceptedForms: [
      {
        form: "SDK syntax",
        example: 'Query.limit(10)',
        notes: "Mirrors the node-appwrite static helpers. The leading 'Query.' is optional, so 'limit(10)' also works.",
      },
      {
        form: "JSON wire format",
        example: '{"method":"limit","values":[10]}',
        notes: "What Appwrite's REST API ultimately receives. Useful when you have a pre-serialized query from another tool.",
      },
    ],
    argumentRules: [
      "Arguments must be JSON-compatible literals: numbers, booleans, double-quoted strings, arrays.",
      "Single-quoted strings are tolerated (auto-converted): Query.equal('status', 'active') works.",
      "Use the bracket form for array args: Query.select([\"$id\",\"name\"]).",
    ],
    methods: {
      pagination: [
        { name: "limit", signature: "(limit: number)", example: "Query.limit(25)" },
        { name: "offset", signature: "(offset: number)", example: "Query.offset(50)" },
        { name: "cursorAfter", signature: "(documentId: string)", example: 'Query.cursorAfter("doc-abc")' },
        { name: "cursorBefore", signature: "(documentId: string)", example: 'Query.cursorBefore("doc-abc")' },
      ],
      ordering: [
        { name: "orderAsc", signature: "(attribute: string)", example: 'Query.orderAsc("$createdAt")' },
        { name: "orderDesc", signature: "(attribute: string)", example: 'Query.orderDesc("$createdAt")' },
        { name: "orderRandom", signature: "()", example: "Query.orderRandom()" },
      ],
      selection: [
        { name: "select", signature: "(attributes: string[])", example: 'Query.select(["$id","name","status"])' },
      ],
      filters: [
        { name: "equal", signature: "(attribute, value | values[])", example: 'Query.equal("status","active")' },
        { name: "notEqual", signature: "(attribute, value)", example: 'Query.notEqual("status","blocked")' },
        { name: "lessThan", signature: "(attribute, value)", example: 'Query.lessThan("duration",1000)' },
        { name: "lessThanEqual", signature: "(attribute, value)", example: 'Query.lessThanEqual("duration",1000)' },
        { name: "greaterThan", signature: "(attribute, value)", example: 'Query.greaterThan("duration",0)' },
        { name: "greaterThanEqual", signature: "(attribute, value)", example: 'Query.greaterThanEqual("duration",0)' },
        { name: "between", signature: "(attribute, start, end)", example: 'Query.between("count",1,100)' },
        { name: "notBetween", signature: "(attribute, start, end)", example: 'Query.notBetween("count",1,100)' },
        { name: "isNull", signature: "(attribute)", example: 'Query.isNull("deletedAt")' },
        { name: "isNotNull", signature: "(attribute)", example: 'Query.isNotNull("deletedAt")' },
        { name: "exists", signature: "(attributes: string[])", example: 'Query.exists(["email"])' },
        { name: "notExists", signature: "(attributes: string[])", example: 'Query.notExists(["email"])' },
        { name: "regex", signature: "(attribute, pattern)", example: 'Query.regex("name","^Acme")' },
        { name: "startsWith", signature: "(attribute, value)", example: 'Query.startsWith("name","Acme")' },
        { name: "endsWith", signature: "(attribute, value)", example: 'Query.endsWith("name","Corp")' },
        { name: "notStartsWith", signature: "(attribute, value)", example: 'Query.notStartsWith("name","Internal")' },
        { name: "notEndsWith", signature: "(attribute, value)", example: 'Query.notEndsWith("name","Test")' },
        { name: "contains", signature: "(attribute, value | values[])", example: 'Query.contains("labels","admin")' },
        { name: "notContains", signature: "(attribute, value | values[])", example: 'Query.notContains("labels","banned")' },
        { name: "containsAny", signature: "(attribute, values[])", example: 'Query.containsAny("labels",["a","b"])' },
        { name: "containsAll", signature: "(attribute, values[])", example: 'Query.containsAll("labels",["x","y"])' },
      ],
      searchAndDates: [
        { name: "search", signature: "(attribute, value)", example: 'Query.search("name","acme")' },
        { name: "notSearch", signature: "(attribute, value)", example: 'Query.notSearch("name","spam")' },
        { name: "createdBefore", signature: "(iso8601: string)", example: 'Query.createdBefore("2025-01-01T00:00:00.000Z")' },
        { name: "createdAfter", signature: "(iso8601: string)", example: 'Query.createdAfter("2025-01-01T00:00:00.000Z")' },
        { name: "createdBetween", signature: "(start, end)", example: 'Query.createdBetween("2025-01-01T00:00:00.000Z","2025-02-01T00:00:00.000Z")' },
        { name: "updatedBefore", signature: "(iso8601: string)", example: 'Query.updatedBefore("2025-01-01T00:00:00.000Z")' },
        { name: "updatedAfter", signature: "(iso8601: string)", example: 'Query.updatedAfter("2025-01-01T00:00:00.000Z")' },
        { name: "updatedBetween", signature: "(start, end)", example: 'Query.updatedBetween("2025-01-01T00:00:00.000Z","2025-02-01T00:00:00.000Z")' },
      ],
      combinators: [
        { name: "or", signature: "(queries: string[])", example: 'Query.or([Query.equal("status","active"),Query.equal("status","pending")])' },
        { name: "and", signature: "(queries: string[])", example: 'Query.and([Query.greaterThan("count",0),Query.lessThan("count",100)])' },
        { name: "elemMatch", signature: "(attribute, queries: string[])", example: 'Query.elemMatch("items",[Query.equal("status","ready")])' },
      ],
      geospatial: [
        { name: "distanceEqual", signature: "(attribute, values[], distance, meters?)" },
        { name: "distanceNotEqual", signature: "(attribute, values[], distance, meters?)" },
        { name: "distanceGreaterThan", signature: "(attribute, values[], distance, meters?)" },
        { name: "distanceLessThan", signature: "(attribute, values[], distance, meters?)" },
        { name: "intersects", signature: "(attribute, values[])" },
        { name: "notIntersects", signature: "(attribute, values[])" },
        { name: "crosses", signature: "(attribute, values[])" },
        { name: "notCrosses", signature: "(attribute, values[])" },
        { name: "overlaps", signature: "(attribute, values[])" },
        { name: "notOverlaps", signature: "(attribute, values[])" },
        { name: "touches", signature: "(attribute, values[])" },
        { name: "notTouches", signature: "(attribute, values[])" },
      ],
    },
    recipes: {
      "Last 10 by date": ['Query.limit(10)', 'Query.orderDesc("$createdAt")'],
      "Count rows matching a filter": ['Query.equal("status","active")', "Query.limit(1)"],
      "Paginate with cursor": ['Query.limit(50)', 'Query.cursorAfter("<lastRowId>")'],
      "Select specific fields only": ['Query.select(["$id","name","status"])'],
      "Search in a column": ['Query.search("name","acme")'],
    },
    notes: [
      "Pass queries as an array of strings on the tool's `queries` parameter. Order matters for cursors and combinators.",
      "Appwrite defaults to 25 rows when no Query.limit is supplied; max is typically 100.",
      "Combinators (and/or/elemMatch) accept queries already serialized to JSON wire form.",
    ],
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
    {
      name: "fetch_payload_chunk",
      description:
        "Pull the next slice of a previously-cached oversized tool response. When a list/get tool returns a chunkRef (e.g. list_rows with >60K rows worth of payload), call this with the kind/key/offset/length from that ref to stream the rest. Cache entries are per-server, in-memory, expire after 5 minutes.",
      inputSchema: FetchPayloadChunkInputSchema,
      handler: fetchPayloadChunk,
      requiresAuth: false,
    },
    {
      name: "query_help",
      description:
        "Reference for the `queries:` parameter shared by every list_* tool. Returns the accepted input forms (Query.limit(10), limit(10), or JSON wire form), every available Query static method grouped by category (filters, pagination, ordering, selection, combinators, geospatial), and common recipes (paginate, select fields, search, etc.). Call this whenever a list tool errors with 'Unknown Query method' or 'not a recognized query format'.",
      inputSchema: QueryHelpInputSchema,
      handler: queryHelp,
      requiresAuth: false,
    },
  ],
};
