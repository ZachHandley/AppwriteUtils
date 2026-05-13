/**
 * @fileoverview Alternative function deploy path that delegates to the official
 * `appwrite push function` CLI command instead of the SDK.
 *
 * Workflow (per spec):
 *   1. Resolve cwd (use opts.cwd or fresh os.tmpdir() entry).
 *   2. Ensure the function source code is in `<cwd>/appwrite/functions/<$id>/` —
 *      if opts.codePath points elsewhere, copy it in.
 *   3. Generate appwrite.config.json + appwrite/functions.json via
 *      writeOfficialConfig(), with the function entry's `path` field set to
 *      `"./functions/<$id>"` (relative to the `appwrite/` directory that
 *      contains functions.json).
 *   4. Call `bunx --bun appwrite push function --function-id <id>`.
 *   5. Cleanup the temp dir if we created it.
 *   6. Return the AppwriteCliResult.
 *
 * The SDK-based deploy (`FunctionManager.deployFunction`) remains the default;
 * this is an opt-in alternative invoked via `FunctionManager.deployFunctionViaCli`.
 */

import { cp, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import type {
  AppwriteFunction,
  AppwriteUtilsExtension,
  OfficialFunction,
} from "appwrite-utils";
import { writeOfficialConfig } from "../cli/configBridge.js";
import {
  runAppwriteCli,
  type AppwriteCliCredentials,
  type AppwriteCliResult,
} from "../cli/appwriteCliRunner.js";

// ============================================================================
// Public types
// ============================================================================

export interface DeployFunctionViaCliOptions {
  /**
   * Working directory where `appwrite.config.json` + `appwrite/functions.json`
   * should live. If unset, a fresh `os.tmpdir()` entry is created and (by
   * default) cleaned up afterward.
   */
  cwd?: string;
  /**
   * Function source code directory. Will be copied into
   * `<cwd>/appwrite/functions/<$id>/` before the CLI is invoked.
   *
   * If unset, falls back to `functionConfig.dirPath` or — if that is also
   * unset — to the canonical layout `<cwd>/appwrite/functions/<$id>/` (which
   * is assumed to already exist).
   */
  codePath?: string;
  /**
   * Credentials for the auth bridge. If unset, falls back to env vars
   * (handled by `runAppwriteCli` internally).
   */
  credentials?: AppwriteCliCredentials;
  /**
   * Skip the auth bridge — caller has already configured `appwrite client`.
   * Default `false`.
   */
  skipAuthBridge?: boolean;
  /**
   * Whether to delete the generated config / temp dir after deployment.
   *
   * Defaults to `true` when we allocated the cwd (i.e. `opts.cwd` was unset);
   * otherwise the user-provided cwd is preserved regardless of this flag's
   * value.
   */
  cleanup?: boolean;
  /** Stream CLI output to terminal so users see upload progress. Default `true`. */
  stream?: boolean;
  /** Pass `--async` to the CLI to not wait for the deployment to finish. Default `false`. */
  async?: boolean;
}

// ============================================================================
// Internal helpers
// ============================================================================

function assertRequiredFunctionFields(fn: AppwriteFunction): void {
  const missing: string[] = [];
  if (!fn.$id) missing.push("$id");
  if (!fn.name) missing.push("name");
  if (!fn.runtime) missing.push("runtime");
  if (!fn.entrypoint) missing.push("entrypoint");
  if (missing.length > 0) {
    throw new Error(
      `deployFunctionViaCli: functionConfig is missing required field(s): ${missing.join(", ")}`,
    );
  }
}

async function pathExists(absPath: string): Promise<boolean> {
  try {
    await stat(absPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the official-shape function entry from our internal AppwriteFunction.
 *
 * - `path` is set to `./functions/<$id>` (relative to the `appwrite/` directory
 *   that holds `functions.json`).
 * - `ignore` (array in our internal shape) is joined with newlines to match the
 *   official strict schema (`z.string().optional()`). The CLI accepts either at
 *   runtime, but writing a string keeps the JSON valid against the strict
 *   official schema that `writeOfficialConfig` validates against.
 * - `vars` is forwarded if present on the input (typed as a passthrough field).
 */
function toOfficialFunctionEntry(fn: AppwriteFunction): OfficialFunction {
  const entry: OfficialFunction = {
    $id: fn.$id,
    name: fn.name,
    runtime: fn.runtime,
    path: `./functions/${fn.$id}`,
    entrypoint: fn.entrypoint,
    execute: fn.execute ?? [],
  };

  if (fn.events !== undefined) entry.events = fn.events;
  if (fn.schedule !== undefined) entry.schedule = fn.schedule;
  if (fn.timeout !== undefined) entry.timeout = fn.timeout;
  if (fn.enabled !== undefined) entry.enabled = fn.enabled;
  if (fn.logging !== undefined) entry.logging = fn.logging;
  if (fn.commands !== undefined) entry.commands = fn.commands;
  if (fn.scopes !== undefined) entry.scopes = fn.scopes;
  if (fn.buildSpecification !== undefined) {
    entry.buildSpecification = fn.buildSpecification;
  }
  if (fn.runtimeSpecification !== undefined) {
    entry.runtimeSpecification = fn.runtimeSpecification;
  }

  if (fn.ignore !== undefined && fn.ignore.length > 0) {
    entry.ignore = fn.ignore.join("\n");
  }

  // `vars` is not part of our internal `AppwriteFunctionSchema`, but if a
  // caller has stashed it on the object (passthrough) we forward it through.
  const maybeVars = (fn as { vars?: Record<string, string> }).vars;
  if (maybeVars && typeof maybeVars === "object") {
    entry.vars = maybeVars;
  }

  return entry;
}

/**
 * Resolve the absolute source directory for the function's code.
 */
function resolveCodeSource(
  fn: AppwriteFunction,
  opts: DeployFunctionViaCliOptions,
  cwd: string,
): string | null {
  if (opts.codePath) return resolvePath(opts.codePath);
  if (fn.dirPath) return resolvePath(fn.dirPath);
  // Canonical fallback: caller is expected to have already placed the code in
  // the right spot inside `cwd`. We treat that as "no copy needed".
  const canonical = join(cwd, "appwrite", "functions", fn.$id);
  return canonical;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Deploy a single function via `bunx --bun appwrite push function`.
 *
 * Alternative to the SDK-based `FunctionManager.deployFunction`. Generates the
 * official `appwrite.config.json` (+ `appwrite/functions.json` in split layout)
 * in a working directory and invokes the official CLI's push command against
 * it. The SDK path is left untouched and remains the default.
 *
 * @throws If `functionConfig` is missing any of `$id`, `name`, `runtime`, or
 *   `entrypoint` — all required by the official CLI.
 */
export async function deployFunctionViaCli(
  functionConfig: AppwriteFunction,
  opts: DeployFunctionViaCliOptions = {},
): Promise<AppwriteCliResult> {
  assertRequiredFunctionFields(functionConfig);

  // ---- Step 1: resolve cwd -------------------------------------------------
  const allocatedCwd = opts.cwd === undefined;
  const cwd = allocatedCwd
    ? await mkdtemp(join(tmpdir(), "appwrite-utils-fn-deploy-"))
    : resolvePath(opts.cwd!);

  // Cleanup defaults to true when we allocated the cwd ourselves; if the
  // caller passed in their own cwd we leave it alone unless they explicitly
  // opted in.
  const cleanup = opts.cleanup ?? allocatedCwd;

  try {
    // ---- Step 2: place code at <cwd>/appwrite/functions/<$id>/ ------------
    const codeDest = join(cwd, "appwrite", "functions", functionConfig.$id);
    const codeSrc = resolveCodeSource(functionConfig, opts, cwd);

    if (codeSrc !== null) {
      const codeSrcResolved = resolvePath(codeSrc);
      const codeDestResolved = resolvePath(codeDest);

      if (codeSrcResolved !== codeDestResolved) {
        // Only copy when the source actually exists. If it does not exist and
        // we are using the canonical fallback, that's user error — but we
        // surface a clearer message than the CLI would.
        const srcExists = await pathExists(codeSrcResolved);
        if (!srcExists) {
          throw new Error(
            `deployFunctionViaCli: function source directory does not exist at '${codeSrcResolved}'. Pass opts.codePath or set functionConfig.dirPath.`,
          );
        }
        await mkdir(codeDestResolved, { recursive: true });
        await cp(codeSrcResolved, codeDestResolved, {
          recursive: true,
          force: true,
        });
      } else {
        // Source already lives at the canonical destination — nothing to copy,
        // but make sure the directory exists.
        if (!(await pathExists(codeDestResolved))) {
          throw new Error(
            `deployFunctionViaCli: expected function source at '${codeDestResolved}' but the directory does not exist.`,
          );
        }
      }
    }

    // ---- Step 3: write appwrite.config.json + appwrite/functions.json ----
    const officialFn = toOfficialFunctionEntry(functionConfig);

    const projectId =
      opts.credentials?.projectId ?? process.env.APPWRITE_PROJECT_ID ?? "";
    const endpoint =
      opts.credentials?.endpoint ?? process.env.APPWRITE_ENDPOINT;

    if (!projectId) {
      throw new Error(
        "deployFunctionViaCli: projectId is required. Provide opts.credentials.projectId or set APPWRITE_PROJECT_ID.",
      );
    }

    const ext: AppwriteUtilsExtension = {
      apiMode: "auto",
      enableBackups: true,
      backupInterval: 3600,
      backupRetention: 30,
      enableBackupCleanup: true,
      enableMockData: false,
      documentBucketId: "documents",
      usersCollectionName: "Members",
      appwrite: {
        projectId,
        ...(endpoint ? { endpoint } : {}),
        functions: [officialFn],
      },
    };

    await writeOfficialConfig(ext, { outRoot: cwd, layout: "split" });

    // ---- Step 4: invoke the CLI ------------------------------------------
    const args = ["push", "function", "--function-id", functionConfig.$id];
    if (opts.async) {
      args.push("--async");
    }

    const result = await runAppwriteCli(args, {
      cwd,
      stream: opts.stream ?? true,
      json: false,
      force: true,
      credentials: opts.credentials,
      skipAuthBridge: opts.skipAuthBridge ?? false,
    });

    return result;
  } finally {
    // ---- Step 5: cleanup --------------------------------------------------
    if (cleanup) {
      try {
        await rm(cwd, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup; don't mask the underlying error or result.
      }
    }
  }
}
