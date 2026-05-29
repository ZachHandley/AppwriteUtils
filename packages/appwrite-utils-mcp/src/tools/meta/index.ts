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
import { isAbsolute, resolve as resolvePath } from "node:path";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import type { ToolGroupDefinition, ToolContext } from "../ToolGroup.js";
import { chunkCache } from "../../state/chunkCache.js";
import { resolveProjectConfig } from "../../auth/ProjectConfigResolver.js";

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

const SelectAppwriteProjectInputSchema = z
  .object({
    projectId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Appwrite project ID to pin as the active project for this MCP server. Optional when `projectDir` is provided — the project ID is then auto-discovered from the config file in that directory."
      ),
    projectDir: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Absolute path of the project's source directory (the directory containing `appwriteConfig.yaml` / `appwrite.json`). Persisted to `~/.appwrite/projects.json` so future `select_appwrite_project({projectId})` calls can rehydrate it. Supports a leading `~/` shorthand."
      ),
    endpoint: z
      .string()
      .url()
      .optional()
      .describe(
        "Optional endpoint URL. If omitted, the resolver tries to derive one from `projectDir`'s config file, then from `~/.appwrite/prefs.json` (prefs[projectId] direct match, then endpoint scan)."
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
  })
  .refine((v) => !!(v.projectId || v.projectDir), {
    message: "select_appwrite_project requires at least one of `projectId` or `projectDir`.",
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
  const effectiveConfigDir = context.authResolver.getEffectiveConfigDir();
  const prefs = await sessionService.loadSessionPrefs();
  const registeredProjects = context.projectRegistry
    ? await context.projectRegistry.list()
    : [];

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
    effectiveConfigDir,
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
          projectDir: override.projectDir || null,
          hasApiKey: !!override.apiKey,
          hasSessionCookie: !!override.sessionCookie,
        }
      : null,
    registeredProjects: registeredProjects.map((entry) => ({
      projectId: entry.projectId,
      projectDir: entry.projectDir,
      endpoint: entry.endpoint || null,
      prefsKey: entry.prefsKey || null,
      lastSelectedAt: entry.lastSelectedAt,
    })),
    registryPath: context.projectRegistry?.getFilePath() ?? null,
    prefsEntries,
    prefsCount: prefsEntries.length,
  };
}

/**
 * Resolve a user-supplied path (possibly relative or `~/...`) to an absolute
 * directory path. Throws when the path doesn't exist or isn't a directory —
 * fast-fail at selection time beats silently binding to a non-existent dir
 * and surfacing the failure five tool calls later.
 */
async function resolveProjectDirInput(input: string): Promise<string> {
  const expanded =
    input.startsWith("~/") || input === "~"
      ? input.replace(/^~/, homedir())
      : input;
  const abs = isAbsolute(expanded) ? expanded : resolvePath(process.cwd(), expanded);
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(abs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`projectDir does not exist or is unreadable: ${abs} (${msg})`);
  }
  if (!info.isDirectory()) {
    throw new Error(`projectDir is not a directory: ${abs}`);
  }
  return abs;
}

type AuthPinSource = "caller-args" | "yaml-inline" | "prefs-cache" | "prefs-probe" | "none";
type AuthPinMethod = "apikey" | "session" | "none";

interface ResolvedAuthPin {
  apiKey?: string;
  sessionCookie?: string;
  endpoint?: string;
  prefsKey?: string;
  method: AuthPinMethod;
  source: AuthPinSource;
}

/**
 * Resolve which credentials should be pinned onto the AuthResolver override
 * for this select call. Priority:
 *
 *  1. Caller-supplied apiKey / sessionCookie (explicit wins).
 *  2. YAML-inline apiKey / sessionCookie discovered in the project config
 *     (real Appwrite keys only — placeholders like SET_IF_NEEDED are filtered
 *     by ProjectConfigResolver.isRealApiKey before they ever reach us).
 *  3. Cached prefsKey from ~/.appwrite/projects.json — look up the cookie in
 *     prefs.json and live-probe it; use only if the probe passes.
 *  4. findWorkingSession(endpoint, projectId) — probe every prefs.json cookie
 *     against the target endpoint, return the first that works.
 *  5. None — selection still succeeds with identity-only override, response
 *     surfaces a warning so the caller knows auth isn't bound.
 *
 * Returns the resolved auth + source tag for diagnostics.
 */
