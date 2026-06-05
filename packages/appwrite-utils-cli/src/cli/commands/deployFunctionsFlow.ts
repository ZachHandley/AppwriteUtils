import { isAbsolute, resolve as resolvePath, dirname, join } from "node:path";
import fs from "node:fs";
import os from "node:os";
import { Client, Functions } from "node-appwrite";
import {
  MessageFormatter,
  resolveCliCredentials,
  getClientWithAuth,
  findYamlConfig,
} from "appwrite-utils-helpers";
import type { AppwriteFunction } from "appwrite-utils";
import {
  discoverFnConfigs,
  mergeDiscoveredFunctions,
} from "../../functions/fnConfigDiscovery.js";
import {
  deployFunctionsBatch,
  type BatchDeployItem,
} from "../../functions/batchDeploy.js";
import type { UtilsController } from "../../utilsController.js";

/** Per-field CLI overrides — only applied when targeting a single function. */
export interface DeployFunctionFieldOverrides {
  path?: string;
  name?: string;
  runtime?: string;
  entrypoint?: string;
  commands?: string;
  schedule?: string;
  timeout?: number;
  scopes?: string;
  events?: string;
  execute?: string;
  enabled?: boolean;
  logging?: boolean;
  buildSpecification?: string;
  runtimeSpecification?: string;
  predeployCommands?: string;
  deployDir?: string;
  ignore?: string;
  /** Comma-separated domains for --functionDomains. Reconciled after deploy. */
  domains?: string;
  /**
   * When true (from --prebuilt), run the function's `commands` locally and
   * ship the resulting build artifacts inside the tarball; Appwrite is told
   * to skip its build step. Single-function only.
   */
  prebuilt?: boolean;
}

export interface DeployFunctionsFlowOptions {
  cwd: string;
  configPath?: string;
  controller?: UtilsController;
  /** From --functionIds (comma-separated $ids or names). */
  functionIds?: string;
  /** From --functionId (singular, the existing flag). */
  singleFunctionId?: string;
  /** From --buildConcurrency. */
  buildConcurrency?: number;
  /** From --endpoint/--projectId/--apiKey/--sessionCookie on argv. */
  argvCredentials?: {
    endpoint?: string;
    projectId?: string;
    apiKey?: string;
    sessionCookie?: string;
  };
  /** Per-field overrides; only valid when exactly one function is targeted. */
  overrides?: DeployFunctionFieldOverrides;
  /** When true, proxy rules attached to a function but absent from its
   *  declared `domains` list are deleted after deploy. Default: false. */
  pruneDomains?: boolean;
}

function expandTilde(p: string): string {
  if (!p) return p;
  if (p === "~" || p.startsWith("~/")) {
    return p.replace(/^~(?=$|\/|\\)/, os.homedir());
  }
  return p;
}

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Mirror of `functionCommands.deployFunction`'s priority chain — find the
 * source directory on disk given a (possibly partial) function config.
 */
