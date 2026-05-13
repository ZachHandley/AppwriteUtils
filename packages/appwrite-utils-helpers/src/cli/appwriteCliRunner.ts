import { execa } from "execa";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Credentials used to bridge auth into the official Appwrite CLI.
 *
 * The official CLI stores its state in `~/.appwrite/prefs.json`. We can either
 * configure the CLI explicitly (via `appwrite client --endpoint ... --project-id ... --key ...`)
 * or rely on an existing session cookie that the user previously created with
 * `appwrite login`.
 */
export interface AppwriteCliCredentials {
  /** Appwrite endpoint, e.g. "https://cloud.appwrite.io/v1". */
  endpoint: string;
  /** Appwrite project ID. */
  projectId: string;
  /** Optional API key for non-interactive auth via `appwrite client --key`. */
  apiKey?: string;
}

/**
 * Options for running an Appwrite CLI command.
 */
export interface AppwriteCliRunOptions {
  /** Working directory for the CLI invocation. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Pass `--json` to the appwrite CLI and parse stdout as JSON. */
  json?: boolean;
  /** Pass `--force` to skip interactive confirmations. Default `true`. */
  force?: boolean;
  /** Stream stdout/stderr to the parent process. Default `false`. */
  stream?: boolean;
  /** Extra env vars merged onto `process.env` for this invocation. */
  env?: Record<string, string>;
  /** Skip the auth bridging step (caller has already configured `appwrite client`). Default `false`. */
  skipAuthBridge?: boolean;
  /**
   * Credentials for auth bridging. If omitted and `skipAuthBridge` is false,
   * falls back to APPWRITE_ENDPOINT / APPWRITE_PROJECT_ID / APPWRITE_API_KEY env vars.
   */
  credentials?: AppwriteCliCredentials;
  /** Timeout in ms. Default 10 minutes. */
  timeout?: number;
}

/**
 * Result of running an Appwrite CLI command.
 */
