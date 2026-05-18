/**
 * Unified error logger for the Appwrite MCP server.
 *
 * Every tool-call failure flows through `logToolError` so the user running
 * the MCP under Claude Code (or any other host) can actually see what went
 * wrong on stderr — `error.message` alone usually drops the Appwrite error
 * code, type, and response body that make a 401/404/500 actionable.
 *
 * Secret hygiene is non-negotiable here: tool arguments often include
 * `apiKey`, `sessionCookie`, or other credentials. `redactArgs` strips known
 * sensitive keys AND any string value that pattern-matches an Appwrite API
 * key prefix or session cookie before either stderr or the optional log
 * file ever sees it. Verify with `git grep` of any new redaction rules
 * against `[REDACTED]` before extending this surface.
 *
 * @packageDocumentation
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  statSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Snapshot of which Appwrite endpoint/project the tool was trying to reach
 * when the error occurred. Critical for triage — without it, `fetch failed`
 * tells you nothing about whether the MCP is configured for the right
 * server. Filled by the server's tool-call catch block.
 */
export interface ToolErrorEndpointContext {
  endpoint?: string;
  projectId?: string;
  authMethod?: string;
}

/**
 * Context for a single tool error event.
 */
export interface ToolErrorContext {
  /** Tool name (`list_rows`, etc.) or `<process>` for uncaught/unhandled events. */
  toolName: string;
  /** Raw arguments — gets redacted by the logger before output. */
  args: unknown;
  /** The thrown error (Error subclass, AppwriteException, or anything). */
  error: unknown;
  /** Optional MCP server instance ID for cross-server correlation. */
  instanceId?: string;
  /** Optional elapsed time in milliseconds since the handler started. */
  durationMs?: number;
  /** Optional endpoint/project snapshot at the time of the error. */
  context?: ToolErrorEndpointContext;
}

/**
 * Details extracted from one link in an Error.cause chain. Lets the agent
 * tell ENOTFOUND apart from ECONNREFUSED apart from a TLS handshake fail.
 */
export interface FormattedCauseDetails {
  name: string;
  message: string;
  /** String for network errors (`ENOTFOUND`), number for HTTP statuses. */
  code?: string | number;
  errno?: number;
  syscall?: string;
  hostname?: string;
  address?: string;
  port?: number | string;
}

/**
 * Agent-visible error shape returned by `formatErrorForAgent`. All optional
 * fields surface in the tool result text so the agent can react to the
 * Appwrite code/type without an extra round-trip.
 */
export interface FormattedAgentError {
  message: string;
  /** Appwrite-style HTTP status code if available (e.g. 404). */
  code?: number;
  /** Appwrite error type slug if available (e.g. `collection_not_found`). */
  type?: string;
  /** Capped (4KB) Appwrite response payload if it was provided. */
  appwriteResponse?: unknown;
  /** Innermost cause details (network error code, hostname, etc.). */
  cause?: FormattedCauseDetails;
}

interface ErrorLoggerOptions {
  /**
   * Path to append JSON lines to. If `undefined` and the logger hasn't been
   * configured yet, defaults to `~/.appwrite-utils-mcp/errors.log` on first
   * use. Pass an empty string `""` to disable file logging (stderr only).
   */
  logFilePath?: string;
  /** Whether to include stack traces in log output. Default: true. */
  includeStack?: boolean;
  /**
   * If the existing log file is larger than this many bytes at configure
   * time, truncate it to roughly `targetSize` bytes (last N bytes kept).
   * Default: 5MB max, 2MB kept.
   */
  maxFileSize?: number;
  /** Target size after truncation. Default: 2MB. */
  targetSize?: number;
}

const DEFAULT_LOG_PATH = join(homedir(), '.appwrite-utils-mcp', 'errors.log');
const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024;
const DEFAULT_TARGET_SIZE = 2 * 1024 * 1024;

let logFilePath: string | undefined;
let logFileResolved = false;
let includeStack = true;