function resolveFunctionSourceDirectory(
  fn: AppwriteFunction,
  yamlBaseDir: string,
  appwriteFolderPath: string | undefined,
  cwd: string,
  cliFunctionPath?: string
): string | null {
  const nameLower = fn.name.toLowerCase().replace(/\s+/g, "-");

  const candidates: string[] = [];

  // Push every sensible anchoring for a user-supplied source string. Absolute
  // strings push themselves only; relative strings are tried against cwd,
  // yamlBaseDir, and the appwrite sidecar folder so a missing anchor doesn't
  // strand the lookup.
  const pushAnchored = (s: string) => {
    const expanded = expandTilde(s);
    if (isAbsolute(expanded)) {
      candidates.push(expanded);
      return;
    }
    candidates.push(resolvePath(cwd, expanded));
    candidates.push(resolvePath(yamlBaseDir, expanded));
    if (appwriteFolderPath) {
      candidates.push(resolvePath(appwriteFolderPath, expanded));
    }
  };

  // CLI override wins over the config-declared dirPath when both are set.
  if (cliFunctionPath) pushAnchored(cliFunctionPath);
  if (fn.dirPath) pushAnchored(fn.dirPath);

  if (appwriteFolderPath) {
    candidates.push(join(appwriteFolderPath, "functions", nameLower));
    candidates.push(join(appwriteFolderPath, "functions", fn.name));
  }
  candidates.push(join(cwd, "functions", nameLower));
  candidates.push(join(cwd, "functions", fn.name));
  candidates.push(join(cwd, nameLower));
  candidates.push(join(cwd, fn.name));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Build an `AppwriteFunction` from the SDK `functions.get` response so we can
 * deploy code against an existing function $id that isn't in any local config.
 */
async function synthesizeFromServer(
  client: Client,
  functionId: string
): Promise<AppwriteFunction | null> {
  try {
    const functions = new Functions(client);
    const remote = (await functions.get(functionId)) as any;
    const fn: AppwriteFunction = {
      $id: remote.$id,
      name: remote.name,
      runtime: remote.runtime,
      execute: remote.execute ?? [],
      events: remote.events ?? [],
      schedule: remote.schedule,
      timeout: remote.timeout,
      enabled: remote.enabled,
      logging: remote.logging,
      entrypoint: remote.entrypoint,
      commands: remote.commands,
      scopes: remote.scopes ?? [],
      installationId: remote.installationId,
      providerRepositoryId: remote.providerRepositoryId,
      providerBranch: remote.providerBranch,
      providerSilentMode: remote.providerSilentMode,
      providerRootDirectory: remote.providerRootDirectory,
      buildSpecification: remote.buildSpecification,
      runtimeSpecification: remote.runtimeSpecification,
    };
    return fn;
  } catch (err: any) {
    const code = err?.code ?? err?.response?.code;
    if (code === 404) return null;
    throw err;
  }
}

function applyOverrides(
  base: AppwriteFunction,
  overrides: DeployFunctionFieldOverrides
): AppwriteFunction {
  const next: AppwriteFunction = { ...base };
  // overrides.path is intentionally NOT merged into next.dirPath here.
  // It's passed separately to resolveFunctionSourceDirectory so a relative
  // CLI --functionPath is anchored against cwd first (and other anchors as
  // fallbacks), independent of how a config-declared dirPath resolves.
  if (overrides.name !== undefined) next.name = overrides.name;
  if (overrides.runtime !== undefined) next.runtime = overrides.runtime as any;
  if (overrides.entrypoint !== undefined) next.entrypoint = overrides.entrypoint;
  if (overrides.commands !== undefined) next.commands = overrides.commands;
  if (overrides.schedule !== undefined) next.schedule = overrides.schedule;
  if (overrides.timeout !== undefined) next.timeout = overrides.timeout;
  if (overrides.scopes !== undefined) {
    next.scopes = splitCsv(overrides.scopes) as any;
  }
  if (overrides.events !== undefined) {
    next.events = splitCsv(overrides.events) as any;
  }
  if (overrides.execute !== undefined) {
    next.execute = splitCsv(overrides.execute);
  }
  if (overrides.enabled !== undefined) next.enabled = overrides.enabled;
  if (overrides.logging !== undefined) next.logging = overrides.logging;
  if (overrides.buildSpecification !== undefined) {
    next.buildSpecification = overrides.buildSpecification as any;
  }
  if (overrides.runtimeSpecification !== undefined) {
    next.runtimeSpecification = overrides.runtimeSpecification as any;
  }
  if (overrides.predeployCommands !== undefined) {
    next.predeployCommands = splitCsv(overrides.predeployCommands);
  }
  if (overrides.deployDir !== undefined) next.deployDir = overrides.deployDir;
  if (overrides.ignore !== undefined) next.ignore = splitCsv(overrides.ignore);
  if (overrides.domains !== undefined) next.domains = splitCsv(overrides.domains);
  if (overrides.prebuilt !== undefined) next.prebuilt = overrides.prebuilt;
  return next;
}

function anyOverrideSet(o: DeployFunctionFieldOverrides | undefined): boolean {
  if (!o) return false;
  return Object.values(o).some((v) => v !== undefined);
}

/**
 * Headless function deploy entry point. Returns the number of failures so the
 * caller can set a non-zero exit code.
 */
export async function runDeployFunctionsFlow(
  opts: DeployFunctionsFlowOptions
): Promise<number> {
  // Force-write any unhandled rejection / uncaught exception to stderr BEFORE
  // main.ts's global handler triggers __awuExit. Without this, silent-exit
  // failures during the upload phase (e.g. winston transport blow-ups during
  // a tar-walk over a large node_modules) terminate the process with no
  // diagnostic. Prepend so we run ahead of main.ts's handler.
  const __deployFlowOnError =
    (kind: string) => (reason: unknown) => {
      process.stderr.write(
        `\n[deployFunctions ${kind}] ${
          reason instanceof Error
            ? (reason.stack ?? reason.message)
            : String(reason)
        }\n`
      );
    };
  process.prependListener(
    "unhandledRejection",
    __deployFlowOnError("unhandledRejection")
  );
  process.prependListener(
    "uncaughtException",
    __deployFlowOnError("uncaughtException")
  );

  const cwd = opts.cwd;

  // 1. Build SDK client. Prefer the controller's already-wired client; fall
  // back to building one from argv credentials (the bare-credentials path).
  let client: Client | undefined = opts.controller?.appwriteServer;
  if (!client) {
    const creds = resolveCliCredentials({ argv: opts.argvCredentials });
    if (!creds) {
      throw new Error(
        "--deployFunctions: no Appwrite credentials found. Pass --endpoint, " +
          "--projectId, and --apiKey (or set APPWRITE_ENDPOINT/APPWRITE_PROJECT_ID/" +
          "APPWRITE_API_KEY), or run from a directory with a configured Appwrite sidecar."
      );
    }
    client = getClientWithAuth(
      creds.endpoint,
      creds.projectId!,
      creds.apiKey,
      opts.argvCredentials?.sessionCookie
    );
  }

  // 2. Discover functions: .fnconfig.yaml files + central config.yaml functions[]
  let discovered: AppwriteFunction[] = [];
  try {
    discovered = discoverFnConfigs(cwd);
  } catch (e) {
    MessageFormatter.warning(
      `--deployFunctions: .fnconfig discovery failed: ${e instanceof Error ? e.message : String(e)}`,
      { prefix: "Functions" }
    );
  }
  const central: AppwriteFunction[] =
    (opts.controller?.config?.functions as AppwriteFunction[] | undefined) ?? [];
  let merged = mergeDiscoveredFunctions(central, discovered);

  // 3. Resolve target ids: --functionIds wins, then --functionId.
  const tokens =
    splitCsv(opts.functionIds).length > 0
      ? splitCsv(opts.functionIds)
      : opts.singleFunctionId
        ? [opts.singleFunctionId]
        : [];

  // 4. Build the selected[] set, falling back to functions.get(server) when a
  // requested $id has no local declaration.
  const selected: AppwriteFunction[] = [];
  if (tokens.length === 0) {
    if (merged.length === 0) {
      throw new Error(
        "--deployFunctions: no functions found. Provide a .fnconfig.yaml in/under " +
          "the cwd, a config.yaml with functions[], or --functionId + --functionPath " +
          "for an ad-hoc deploy."
      );
    }
    selected.push(...merged);
  } else {
    for (const token of tokens) {
      const local = merged.find((f) => f.$id === token || f.name === token);
      if (local) {
        selected.push(local);
        continue;
      }
      // Try server fallback — only meaningful when token looks like an $id.
      const fromServer = await synthesizeFromServer(client, token);
      if (!fromServer) {
        throw new Error(
          `Function not found: ${token}. Pass --functionId of an existing ` +
            `Appwrite function or declare it in .fnconfig.yaml/config.yaml. ` +
            `Available local: ${
              merged.map((f) => f.$id).join(", ") || "<none>"
            }`
        );
      }
      MessageFormatter.info(
        `Using server-side definition for '${fromServer.name}' (${fromServer.$id}) — no local declaration found.`,
        { prefix: "Functions" }
      );
      selected.push(fromServer);
    }
  }

  // 5. Apply per-field overrides — single-function only.
  if (anyOverrideSet(opts.overrides)) {
    if (selected.length !== 1) {
      throw new Error(
        "Per-field overrides (--functionRuntime/--functionEntrypoint/etc.) only " +
          "valid when --deployFunctions targets exactly one function. Got " +
          `${selected.length} targets.`
      );
    }
    selected[0] = applyOverrides(selected[0]!, opts.overrides!);
  }

  // 6. Resolve source directories and build BatchDeployItem[].
  const yamlConfigPath = opts.configPath
    ? isAbsolute(opts.configPath)
      ? opts.configPath
      : resolvePath(cwd, opts.configPath)
    : findYamlConfig(cwd);
  const yamlBaseDir = yamlConfigPath ? dirname(yamlConfigPath) : cwd;
  const appwriteFolderPath = opts.controller?.getAppwriteFolderPath();

  const items: BatchDeployItem[] = [];
  const skipped: string[] = [];
  for (const fn of selected) {
    const dir = resolveFunctionSourceDirectory(
      fn,
      yamlBaseDir,
      appwriteFolderPath,
      cwd,
      opts.overrides?.path
    );
    if (!dir) {
      MessageFormatter.warning(
        `Function "${fn.name}" (${fn.$id}) skipped: source directory not found. ` +
          `Set 'dirPath' in .fnconfig.yaml, place source under <cwd>/functions/<name>/, ` +
          `or pass --functionPath.`,
        { prefix: "Functions" }
      );
      skipped.push(fn.name);
      continue;
    }
    items.push({
      functionName: fn.name,
      functionConfig: { ...fn, dirPath: dir },
      functionPath: dir,
      configDirPath: yamlBaseDir,
    });
  }

  if (items.length === 0) {
    throw new Error(
      `--deployFunctions: nothing to deploy. ${
        skipped.length > 0
          ? `Skipped (source not found): ${skipped.join(", ")}.`
          : ""
      }`
    );
  }

  // 7. Run batch deploy. Exit code is computed from results.
  const results = await deployFunctionsBatch(client, items, {
    buildConcurrency: opts.buildConcurrency,
  });

  // 8. Reconcile proxy rules ("domains") for every function that declared any
  //    and whose deploy succeeded. Failures here don't fail the deploy — the
  //    code is already on the server — but they're logged loudly.
  const { reconcileResourceDomains } = await import("../../functions/proxyRules.js");
  for (const item of items) {
    const declared = (item.functionConfig as AppwriteFunction).domains ?? [];
    if (declared.length === 0) continue;
    const result = results.find((r) => r.functionId === (item.functionConfig as AppwriteFunction).$id);
    if (!result || result.status !== "ready") continue;
    try {
      const summary = await reconcileResourceDomains(
        client,
        "function",
        (item.functionConfig as AppwriteFunction).$id,
        declared,
        { prune: opts.pruneDomains }
      );
      const parts: string[] = [];
      if (summary.created.length) parts.push(`created [${summary.created.join(", ")}]`);
      if (summary.kept.length) parts.push(`kept [${summary.kept.join(", ")}]`);
      if (summary.deleted.length) parts.push(`deleted [${summary.deleted.join(", ")}]`);
      MessageFormatter.success(
        `Domains for ${item.functionName}: ${parts.join("; ") || "no changes"}`,
        { prefix: "Functions" }
      );
    } catch (err) {
      MessageFormatter.error(
        `Failed to reconcile domains for ${item.functionName}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        undefined,
        { prefix: "Functions" }
      );
    }
  }

  return results.filter((r) => r.status === "failed").length + skipped.length;
}