async function resolveSelectAuth(
  context: ToolContext,
  effectiveEndpoint: string | undefined,
  projectId: string,
  callerApiKey: string | undefined,
  callerSessionCookie: string | undefined,
  yamlInlineApiKey: string | undefined,
  yamlInlineSessionCookie: string | undefined,
  cachedPrefsKey: string | undefined
): Promise<ResolvedAuthPin> {
  // Tier 1 — caller-supplied wins.
  if (callerApiKey) {
    return {
      apiKey: callerApiKey,
      endpoint: effectiveEndpoint,
      method: "apikey",
      source: "caller-args",
    };
  }
  if (callerSessionCookie) {
    return {
      sessionCookie: callerSessionCookie,
      endpoint: effectiveEndpoint,
      method: "session",
      source: "caller-args",
    };
  }

  // Tier 2 — YAML inline.
  if (yamlInlineApiKey) {
    return {
      apiKey: yamlInlineApiKey,
      endpoint: effectiveEndpoint,
      method: "apikey",
      source: "yaml-inline",
    };
  }
  if (yamlInlineSessionCookie) {
    return {
      sessionCookie: yamlInlineSessionCookie,
      endpoint: effectiveEndpoint,
      method: "session",
      source: "yaml-inline",
    };
  }

  // Tier 3/4 — prefs probe. Both need an endpoint to probe against.
  if (!effectiveEndpoint) {
    return { method: "none", source: "none" };
  }

  const sessionService = context.authResolver.getSessionService();

  // Tier 3 — cached prefsKey from the registry. Validate it still works.
  if (cachedPrefsKey) {
    try {
      const prefs = await sessionService.loadSessionPrefs();
      const cached = prefs?.[cachedPrefsKey];
      const cookie = (cached && typeof cached === "object" && "cookie" in cached)
        ? (cached as { cookie?: unknown }).cookie
        : undefined;
      if (typeof cookie === "string" && cookie) {
        const works = await sessionService.isSessionWorking(
          effectiveEndpoint,
          projectId,
          cookie
        );
        if (works) {
          return {
            sessionCookie: cookie,
            endpoint: effectiveEndpoint,
            prefsKey: cachedPrefsKey,
            method: "session",
            source: "prefs-cache",
          };
        }
      }
    } catch {
      /* fall through to fresh probe */
    }
  }

  // Tier 4 — fresh probe across all prefs entries.
  try {
    const hit = await sessionService.findWorkingSession(effectiveEndpoint, projectId);
    if (hit) {
      return {
        sessionCookie: hit.session.cookie,
        endpoint: hit.session.endpoint,
        prefsKey: hit.prefsKey,
        method: "session",
        source: "prefs-probe",
      };
    }
  } catch {
    /* probe failure is non-fatal — treat as "none" */
  }

  return { method: "none", source: "none" };
}