export interface AppwriteCliResult<T = unknown> {
  /** Parsed JSON when `opts.json` was true; otherwise undefined. */
  data?: T;
  /** Raw stdout. */
  stdout: string;
  /** Raw stderr. */
  stderr: string;
  /** Exit code (0 = success). */
  exitCode: number;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Resolves the path to the Appwrite CLI prefs file at call time so tests can
 * point at a temp HOME without re-importing the module.
 */
function getPrefsPath(): string {
  return join(homedir(), ".appwrite", "prefs.json");
}

/**
 * The known top-level preference keys the Appwrite CLI persists outside of
 * per-session blobs. Used to differentiate "session entries" from metadata
 * when scanning ~/.appwrite/prefs.json.
 */
const RESERVED_PREFS_KEYS: ReadonlySet<string> = new Set([
  "current",
  "endpoint",
  "email",
  "selfSigned",
  "cookie",
  "project",
  "key",
  "locale",
  "mode",
]);

interface CliSessionEntry {
  endpoint?: string;
  email?: string;
  cookie?: string;
  project?: string;
  projectId?: string;
  key?: string;
}

interface CliPrefsFile {
  current?: string;
  endpoint?: string;
  email?: string;
  selfSigned?: boolean;
  cookie?: string;
  project?: string;
  projectId?: string;
  key?: string;
  locale?: string;
  mode?: string;
  [sessionId: string]: unknown;
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/, "").toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPrefsFile(): CliPrefsFile | null {
  try {
    const prefsPath = getPrefsPath();
    if (!existsSync(prefsPath)) {
      return null;
    }
    const content = readFileSync(prefsPath, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }
    return parsed as CliPrefsFile;
  } catch {
    return null;
  }
}

function entryHasUsableAuth(entry: CliSessionEntry): boolean {
  const cookie = typeof entry.cookie === "string" ? entry.cookie.trim() : "";
  const key = typeof entry.key === "string" ? entry.key.trim() : "";
  return cookie.length > 0 || key.length > 0;
}

function entryMatches(
  entry: CliSessionEntry,
  endpoint: string,
  projectId: string,
): boolean {
  const entryEndpoint =
    typeof entry.endpoint === "string" ? entry.endpoint : "";
  if (normalizeEndpoint(entryEndpoint) !== normalizeEndpoint(endpoint)) {
    return false;
  }
  const entryProjectId =
    (typeof entry.project === "string" && entry.project) ||
    (typeof entry.projectId === "string" && entry.projectId) ||
    "";
  return entryProjectId === projectId;
}

/**
 * Check whether ~/.appwrite/prefs.json already has working credentials for the
 * given endpoint + projectId. Returns true if a usable session (cookie or API key)
 * is present and matches.
 *
 * Reads the prefs file directly — does not call the CLI.
 */
export async function hasCliPrefsFor(
  endpoint: string,
  projectId: string,
): Promise<boolean> {
  const prefs = readPrefsFile();
  if (!prefs) {
    return false;
  }

  // Case 1: legacy / flat layout — top-level endpoint + project + (cookie | key)
  const flatEndpoint = typeof prefs.endpoint === "string" ? prefs.endpoint : "";
  const flatProject =
    (typeof prefs.project === "string" && prefs.project) ||
    (typeof prefs.projectId === "string" && prefs.projectId) ||
    "";
  if (
    flatEndpoint &&
    flatProject &&
    normalizeEndpoint(flatEndpoint) === normalizeEndpoint(endpoint) &&
    flatProject === projectId &&
    entryHasUsableAuth({
      cookie: typeof prefs.cookie === "string" ? prefs.cookie : undefined,
      key: typeof prefs.key === "string" ? prefs.key : undefined,
    })
  ) {
    return true;
  }

  // Case 2: per-session layout — current session entry matches
  const currentId = typeof prefs.current === "string" ? prefs.current : "";
  if (currentId) {
    const currentEntry = prefs[currentId];
    if (
      isRecord(currentEntry) &&
      entryMatches(currentEntry as CliSessionEntry, endpoint, projectId) &&
      entryHasUsableAuth(currentEntry as CliSessionEntry)
    ) {
      return true;
    }
  }

  // Case 3: project-keyed layout — prefs[projectId] = { endpoint, cookie, ... }
  const projectEntry = prefs[projectId];
  if (
    isRecord(projectEntry) &&
    entryMatches(
      { ...projectEntry, project: projectId } as CliSessionEntry,
      endpoint,
      projectId,
    ) &&
    entryHasUsableAuth(projectEntry as CliSessionEntry)
  ) {
    return true;
  }

  // Case 4: any session entry matches
  for (const [key, value] of Object.entries(prefs)) {
    if (RESERVED_PREFS_KEYS.has(key)) continue;
    if (!isRecord(value)) continue;
    if (
      entryMatches(value as CliSessionEntry, endpoint, projectId) &&
      entryHasUsableAuth(value as CliSessionEntry)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Resolve credentials from env vars APPWRITE_ENDPOINT / APPWRITE_PROJECT_ID / APPWRITE_API_KEY.
 * Returns undefined if endpoint OR projectId is missing.
 */
export function resolveCredentialsFromEnv():
  | AppwriteCliCredentials
  | undefined {
  const endpoint = process.env.APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY;

  if (!endpoint || !projectId) {
    return undefined;
  }

  const creds: AppwriteCliCredentials = {
    endpoint,
    projectId,
  };
  if (apiKey) {
    creds.apiKey = apiKey;
  }
  return creds;
}

/**
 * Configure the appwrite CLI's client (writes to ~/.appwrite/prefs.json).
 *
 * Internally runs (in sequence so the CLI processes flags in the right order):
 *   1. `appwrite client --reset`            (clear any previous sessions)
 *   2. `appwrite client --endpoint <X>`     (creates a new session entry)
 *   3. `appwrite client --project-id <Y>`   (sets project ID in local config)
 *   4. `appwrite client --key <K>`          (only if apiKey is provided)
 *
 * The CLI requires endpoint to be set before key (it errors with
 * "Session not found" otherwise), so they cannot be combined in one call.
 *
 * Idempotent — safe to call before every operation.
 */
export async function injectCredentials(
  creds: AppwriteCliCredentials,
  opts?: { cwd?: string },
): Promise<void> {
  const cwd = opts?.cwd ?? process.cwd();
  const baseEnv = { ...process.env };

  const runClient = async (args: string[]): Promise<void> => {
    const result = await execa("bunx", ["--bun", "appwrite", "client", ...args], {
      cwd,
      env: baseEnv,
      reject: false,
      timeout: DEFAULT_TIMEOUT_MS,
    });
    if (result.exitCode !== 0) {
      const stderr =
        typeof result.stderr === "string" ? result.stderr : String(result.stderr ?? "");
      throw new Error(
        `Failed to configure Appwrite CLI client (args: ${args.join(" ")}): ${stderr.trim() || "non-zero exit"}`,
      );
    }
  };

  await runClient(["--reset"]);
  await runClient(["--endpoint", creds.endpoint]);
  await runClient(["--project-id", creds.projectId]);
  if (creds.apiKey !== undefined) {
    await runClient(["--key", creds.apiKey]);
  }
}

/**
 * Run an arbitrary appwrite CLI command via `bunx --bun appwrite ...`.
 *
 * Performs auth bridging unless `skipAuthBridge` is true. Auth bridging:
 *   - Resolves credentials from `opts.credentials` or env vars.
 *   - If `hasCliPrefsFor(endpoint, projectId)` is true, skips injection.
 *   - Otherwise calls `injectCredentials` to configure the CLI.
 *
 * Behavior:
 *   - When `opts.json` is true, appends `--json` and attempts `JSON.parse(stdout)`.
 *   - When `opts.force` is true (default), appends `--force`.
 *   - When `opts.stream` is true, stdout/stderr are inherited (still captured exit code).
 *   - On non-zero exit, throws an Error containing stderr.
 */
export async function runAppwriteCli<T = unknown>(
  args: string[],
  opts: AppwriteCliRunOptions = {},
): Promise<AppwriteCliResult<T>> {
  const {
    cwd = process.cwd(),
    json = false,
    force = true,
    stream = false,
    env: extraEnv,
    skipAuthBridge = false,
    credentials,
    timeout = DEFAULT_TIMEOUT_MS,
  } = opts;

  if (!skipAuthBridge) {
    const creds = credentials ?? resolveCredentialsFromEnv();
    if (creds) {
      const alreadyConfigured = await hasCliPrefsFor(
        creds.endpoint,
        creds.projectId,
      );
      if (!alreadyConfigured) {
        await injectCredentials(creds, { cwd });
      }
    }
  }

  const finalArgs = [...args];
  if (json && !finalArgs.includes("--json") && !finalArgs.includes("-j")) {
    finalArgs.push("--json");
  }
  if (force && !finalArgs.includes("--force") && !finalArgs.includes("-f")) {
    finalArgs.push("--force");
  }

  const mergedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...(extraEnv ?? {}),
  };

  const execaArgs = ["--bun", "appwrite", ...finalArgs];

  const result = stream
    ? await execa("bunx", execaArgs, {
        cwd,
        env: mergedEnv,
        reject: false,
        timeout,
        stdout: ["inherit", "pipe"],
        stderr: ["inherit", "pipe"],
      })
    : await execa("bunx", execaArgs, {
        cwd,
        env: mergedEnv,
        reject: false,
        timeout,
      });

  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  const exitCode = typeof result.exitCode === "number" ? result.exitCode : 1;

  if (exitCode !== 0) {
    const detail = stderr.trim() || stdout.trim() || "non-zero exit";
    throw new Error(
      `appwrite ${finalArgs.join(" ")} failed (exit ${exitCode}): ${detail}`,
    );
  }

  const output: AppwriteCliResult<T> = {
    stdout,
    stderr,
    exitCode,
  };

  if (json) {
    try {
      output.data = JSON.parse(stdout) as T;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to parse JSON output from 'appwrite ${finalArgs.join(" ")}': ${message}\nStdout: ${stdout}`,
      );
    }
  }

  return output;
}
