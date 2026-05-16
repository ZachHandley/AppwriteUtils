import { isAbsolute, resolve as resolvePath, dirname, join } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import {
  findProjectRoot,
  loadExtensionConfig,
  resolveCliCredentials,
  discoverPerFunctionConfigs,
  buildAggregatedFunctionsJson,
  discoverPerSiteConfigs,
  buildAggregatedSitesJson,
  runAppwriteCli,
  getClientWithAuth,
  MessageFormatter,
  type AppwriteCliCredentials,
  type DiscoveredPerFunctionConfig,
} from "appwrite-utils-helpers";
import type { OfficialFunction } from "appwrite-utils";
import { syncFunctionVariables } from "../../functions/methods.js";

export interface RegenFlowOptions {
  /** The `--regen` argument value, e.g. "all", "functions", "functions:funcA". */
  target: string;
  /** From --config <path>. When set, dirname(resolve(configPath)) is project root. */
  configPath?: string;
  /** From --no-deploy. When true, regen JSON only; skip the push call. */
  noDeploy?: boolean;
  /**
   * From --force-overwrite-secrets. When true, the post-push variable sync
   * will overwrite Appwrite-side secret variables. Default is to preserve
   * them. Per-function `forceOverwriteSecrets: true` in the sidecar wins
   * over this flag if set.
   */
  forceOverwriteSecrets?: boolean;
  /** From --endpoint / --projectId / --apiKey on argv. */
  argvCredentials?: {
    endpoint?: string;
    projectId?: string;
    apiKey?: string;
  };
}

interface ParsedTarget {
  kind: "all" | "functions" | "sites" | "unsupported";
  /** Resource name when kind === "unsupported" (for error message). */
  rawResource?: string;
  /** $id when present after a colon. */
  id?: string;
}

const UNSUPPORTED_RESOURCES = new Set([
  "buckets",
  "tablesDB",
  "collections",
  "tables",
  "teams",
  "webhooks",
  "topics",
  "messages",
]);

function parseTarget(value: string): ParsedTarget {
  if (value === "all") return { kind: "all" };
  const [resource, id] = value.split(":", 2);
  if (resource === "functions") {
    return id !== undefined && id.length > 0
      ? { kind: "functions", id }
      : { kind: "functions" };
  }
  if (resource === "sites") {
    return id !== undefined && id.length > 0
      ? { kind: "sites", id }
      : { kind: "sites" };
  }
  if (resource && UNSUPPORTED_RESOURCES.has(resource)) {
    return { kind: "unsupported", rawResource: resource };
  }
  throw new Error(
    `--regen: unknown target '${value}'. Supported: all | functions[:<id>] | sites[:<id>].`
  );
}

export async function runRegenFlow(opts: RegenFlowOptions): Promise<void> {
  // Resolve project root: explicit --config wins, else walk up via findProjectRoot
  let projectRoot: string;
  if (opts.configPath) {
    const abs = isAbsolute(opts.configPath)
      ? opts.configPath
      : resolvePath(process.cwd(), opts.configPath);
    projectRoot = dirname(abs);
  } else {
    const { root } = await findProjectRoot();
    projectRoot = root;
  }

  // Sidecar auth is optional — credentials may come from argv/env alone
  let sidecarAuth:
    | {
        endpoint?: string;
        projectId?: string;
        apiKey?: string;
        sessionCookie?: string;
      }
    | undefined;
  try {
    const loaded = await loadExtensionConfig({
      cwd: projectRoot,
      ...(opts.configPath ? { path: opts.configPath } : {}),
      resolveOfficial: false,
    });
    sidecarAuth = loaded.ext.auth;
  } catch {
    // No sidecar — credentials must come from argv/env
  }

  const credentials = resolveCliCredentials({
    argv: opts.argvCredentials,
    sidecarAuth,
  });

  const target = parseTarget(opts.target);

  if (target.kind === "unsupported") {
    throw new Error(
      `--regen ${target.rawResource}: not yet supported in --regen V1. ` +
        `Use --regen all (rebuilds + pushes everything) or ` +
        `'appwrite-migrate --passthrough -- push ${target.rawResource}' for a direct CLI passthrough.`
    );
  }

  if (target.kind === "all") {
    await regenAll(
      projectRoot,
      opts.noDeploy ?? false,
      credentials,
      opts.forceOverwriteSecrets ?? false
    );
    return;
  }
  if (target.kind === "functions") {
    await regenFunctions(
      projectRoot,
      target.id,
      opts.noDeploy ?? false,
      credentials,
      opts.forceOverwriteSecrets ?? false
    );
    return;
  }
  await regenSites(
    projectRoot,
    target.id,
    opts.noDeploy ?? false,
    credentials
  );
}