async function selectAppwriteProject(input: unknown, context: ToolContext): Promise<unknown> {
  const parsed = SelectAppwriteProjectInputSchema.parse(input);

  // 1) If a projectDir was provided, resolve + discover the config there.
  let resolvedProjectDir: string | undefined;
  let discoveredProjectId: string | undefined;
  let discoveredEndpoint: string | undefined;
  let discoveredInlineApiKey: string | undefined;
  let discoveredInlineSessionCookie: string | undefined;
  let configSource: string | null = null;
  if (parsed.projectDir) {
    resolvedProjectDir = await resolveProjectDirInput(parsed.projectDir);
    const discovered = await resolveProjectConfig(resolvedProjectDir);
    if (discovered) {
      discoveredProjectId = discovered.projectId;
      discoveredEndpoint = discovered.endpoint;
      discoveredInlineApiKey = discovered.apiKey;
      discoveredInlineSessionCookie = discovered.sessionCookie;
      configSource = discovered.source;
    } else if (!parsed.projectId) {
      throw new Error(
        `No Appwrite config (appwriteConfig.yaml / appwrite.json) was found under ${resolvedProjectDir}. ` +
          `Pass an explicit projectId, or run select_appwrite_project with a projectDir that actually contains a project config.`
      );
    }
  }

  // 2) If only projectId was given, try to rehydrate the dir from the registry.
  let cachedPrefsKey: string | undefined;
  if (!resolvedProjectDir && parsed.projectId && context.projectRegistry) {
    const cached = await context.projectRegistry.get(parsed.projectId);
    if (cached) {
      // Cached path may have been deleted/moved since last selection. Validate
      // before binding so we don't silently keep using a stale path.
      try {
        const info = await stat(cached.projectDir);
        if (info.isDirectory()) {
          resolvedProjectDir = cached.projectDir;
          discoveredEndpoint = discoveredEndpoint ?? cached.endpoint;
          cachedPrefsKey = cached.prefsKey;
        }
      } catch {
        /* stale entry — fall through with no projectDir */
      }
    }
  } else if (parsed.projectId && context.projectRegistry) {
    // Even when projectDir was discovered, opportunistically pick up a
    // previously-cached prefsKey so the auth tier can short-circuit.
    const cached = await context.projectRegistry.get(parsed.projectId);
    if (cached?.prefsKey) cachedPrefsKey = cached.prefsKey;
  }

  // Caller-supplied projectId wins over discovered. Otherwise use the
  // discovered one. At least one path above must produce a projectId, else
  // we have nothing to bind.
  const finalProjectId = parsed.projectId ?? discoveredProjectId;
  if (!finalProjectId) {
    throw new Error(
      "select_appwrite_project: could not determine a projectId. Provide one explicitly or point projectDir at a directory containing a valid appwrite config."
    );
  }

  // Pull a cached prefsKey from the registry when projectId came back via dir
  // discovery (i.e. we didn't go through the projectId-only rehydrate path
  // above).
  if (
    !cachedPrefsKey &&
    discoveredProjectId &&
    !parsed.projectId &&
    context.projectRegistry
  ) {
    const cached = await context.projectRegistry.get(discoveredProjectId);
    if (cached?.prefsKey) cachedPrefsKey = cached.prefsKey;
  }

  const effectiveEndpoint = parsed.endpoint ?? discoveredEndpoint;

  // Eager auth probe — see the doc comment on resolveSelectAuth for the
  // precedence chain.
  const pin = await resolveSelectAuth(
    context,
    effectiveEndpoint,
    finalProjectId,
    parsed.apiKey,
    parsed.sessionCookie,
    discoveredInlineApiKey,
    discoveredInlineSessionCookie,
    cachedPrefsKey
  );

  context.authResolver.setOverride({
    projectId: finalProjectId,
    endpoint: pin.endpoint ?? effectiveEndpoint,
    apiKey: pin.apiKey,
    sessionCookie: pin.sessionCookie,
    projectDir: resolvedProjectDir,
    prefsKey: pin.prefsKey,
  });

  // Invalidate any cached clients keyed on the previous credentials so the
  // next tool call goes through full re-resolution.
  context.clientRegistry.invalidate();

  // Persist the mapping so a future `select_appwrite_project({projectId})`
  // (possibly across an MCP restart) can rehydrate the dir + prefsKey.
  let registryWritten = false;
  if (resolvedProjectDir && context.projectRegistry) {
    try {
      await context.projectRegistry.set(finalProjectId, {
        projectDir: resolvedProjectDir,
        endpoint: pin.endpoint ?? effectiveEndpoint,
        prefsKey: pin.prefsKey,
      });
      registryWritten = true;
    } catch (err) {
      console.error(
        `[appwrite-mcp] failed to persist project registry entry: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Build the warning if no auth was pinned — surfaces the exact diagnostic
  // the caller would otherwise see four tool calls later.
  let warning: string | null = null;
  if (pin.method === "none") {
    if (!effectiveEndpoint) {
      warning =
        `No endpoint resolved for project ${finalProjectId}. The config file at the bound projectDir had no endpoint, and none was passed explicitly. ` +
        `Re-call select_appwrite_project with an explicit endpoint, or set one in the project's appwriteConfig.yaml.`;
    } else {
      warning =
        `No working credentials found for projectId=${finalProjectId} on endpoint=${effectiveEndpoint}. ` +
        `Probed ~/.appwrite/prefs.json (no cookie passed live probe) and the discovered config (no inline apiKey/sessionCookie). ` +
        `Run \`appwrite login\` (or pass apiKey / sessionCookie explicitly) and re-select.`;
    }
  }

  const override = context.authResolver.getOverride()!;
  return {
    active: true,
    projectId: override.projectId,
    endpoint: override.endpoint || null,
    projectDir: override.projectDir || null,
    configSource,
    hasApiKey: !!override.apiKey,
    hasSessionCookie: !!override.sessionCookie,
    authPinned: {
      method: pin.method,
      source: pin.source,
      prefsKey: pin.prefsKey ?? null,
    },
    warning,
    registryWritten,
    registryPath: context.projectRegistry?.getFilePath() ?? null,
    note: "Auth override (endpoint + creds) is in-memory only. The projectId -> projectDir -> prefsKey mapping is persisted to ~/.appwrite/projects.json. Use clear_appwrite_project to drop the in-memory override.",
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
        "Pin a project as the active one for THIS MCP server. Pass `projectDir` (absolute path to a directory containing appwriteConfig.yaml / appwrite.json) to bind both the project ID and the config-discovery directory — required when the MCP was started outside the project's tree (e.g. you cd'd into ~/github and the project lives in ~/github/MyApp). Pass only `projectId` to rehydrate the dir from ~/.appwrite/projects.json (set by prior selections) and inherit endpoint/auth from prefs.json. Pass endpoint/apiKey/sessionCookie to override credentials. The in-memory auth override dies on restart; the projectId -> projectDir mapping persists.",
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
