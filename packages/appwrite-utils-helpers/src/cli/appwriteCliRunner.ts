import { execa } from "execa";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

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
  /**
   * Appwrite project ID. Optional because some flows (`--link`, pre-`init project`)
   * know only the endpoint at the moment they call `injectCredentials`.
   */
  projectId?: string;
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
  /**
   * Tee stdout/stderr to the parent process (real-time output) while still
   * capturing them for the error message. Default `false`.
   */
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
  /**
   * When `true`, skip the read-only copy of `~/.appwrite/prefs.json` into the
   * isolated tmpdir. Default `false`. Set this only if you want the subprocess
   * to start with a completely empty prefs file (i.e. you'll supply
   * credentials or accept that the command will see no auth state at all).
   */
  disablePrefsSeed?: boolean;
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
 * Construct and write a minimal Appwrite CLI `prefs.json` directly to
 * `<homeDir>/.appwrite/prefs.json`. This is the file the official `appwrite`
 * CLI reads to find auth state for `push function`, `push site`, etc.
 *
 * We construct the file by hand instead of shelling out to `appwrite client
 * --reset/--endpoint/--project-id/--key` because those subcommands are
 * Appwrite's, not ours — we should never drive them against the real user
 * HOME (you, the operator, lost session entries to one such test run). The
 * resulting JSON shape matches what Appwrite CLI v20.x's `Global` class
 * produces for a session created via `appwrite client --endpoint X`:
 *
 * ```json
 * {
 *   "current": "<20-char hex session id>",
 *   "<same id>": { "endpoint": "...", "project": "...", "key": "..." }
 * }
 * ```
 *
 * For session-cookie auth, `cookie` is written instead of `key` — the CLI
 * picks the right SDK auth mode based on which field is present (cookie =
 * admin mode, key = default mode).
 *
 * File is written with mode `0600`, same as the official CLI. The directory
 * is created if missing.
 */
export async function writeIsolatedPrefs(
  homeDir: string,
  creds: AppwriteCliCredentials & { sessionCookie?: string },
): Promise<void> {
  const sessionId = randomBytes(10).toString("hex"); // 20-char hex, matches CLI shape
  const sessionEntry: Record<string, string> = {
    endpoint: creds.endpoint,
  };
  if (creds.projectId) {
    sessionEntry.project = creds.projectId;
  }
  if (creds.sessionCookie !== undefined && creds.sessionCookie !== "") {
    sessionEntry.cookie = creds.sessionCookie;
  } else if (creds.apiKey !== undefined && creds.apiKey !== "") {
    sessionEntry.key = creds.apiKey;
  }

  const prefs: Record<string, unknown> = {
    current: sessionId,
    [sessionId]: sessionEntry,
  };

  const dotAppwrite = join(homeDir, ".appwrite");
  await mkdir(dotAppwrite, { recursive: true, mode: 0o700 });
  await writeFile(
    join(dotAppwrite, "prefs.json"),
    JSON.stringify(prefs, null, 4),
    { mode: 0o600 },
  );
}

/**
 * @deprecated Removed. `runAppwriteCli` now always isolates `$HOME` to a
 * tmpdir, so there is no scenario where AppwriteUtils mutates the user's
 * real `~/.appwrite/prefs.json`. Pass `credentials` directly to
 * {@link runAppwriteCli} or build a prefs file in your own tmpdir via
 * {@link writeIsolatedPrefs}.
 *
 * This shim throws on every invocation so any remaining caller (in this
 * repo or downstream) gets a loud, actionable error at first call instead
 * of silently mutating prefs.
 */
export async function injectCredentials(
  _creds?: AppwriteCliCredentials,
  _opts?: { cwd?: string; env?: Record<string, string> },
): Promise<never> {
  throw new Error(
    "injectCredentials() was removed. runAppwriteCli() always isolates HOME now — " +
      "pass `credentials` directly to it instead, or construct a tmpdir prefs file " +
      "via writeIsolatedPrefs(tmpdir, creds). AppwriteUtils never writes to ~/.appwrite/prefs.json.",
  );
}