/**
 * Resolve and (if needed) prepare the log file path. Called lazily on first
 * write so a process that never errors doesn't create the file.
 *
 * Side effects on first call:
 *   - Creates parent directory with mode 0700 if missing.
 *   - If existing file exceeds maxFileSize, truncates from the start
 *     (keeping last ~targetSize bytes of complete lines).
 */
function resolveLogFilePath(): string | undefined {
  if (logFileResolved) return logFilePath;
  logFileResolved = true;

  // Empty string explicitly disables file logging.
  if (logFilePath === '') {
    logFilePath = undefined;
    return undefined;
  }

  if (logFilePath === undefined) {
    logFilePath = DEFAULT_LOG_PATH;
  }

  try {
    mkdirSync(dirname(logFilePath), { recursive: true, mode: 0o700 });
  } catch {
    // Best-effort. If dir creation fails, the appendFileSync below will
    // also fail and emit a one-shot stderr warning.
  }

  // Startup truncation: if the file is too big, keep the tail.
  try {
    if (existsSync(logFilePath)) {
      const stats = statSync(logFilePath);
      if (stats.size > DEFAULT_MAX_FILE_SIZE) {
        truncateLogFileFromEnd(logFilePath, DEFAULT_TARGET_SIZE);
      }
    }
  } catch {
    // Best-effort.
  }

  return logFilePath;
}

/**
 * Truncate a log file to roughly `targetSize` bytes, keeping the tail and
 * aligning to a complete line boundary so the first line of the rewritten
 * file isn't a half-record.
 */
function truncateLogFileFromEnd(path: string, targetSize: number): void {
  const stats = statSync(path);
  const startOffset = Math.max(0, stats.size - targetSize);
  const bufSize = stats.size - startOffset;
  const buf = Buffer.alloc(bufSize);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, buf, 0, bufSize, startOffset);
  } finally {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('node:fs').closeSync(fd);
    } catch {
      /* ignore */
    }
  }
  // Skip leading bytes up to (but not including) the first '\n' so we don't
  // start the new file mid-line.
  let firstNl = buf.indexOf(0x0a);
  if (firstNl < 0) firstNl = -1; // no newline → keep everything (single huge line)
  const aligned = buf.subarray(firstNl + 1);
  writeFileSync(path, aligned, { mode: 0o600 });
  // truncateSync is a no-op here (writeFileSync replaced contents) but kept
  // as an explicit intent marker.
  void truncateSync;
}

/**
 * Set the global error-logger configuration. Call at most once at server
 * startup. Subsequent calls are no-ops on the resolved path (don't try to
 * swap file destinations mid-run — wasted resolves are silently dropped).
 */
export function configureErrorLogger(opts: ErrorLoggerOptions = {}): void {
  if (opts.logFilePath !== undefined && !logFileResolved) {
    logFilePath = opts.logFilePath;
  }
  if (opts.includeStack !== undefined) {
    includeStack = opts.includeStack;
  }
  // Eagerly resolve so the startup banner can show the path.
  resolveLogFilePath();
}

/** Get the resolved log path. Returns undefined if file logging is disabled. */
export function getResolvedLogPath(): string | undefined {
  return resolveLogFilePath();
}

const APPWRITE_RESPONSE_CAP = 4096;
const MAX_CAUSE_DEPTH = 3;

/**
 * Keys whose values are stripped to `[REDACTED]` regardless of nesting depth.
 * Match is case-insensitive against the JSON key.
 */
const REDACTED_KEY_PATTERN =
  /^(apiKey|key|sessionCookie|cookie|secret|password|authorization|x-appwrite-key|x-appwrite-session|x-appwrite-jwt)$/i;

/**
 * String values that match these patterns are replaced with `[REDACTED]`
 * EVEN IF they live under a non-sensitive key — Appwrite API keys and
 * session cookies are recognizable in raw form, so catch them anywhere.
 */
const REDACTED_VALUE_PATTERNS: RegExp[] = [
  /^(standard|dynamic)_[a-f0-9]{50,}$/, // Appwrite API key prefix
  /^a_session_[A-Za-z0-9_-]+=/, // Appwrite session cookie literal
];