/**
 * Strip `vars` from every official function entry so that
 * `appwrite push function` never touches Appwrite-side variables — we sync
 * them separately via {@link syncFunctionVariables} with skip-secret logic.
 * Returns the (mutated) array AND a map of $id → original vars.
 */
function stripVarsFromOfficial(
  official: OfficialFunction[]
): { stripped: OfficialFunction[]; varsById: Map<string, Record<string, string>> } {
  const varsById = new Map<string, Record<string, string>>();
  const stripped = official.map((fn) => {
    const cloned = { ...fn } as OfficialFunction & {
      vars?: Record<string, string>;
    };
    if (cloned.vars && Object.keys(cloned.vars).length > 0) {
      varsById.set(cloned.$id, { ...cloned.vars });
    }
    delete cloned.vars;
    return cloned;
  });
  return { stripped, varsById };
}

/**
 * After `appwrite push function` succeeds, push the stripped variables
 * ourselves via the SDK, honoring per-function `forceOverwriteSecrets` from
 * the sidecar (or the global flag) so Appwrite-side secrets survive.
 */
async function syncVariablesForDiscoveredFunctions(
  configs: DiscoveredPerFunctionConfig[],
  varsById: Map<string, Record<string, string>>,
  credentials: AppwriteCliCredentials | undefined,
  globalForceOverwriteSecrets: boolean
): Promise<void> {
  if (varsById.size === 0) {
    MessageFormatter.debug(
      "No local function variables to sync — skipping post-push var sync.",
      undefined,
      { prefix: "Variables" }
    );
    return;
  }

  if (!credentials?.endpoint || !credentials?.projectId || !credentials?.apiKey) {
    MessageFormatter.warning(
      "Cannot sync function variables: endpoint/projectId/apiKey not available. " +
        "Set --endpoint/--projectId/--apiKey or configure the AppwriteUtils sidecar auth block.",
      { prefix: "Variables" }
    );
    return;
  }

  const client = getClientWithAuth(
    credentials.endpoint,
    credentials.projectId,
    credentials.apiKey
  );

  for (const config of configs) {
    const vars = varsById.get(config.id);
    if (!vars) continue;

    const perFunctionForce = Boolean(
      (config.parsed as { forceOverwriteSecrets?: boolean }).forceOverwriteSecrets
    );
    const force = perFunctionForce || globalForceOverwriteSecrets;

    try {
      await syncFunctionVariables(client, config.id, vars, {
        forceOverwriteSecrets: force,
      });
    } catch (err) {
      MessageFormatter.error(
        `Failed to sync variables for ${config.id}`,
        err instanceof Error ? err : undefined,
        { prefix: "Variables" }
      );
    }
  }
}

async function regenAll(
  projectRoot: string,
  noDeploy: boolean,
  credentials: AppwriteCliCredentials | undefined,
  forceOverwriteSecrets: boolean
): Promise<void> {
  const fns = await discoverPerFunctionConfigs(projectRoot);
  let fnVarsById: Map<string, Record<string, string>> = new Map();
  if (fns.length > 0) {
    const official = buildAggregatedFunctionsJson(fns);
    // Strip vars before writing so `appwrite push function` does not touch
    // Appwrite-side variables — we sync them post-push with skip-secret logic.
    const { stripped, varsById } = stripVarsFromOfficial(official);
    fnVarsById = varsById;
    const outPath = join(projectRoot, "appwrite", "functions.json");
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(stripped, null, 2)}\n`, "utf8");
    MessageFormatter.info(`Wrote ${fns.length} function(s) to ${outPath}`, {
      prefix: "Regen",
    });
  }

  const sites = await discoverPerSiteConfigs(projectRoot);
  if (sites.length > 0) {
    const official = buildAggregatedSitesJson(sites);
    const outPath = join(projectRoot, "appwrite", "sites.json");
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(official, null, 2)}\n`, "utf8");
    MessageFormatter.info(`Wrote ${sites.length} site(s) to ${outPath}`, {
      prefix: "Regen",
    });
  }

  if (noDeploy) {
    MessageFormatter.info("--no-deploy: skipping push", { prefix: "Regen" });
    return;
  }

  await runAppwriteCli(["push", "all"], {
    cwd: projectRoot,
    credentials,
    force: true,
    stream: true,
  });

  // Post-push variable sync (skip-secret aware).
  await syncVariablesForDiscoveredFunctions(
    fns,
    fnVarsById,
    credentials,
    forceOverwriteSecrets
  );
}