/**
 * Run an arbitrary appwrite CLI command via `npx --yes --package=appwrite-cli appwrite ...`,
 * with `$HOME` ALWAYS redirected to a throwaway tmpdir so the user's real
 * `~/.appwrite/prefs.json` is never mutated.
 *
 * Subprocess HOME lifecycle:
 *   1. `mkdtemp` a fresh tmpdir under `tmpdir()/appwrite-mcp-cli-*`.
 *   2. Unless `disablePrefsSeed` is true, copy `~/.appwrite/prefs.json` (if
 *      it exists) into the tmpdir READ-ONLY. The real file is opened with
 *      `'r'` only — never `'w'`, never `'a'`. This lets commands that rely
 *      on the user's existing auth (`whoami`, `pull` after `appwrite login`)
 *      keep working.
 *   3. If `credentials` (or env-var creds) are supplied AND `skipAuthBridge`
 *      is false, OVERWRITE the tmpdir prefs with a fresh
 *      {@link writeIsolatedPrefs} write. This is how MCP-driven deploys
 *      pass project+key without ever touching the real prefs.
 *   4. Spawn `npx appwrite ...` with `env.HOME` (and `env.USERPROFILE` for
 *      Windows) set to the tmpdir. The CLI's `Global` class resolves the
 *      prefs path via `os.homedir()` which respects these env vars.
 *   5. Belt-and-suspenders: assert `mergedEnv.HOME !== homedir()` right
 *      before `execa` and abort if violated. A future refactor that drops
 *      the HOME override crashes loudly on first call instead of silently
 *      mutating the real file.
 *   6. `finally`: `rm -rf` the tmpdir so a crashed CLI cannot leak.
 *
 * Other behavior:
 *   - When `opts.json` is true, appends `--json` and attempts `JSON.parse(stdout)`.
 *   - When `opts.force` is true (default), appends `--force`.
 *   - When `opts.stream` is true, stdout/stderr are tee'd to the parent
 *     process AND captured for the error message — real-time output plus
 *     useful errors on failure.
 *   - On non-zero exit, throws an Error containing the captured stderr.
 *
 * Hard guarantee: this function NEVER opens `~/.appwrite/prefs.json` with
 * write or append flags. Verified by `tests/appwriteCliRunner.test.ts`.
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
    disablePrefsSeed = false,
    timeout = DEFAULT_TIMEOUT_MS,
  } = opts;

  const finalArgs = [...args];
  if (json && !finalArgs.includes("--json") && !finalArgs.includes("-j")) {
    finalArgs.push("--json");
  }
  if (force && !finalArgs.includes("--force") && !finalArgs.includes("-f")) {
    finalArgs.push("--force");
  }

  // Invoke the official Appwrite CLI via `npx --yes --package=appwrite-cli appwrite ...`.
  // We deliberately use npx rather than `bunx --bun appwrite` so consumers
  // don't need bun installed in CI just to talk to Appwrite. `appwrite-cli`
  // is declared as a dep of this package, so npx hits the local cache.
  const execaArgs = ["--yes", "--package=appwrite-cli", "appwrite", ...finalArgs];

  const isolatedHome = await mkdtemp(join(tmpdir(), "appwrite-mcp-cli-"));

  try {
    // Step 2: seed-copy real prefs read-only into the tmpdir so commands
    // depending on existing CLI auth (whoami, pull-after-login) work.
    const realPrefs = join(homedir(), ".appwrite", "prefs.json");
    if (!disablePrefsSeed && existsSync(realPrefs)) {
      await mkdir(join(isolatedHome, ".appwrite"), {
        recursive: true,
        mode: 0o700,
      });
      // copyFile opens source with 'r' and sink with 'w' — never mutates the source.
      await copyFile(realPrefs, join(isolatedHome, ".appwrite", "prefs.json"));
    }

    // Step 3: if creds supplied, overwrite seeded prefs with our shape.
    if (!skipAuthBridge) {
      const creds = credentials ?? resolveCredentialsFromEnv();
      if (creds) {
        await writeIsolatedPrefs(isolatedHome, creds);
      }
    }

    // Step 4: build env with HOME redirected to the tmpdir.
    const mergedEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...(extraEnv ?? {}),
      HOME: isolatedHome,
      USERPROFILE: isolatedHome,
    };

    // Step 5: belt-and-suspenders. If a future refactor drops the override,
    // crash here rather than letting the CLI mutate ~/.appwrite/prefs.json.
    if (mergedEnv.HOME === homedir() || mergedEnv.USERPROFILE === homedir()) {
      throw new Error(
        `[appwrite-cli-runner] FATAL: subprocess env.HOME (${mergedEnv.HOME}) ` +
          `equals real homedir() (${homedir()}). This would mutate the user's ` +
          `real ~/.appwrite/prefs.json. Aborting before execa.`,
      );
    }

    // Always run with stdio: pipe so we can capture stderr/stdout into the
    // error message. When `stream: true`, also tee the streams to the parent
    // process so the user sees real-time output.
    const subprocess = execa("npx", execaArgs, {
      cwd,
      env: mergedEnv,
      reject: false,
      timeout,
    });

    if (stream) {
      subprocess.stdout?.pipe(process.stdout, { end: false });
      subprocess.stderr?.pipe(process.stderr, { end: false });
    }

    const result = await subprocess;

    const childSignal =
      typeof (result as { signal?: unknown }).signal === "string"
        ? ((result as { signal: string }).signal as NodeJS.Signals)
        : undefined;
    if (childSignal) {
      // Child died from a signal; mirror it so the parent exits the same way
      // (instead of continuing past the await and dumping a stack later).
      process.kill(process.pid, childSignal);
    }

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
  } finally {
    // Step 6: best-effort cleanup. tmpdir lifecycle is the OS's problem if rm fails.
    await rm(isolatedHome, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * @deprecated Alias for {@link runAppwriteCli} — kept for source-level
 * backwards compatibility. The two are now functionally identical: every
 * `runAppwriteCli` invocation always isolates `$HOME` to a tmpdir.
 */
export const runAppwriteCliIsolated = runAppwriteCli;
