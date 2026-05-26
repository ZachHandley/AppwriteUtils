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
  cwd: string
): string | null {
  const nameLower = fn.name.toLowerCase().replace(/\s+/g, "-");

  const candidates: string[] = [];

  if (fn.dirPath) {
    const expanded = expandTilde(fn.dirPath);
    candidates.push(
      isAbsolute(expanded) ? expanded : resolvePath(yamlBaseDir, expanded)
    );
  }
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
  if (overrides.path !== undefined) next.dirPath = expandTilde(overrides.path);
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
      cwd
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
  return results.filter((r) => r.status === "failed").length + skipped.length;
}