const REDACTED = '[REDACTED]';

/**
 * Recursively walk an arbitrary JSON-like value and return a copy with any
 * sensitive keys or values replaced by `[REDACTED]`. Does not mutate the input.
 *
 * Handles cycles defensively by tracking seen objects — returning `[CIRCULAR]`
 * if a cycle is hit instead of recursing forever.
 */
export function redactArgs(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    for (const pattern of REDACTED_VALUE_PATTERNS) {
      if (pattern.test(value)) return REDACTED;
    }
    return value;
  }
  if (typeof value !== 'object') return value;
  if (seen.has(value as object)) return '[CIRCULAR]';
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactArgs(item, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACTED_KEY_PATTERN.test(k)) {
      out[k] = REDACTED;
      continue;
    }
    out[k] = redactArgs(v, seen);
  }
  return out;
}

/**
 * Extract one Error link's network/HTTP details. Used both for the top-level
 * error and (recursively, via `extractErrorDetails`) for each `.cause` in
 * the chain. Network errors (Node undici `fetch failed` etc.) populate the
 * `errno`/`syscall`/`hostname`/`address`/`port` fields; AppwriteException
 * populates the numeric `code`+`type`.
 */
function extractSingleLink(e: Error): FormattedCauseDetails {
  const anyE = e as Error & {
    code?: unknown;
    errno?: unknown;
    syscall?: unknown;
    hostname?: unknown;
    address?: unknown;
    port?: unknown;
    type?: unknown;
  };
  const out: FormattedCauseDetails = {
    name: anyE.name || 'Error',
    message: anyE.message || String(anyE),
  };
  if (typeof anyE.code === 'string' || typeof anyE.code === 'number') {
    out.code = anyE.code;
  }
  if (typeof anyE.errno === 'number') out.errno = anyE.errno;
  if (typeof anyE.syscall === 'string') out.syscall = anyE.syscall;
  if (typeof anyE.hostname === 'string') out.hostname = anyE.hostname;
  if (typeof anyE.address === 'string') out.address = anyE.address;
  if (typeof anyE.port === 'string' || typeof anyE.port === 'number') {
    out.port = anyE.port;
  }
  return out;
}

/**
 * Build a structured error object suitable for both logging and tool-result
 * serialization.
 *
 * Two enrichment passes:
 *  - AppwriteException unwrap: surfaces `.code` (HTTP status), `.type`
 *    (Appwrite slug), and `.response` body — that's the difference between
 *    "401 from Appwrite" and "401 because the API key lacks `databases.read`
 *    scope" in the agent-visible output.
 *  - `Error.cause` chain walk (up to 3 deep): Node's `fetch failed` chains
 *    the actual network error in `.cause` — without walking it, we lose
 *    every actionable detail (ENOTFOUND? ECONNREFUSED? which hostname?).
 *    The innermost cause we find is what surfaces in `cause` and in the
 *    agent-visible `[cause=...] [host=...]` suffix.
 */
