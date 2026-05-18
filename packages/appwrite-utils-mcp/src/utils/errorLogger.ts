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

import { appendFileSync } from 'node:fs';

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
}

interface ErrorLoggerOptions {
  /** Optional absolute path to append JSON lines to. */
  logFilePath?: string;
  /** Whether to include stack traces in log output. Default: true. */
  includeStack?: boolean;
}

let logFilePath: string | undefined;
let includeStack = true;

/** Set the global error-logger configuration. Call once at server startup. */
export function configureErrorLogger(opts: ErrorLoggerOptions): void {
  if (opts.logFilePath !== undefined) {
    logFilePath = opts.logFilePath;
  }
  if (opts.includeStack !== undefined) {
    includeStack = opts.includeStack;
  }
}

const APPWRITE_RESPONSE_CAP = 4096;

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
 * Build a structured error object suitable for both logging and tool-result
 * serialization. AppwriteException instances are unwrapped to surface their
 * `code` (HTTP status), `type` (Appwrite slug), and `response` body — that's
 * the difference between "401 from Appwrite" and "401 because the API key
 * lacks `databases.read` scope" in the agent-visible output.
 */
function extractErrorDetails(error: unknown): {
  name: string;
  message: string;
  stack?: string;
  code?: number;
  type?: string;
  appwriteResponse?: unknown;
} {
  if (error instanceof Error) {
    const e = error as Error & {
      code?: unknown;
      type?: unknown;
      response?: unknown;
    };
    const out: ReturnType<typeof extractErrorDetails> = {
      name: e.name || 'Error',
      message: e.message || String(e),
    };
    if (includeStack && typeof e.stack === 'string') {
      out.stack = e.stack;
    }
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
    return out;
  }
  return {
    name: typeof error === 'object' && error !== null ? error.constructor.name : typeof error,
    message: String(error),
  };
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

  if (logFilePath) {
    try {
      appendFileSync(logFilePath, line + '\n', { encoding: 'utf8' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `[appwrite-mcp][error] {"ts":"${new Date().toISOString()}","tool":"<logger>","error":{"name":"LogFileWriteError","message":${JSON.stringify(msg)},"logFilePath":${JSON.stringify(logFilePath)}}}\n`
      );
    }
  }
}

/**
 * Build the agent-facing error payload — the human-readable message plus the
 * Appwrite code/type/response when available. Callers usually concatenate
 * `formatted.message` with `[code=X] [type=Y]` markers in the returned tool
 * result text so the agent can branch on the error class.
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
  };
}