async function regenFunctions(
  projectRoot: string,
  id: string | undefined,
  noDeploy: boolean,
  credentials: AppwriteCliCredentials | undefined,
  forceOverwriteSecrets: boolean
): Promise<void> {
  const fns = await discoverPerFunctionConfigs(projectRoot);
  if (fns.length === 0) {
    throw new Error(
      `--regen functions: no per-function YAMLs found at ${projectRoot}/functions/*/appwrite-utils.{yaml,yml,json}. ` +
        `Add per-function YAMLs or use --regen all to push the inline-config functions.`
    );
  }
  if (id !== undefined) {
    const match = fns.find((c) => c.id === id);
    if (!match) {
      throw new Error(
        `--regen functions:${id}: no per-function YAML found with $id '${id}'. ` +
          `Discovered $ids: ${fns.map((c) => c.id).join(", ") || "(none)"}.`
      );
    }
  }

  const official = buildAggregatedFunctionsJson(fns);
  // Strip vars before writing so `appwrite push function` does not touch
  // Appwrite-side variables — we sync them post-push with skip-secret logic.
  const { stripped, varsById } = stripVarsFromOfficial(official);
  const outPath = join(projectRoot, "appwrite", "functions.json");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(stripped, null, 2)}\n`, "utf8");
  MessageFormatter.info(`Wrote ${fns.length} function(s) to ${outPath}`, {
    prefix: "Regen",
  });

  if (noDeploy) {
    MessageFormatter.info("--no-deploy: skipping push", { prefix: "Regen" });
    return;
  }

  // appwrite CLI: `push function --function-id <id>` for one, omit flag for all (push.ts:3871-3885)
  const pushArgs =
    id !== undefined
      ? ["push", "function", "--function-id", id]
      : ["push", "function"];
  await runAppwriteCli(pushArgs, {
    cwd: projectRoot,
    credentials,
    force: true,
    stream: true,
  });

  // Post-push variable sync (skip-secret aware). If targeting a single
  // function, restrict the sync to just that one.
  const targeted = id !== undefined ? fns.filter((c) => c.id === id) : fns;
  const targetedVars = new Map<string, Record<string, string>>();
  for (const c of targeted) {
    const v = varsById.get(c.id);
    if (v) targetedVars.set(c.id, v);
  }
  await syncVariablesForDiscoveredFunctions(
    targeted,
    targetedVars,
    credentials,
    forceOverwriteSecrets
  );
}

async function regenSites(
  projectRoot: string,
  id: string | undefined,
  noDeploy: boolean,
  credentials: AppwriteCliCredentials | undefined
): Promise<void> {
  const sites = await discoverPerSiteConfigs(projectRoot);
  if (sites.length === 0) {
    throw new Error(
      `--regen sites: no per-site YAMLs found at ${projectRoot}/sites/*/appwrite-utils.{yaml,yml,json}. ` +
        `Add per-site YAMLs or use --regen all to push the inline-config sites.`
    );
  }
  if (id !== undefined) {
    const match = sites.find((c) => c.id === id);
    if (!match) {
      throw new Error(
        `--regen sites:${id}: no per-site YAML found with $id '${id}'. ` +
          `Discovered $ids: ${sites.map((c) => c.id).join(", ") || "(none)"}.`
      );
    }
  }

  const official = buildAggregatedSitesJson(sites);
  const outPath = join(projectRoot, "appwrite", "sites.json");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(official, null, 2)}\n`, "utf8");
  MessageFormatter.info(`Wrote ${sites.length} site(s) to ${outPath}`, {
    prefix: "Regen",
  });

  if (noDeploy) {
    MessageFormatter.info("--no-deploy: skipping push", { prefix: "Regen" });
    return;
  }

  // appwrite CLI: `push site --site-id <id>` for one, omit flag for all (push.ts:3887-3902)
  const pushArgs =
    id !== undefined ? ["push", "site", "--site-id", id] : ["push", "site"];
  await runAppwriteCli(pushArgs, {
    cwd: projectRoot,
    credentials,
    force: true,
    stream: true,
  });
}