function extractErrorDetails(error: unknown): {
  name: string;
  message: string;
  stack?: string;
  code?: number;
  type?: string;
  appwriteResponse?: unknown;
  cause?: FormattedCauseDetails;
} {
  if (!(error instanceof Error)) {
    return {
      name: typeof error === 'object' && error !== null ? error.constructor.name : typeof error,
      message: String(error),
    };
  }

  const e = error as Error & {
    code?: unknown;
    type?: unknown;
    response?: unknown;
    cause?: unknown;
  };
  const out: ReturnType<typeof extractErrorDetails> = {
    name: e.name || 'Error',
    message: e.message || String(e),
  };
  if (includeStack && typeof e.stack === 'string') {
    out.stack = e.stack;
  }
  // AppwriteException puts an HTTP status in .code (number) — preserve only
  // the numeric form here so the existing FormattedAgentError.code stays typed.
  if (typeof e.code === 'number') {
    out.code = e.code;
  }
  if (typeof e.type === 'string') {
    out.type = e.type;
  }
  if (e.response !== undefined && e.response !== null) {
    const responseStr =
      typeof e.response === 'string'
        ? e.response
        : (() => {
            try {
              return JSON.stringify(e.response);
            } catch {
              return String(e.response);
            }
          })();
    out.appwriteResponse =
      responseStr.length > APPWRITE_RESPONSE_CAP
        ? responseStr.slice(0, APPWRITE_RESPONSE_CAP) + '…[truncated]'
        : responseStr;
  }

  // Walk .cause chain up to MAX_CAUSE_DEPTH levels. Pick the deepest link
  // that has actionable network details (code/hostname/port) — those carry
  // the real diagnostic info from undici.
  let cursor: unknown = e.cause;
  let bestCause: FormattedCauseDetails | undefined;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && cursor instanceof Error; depth++) {
    const link = extractSingleLink(cursor);
    // Prefer the link with network details; otherwise keep the most recent.
    if (link.code !== undefined || link.hostname || link.syscall) {
      bestCause = link;
    } else if (!bestCause) {
      bestCause = link;
    }
    cursor = (cursor as Error & { cause?: unknown }).cause;
  }
  if (bestCause) {
    out.cause = bestCause;
  }
  return out;
}

/**
 * Log a single tool-call (or process-level) error to stderr — and to the
 * configured log file, if set. Output is one JSON line per error, prefixed
 * with `[appwrite-mcp][error]` for grep continuity with the rest of the
 * server's stderr stream.
 */
export function logToolError(ctx: ToolErrorContext): void {
  const details = extractErrorDetails(ctx.error);
  const payload = {
    ts: new Date().toISOString(),
    tool: ctx.toolName,
    ...(ctx.instanceId ? { instanceId: ctx.instanceId } : {}),
    ...(typeof ctx.durationMs === 'number' ? { durationMs: ctx.durationMs } : {}),
    ...(ctx.context && (ctx.context.endpoint || ctx.context.projectId || ctx.context.authMethod)
      ? { context: ctx.context }
      : {}),
    error: {
      name: details.name,
      message: details.message,
      ...(details.code !== undefined ? { code: details.code } : {}),
      ...(details.type !== undefined ? { type: details.type } : {}),
      ...(details.appwriteResponse !== undefined
        ? { appwriteResponse: details.appwriteResponse }
        : {}),
      ...(details.stack ? { stack: details.stack } : {}),
    },
    ...(details.cause ? { cause: details.cause } : {}),
    args: redactArgs(ctx.args),
  };

  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    serialized = JSON.stringify({
      ts: payload.ts,
      tool: payload.tool,
      error: { name: 'LoggerSerializationError', message: msg },
    });
  }

  const line = `[appwrite-mcp][error] ${serialized}`;
  process.stderr.write(line + '\n');

  const resolvedPath = resolveLogFilePath();
  if (resolvedPath) {
    try {
      appendFileSync(resolvedPath, line + '\n', { encoding: 'utf8', mode: 0o600 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `[appwrite-mcp][error] {"ts":"${new Date().toISOString()}","tool":"<logger>","error":{"name":"LogFileWriteError","message":${JSON.stringify(msg)},"logFilePath":${JSON.stringify(resolvedPath)}}}\n`
      );
    }
  }
}

/**
 * Build the agent-facing error payload — the human-readable message plus the
 * Appwrite code/type/response/cause when available. Callers concatenate
 * `formatted.message` with `[code=X] [type=Y] [cause=ENOTFOUND] [host=...]`
 * markers in the returned tool result text so the agent can branch on the
 * error class without an extra round-trip.
 */
export function formatErrorForAgent(error: unknown): FormattedAgentError {
  const details = extractErrorDetails(error);
  return {
    message: details.message,
    ...(details.code !== undefined ? { code: details.code } : {}),
    ...(details.type !== undefined ? { type: details.type } : {}),
    ...(details.appwriteResponse !== undefined
      ? { appwriteResponse: details.appwriteResponse }
      : {}),
    ...(details.cause ? { cause: details.cause } : {}),
  };
}
