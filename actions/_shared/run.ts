#!/usr/bin/env bun
/**
 * Shared orchestration script for the appwrite-utils GitHub Actions.
 *
 * Each composite action forwards its inputs as AWU_* environment variables and
 * invokes this script with `bun`. The script translates them into an
 * `appwrite-migrate` invocation run through `bunx`, so the published CLI is
 * fetched and executed without ever going through a pnpm install gate (which
 * would interactively prompt to approve esbuild's build script and hang CI).
 *
 * No npm dependencies: only Node/Bun built-ins. Bun runs this .ts file directly,
 * so there is no build step.
 *
 * Secrets (the API key) are passed to the child via the environment only, never
 * on argv, and are never printed.
 */
import { spawnSync } from "node:child_process";

function env(name: string): string | undefined {
  const v = process.env[name];
  if (v === undefined) return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Minimal POSIX-ish tokenizer for the generic action's raw `args` input. No eval. */
function tokenizeArgs(input: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let inSingle = false;
  let inDouble = false;
  let sawToken = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inSingle) {
      if (ch === "'") inSingle = false;
      else cur += ch;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      else if (ch === "\\" && (input[i + 1] === '"' || input[i + 1] === "\\")) {
        cur += input[++i];
      } else cur += ch;
      continue;
    }
    if (ch === "'") { inSingle = true; sawToken = true; continue; }
    if (ch === '"') { inDouble = true; sawToken = true; continue; }
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      if (sawToken) { tokens.push(cur); cur = ""; sawToken = false; }
      continue;
    }
    cur += ch;
    sawToken = true;
  }
  if (inSingle || inDouble) {
    throw new Error("AWU_ARGS: unbalanced quotes in args input");
  }
  if (sawToken) tokens.push(cur);
  return tokens;
}

function pushFlag(argv: string[], flag: string, value: string | undefined) {
  if (value !== undefined) argv.push(flag, value);
}

function buildArgv(): string[] {
  const command = env("AWU_COMMAND");
  if (!command) throw new Error("AWU_COMMAND is required");

  const argv: string[] = [];

  switch (command) {
    case "deploy-functions": {
      argv.push("--deployFunctions");
      pushFlag(argv, "--functionIds", env("AWU_FUNCTION_IDS"));
      pushFlag(argv, "--functionPath", env("AWU_FUNCTION_PATH"));
      pushFlag(argv, "--buildConcurrency", env("AWU_BUILD_CONCURRENCY"));
      pushFlag(argv, "--config", env("AWU_CONFIG"));
      // Single-function overrides (CLI rejects these unless exactly one fn is targeted).
      pushFlag(argv, "--functionName", env("AWU_FN_NAME"));
      pushFlag(argv, "--functionRuntime", env("AWU_FN_RUNTIME"));
      pushFlag(argv, "--functionEntrypoint", env("AWU_FN_ENTRYPOINT"));
      pushFlag(argv, "--functionCommands", env("AWU_FN_COMMANDS"));
      pushFlag(argv, "--functionSchedule", env("AWU_FN_SCHEDULE"));
      pushFlag(argv, "--functionTimeout", env("AWU_FN_TIMEOUT"));
      pushFlag(argv, "--functionScopes", env("AWU_FN_SCOPES"));
      pushFlag(argv, "--functionEvents", env("AWU_FN_EVENTS"));
      pushFlag(argv, "--functionExecute", env("AWU_FN_EXECUTE"));
      // Boolean overrides: pass as --flag=value so yargs records the explicit value.
      const enabled = env("AWU_FN_ENABLED");
      if (enabled !== undefined) argv.push(`--functionEnabled=${enabled}`);
      const logging = env("AWU_FN_LOGGING");
      if (logging !== undefined) argv.push(`--functionLogging=${logging}`);
      break;
    }
    case "push": {
      argv.push("--push");
      pushFlag(argv, "--config", env("AWU_CONFIG"));
      break;
    }
    case "raw": {
      const raw = env("AWU_ARGS");
      if (!raw) throw new Error("AWU_ARGS is required for the generic action");
      argv.push(...tokenizeArgs(raw));
      break;
    }
    default:
      throw new Error(`Unknown AWU_COMMAND: ${command}`);
  }

  return argv;
}

function main(): number {
  const argv = buildArgv();
  const cliVersion = env("AWU_CLI_VERSION") ?? "latest";
  const workingDir = env("AWU_WORKING_DIR") ?? ".";

  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  // The CLI reads these (resolveCliCredentials). Passing via env keeps the API
  // key off the command line and out of any logged argv.
  const endpoint = env("AWU_ENDPOINT");
  const projectId = env("AWU_PROJECT_ID");
  const apiKey = env("AWU_API_KEY");
  if (endpoint) childEnv.APPWRITE_ENDPOINT = endpoint;
  if (projectId) childEnv.APPWRITE_PROJECT_ID = projectId;
  if (apiKey) childEnv.APPWRITE_API_KEY = apiKey;

  const bunxArgs = [
    "--package=appwrite-utils-cli@" + cliVersion,
    "appwrite-migrate",
    ...argv,
  ];

  // argv contains no secrets (creds go via env), so this is safe to print.
  console.log(`> bunx ${bunxArgs.join(" ")}  (cwd: ${workingDir})`);

  const result = spawnSync("bunx", bunxArgs, {
    cwd: workingDir,
    env: childEnv,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`Failed to run appwrite-migrate: ${result.error.message}`);
    return 1;
  }
  if (typeof result.status === "number") return result.status;
  // Terminated by signal.
  return 1;
}

process.exit(main());
