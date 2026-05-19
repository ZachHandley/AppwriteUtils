/**
 * CLI-side global error logger.
 *
 * Mirrors the MCP server's `errorLogger` (see
 * `packages/appwrite-utils-mcp/src/utils/errorLogger.ts`) so a crash in the
 * CLI — including a thrown error inside an inquirer prompt that bypasses our
 * try/catch blocks — leaves a structured record with cause chain and redacted
 * args under `~/.appwrite-utils-cli/errors.log`. Without this, the only place
 * the failure shows up is a raw stack trace on stderr that's gone the next
 * time the user resizes their terminal.
 *
 * Intentional duplication: the redaction patterns + cause walker are
 * copy-pasted from the MCP errorLogger rather than extracted into
 * `appwrite-utils-helpers`. When a third consumer shows up, refactor to a
 * shared module — until then, dual maintenance of ~70 lines of patterns is
 * cheaper than the shape-design work to make a clean shared API.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { MessageFormatter } from "appwrite-utils-helpers";

const DEFAULT_LOG_PATH = join(homedir(), ".appwrite-utils-cli", "errors.log");
const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024;
const DEFAULT_TARGET_SIZE = 2 * 1024 * 1024;
const MAX_CAUSE_DEPTH = 3;
const APPWRITE_RESPONSE_CAP = 4096;

let logFileReady = false;
let resolvedLogPath: string | undefined;

const REDACTED_KEY_PATTERN =
  /^(apiKey|key|sessionCookie|cookie|secret|password|authorization|x-appwrite-key|x-appwrite-session|x-appwrite-jwt)$/i;

const REDACTED_VALUE_PATTERNS: RegExp[] = [
  /^(standard|dynamic)_[a-f0-9]{50,}$/,
  /^a_session_[A-Za-z0-9_-]+=/,
];

const REDACTED = "[REDACTED]";

function ensureLogFile(): string | undefined {
  if (logFileReady) return resolvedLogPath;
  logFileReady = true;
  resolvedLogPath = DEFAULT_LOG_PATH;
  try {
    mkdirSync(dirname(resolvedLogPath), { recursive: true, mode: 0o700 });
  } catch {
    // Best-effort: if the dir can't be made, the appendFileSync below will
    // emit a one-shot stderr warning and we just drop file logging.
  }
  try {
    if (existsSync(resolvedLogPath)) {
      const stats = statSync(resolvedLogPath);
      if (stats.size > DEFAULT_MAX_FILE_SIZE) {
        truncateFromEnd(resolvedLogPath, DEFAULT_TARGET_SIZE);
      }
    }
  } catch {
    /* best-effort */
  }
  return resolvedLogPath;
}

function truncateFromEnd(path: string, targetSize: number): void {
  const stats = statSync(path);
  const startOffset = Math.max(0, stats.size - targetSize);
  const bufSize = stats.size - startOffset;
  const buf = Buffer.alloc(bufSize);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buf, 0, bufSize, startOffset);
  } finally {
    try {
      require("node:fs").closeSync(fd);
    } catch {
      /* ignore */
    }
  }
  let firstNl = buf.indexOf(0x0a);
  const aligned = firstNl >= 0 ? buf.subarray(firstNl + 1) : buf;
  writeFileSync(path, aligned, { mode: 0o600 });
}

/**
 * Recursively strip sensitive values from an arbitrary JSON-like structure.
 * Mirrors the MCP redactor's contract: never mutates, returns a deep copy,
 * collapses circular references to "[CIRCULAR]".
 */
export function redactArgs(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    for (const pattern of REDACTED_VALUE_PATTERNS) {
      if (pattern.test(value)) return REDACTED;
    }
    return value;
  }
  if (typeof value !== "object") return value;
  if (seen.has(value as object)) return "[CIRCULAR]";
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

interface CauseLink {
  name: string;
  message: string;
  code?: string | number;
  errno?: number;
  syscall?: string;
  hostname?: string;
  address?: string;
  port?: number | string;
}

function extractLink(e: Error): CauseLink {
  const anyE = e as Error & Record<string, unknown>;
  const out: CauseLink = { name: e.name || "Error", message: e.message || String(e) };
  if (typeof anyE.code === "string" || typeof anyE.code === "number") out.code = anyE.code as string | number;
  if (typeof anyE.errno === "number") out.errno = anyE.errno as number;
  if (typeof anyE.syscall === "string") out.syscall = anyE.syscall as string;
  if (typeof anyE.hostname === "string") out.hostname = anyE.hostname as string;
  if (typeof anyE.address === "string") out.address = anyE.address as string;
  if (typeof anyE.port === "string" || typeof anyE.port === "number") {
    out.port = anyE.port as string | number;
  }
  return out;
}

function extractDetails(error: unknown): {
  name: string;
  message: string;
  stack?: string;
  code?: number;
  type?: string;
  appwriteResponse?: unknown;
  cause?: CauseLink;
} {
  if (!(error instanceof Error)) {
    return {
      name: typeof error === "object" && error !== null ? error.constructor.name : typeof error,
      message: String(error),
    };
  }
  const e = error as Error & Record<string, unknown>;
  const out: ReturnType<typeof extractDetails> = {
    name: e.name || "Error",
    message: e.message || String(e),
  };
  if (typeof e.stack === "string") out.stack = e.stack;
  if (typeof e.code === "number") out.code = e.code as number;
  if (typeof e.type === "string") out.type = e.type as string;
  if (e.response !== undefined && e.response !== null) {
    let responseStr: string;
    try {
      responseStr =
        typeof e.response === "string" ? (e.response as string) : JSON.stringify(e.response);
    } catch {
      responseStr = String(e.response);
    }
    out.appwriteResponse =
      responseStr.length > APPWRITE_RESPONSE_CAP
        ? responseStr.slice(0, APPWRITE_RESPONSE_CAP) + "…[truncated]"
        : responseStr;
  }

  let cursor: unknown = e.cause;
  let best: CauseLink | undefined;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && cursor instanceof Error; depth++) {
    const link = extractLink(cursor);
    if (link.code !== undefined || link.hostname || link.syscall) {
      best = link;
    } else if (!best) {
      best = link;
    }
    cursor = (cursor as Error & { cause?: unknown }).cause;
  }
  if (best) out.cause = best;
  return out;
}

export interface CliErrorContext {
  /** What was being attempted — e.g. `<uncaughtException>`, `selectFunctions`, or a CLI subcommand name. */
  command: string;
  /** Arbitrary args to redact + log alongside the error. */
  args?: unknown;
  /** The thrown error itself. */
  error: unknown;
  /** Optional cwd/config-path snapshot for triage. */
  context?: { cwd?: string; configPath?: string };
}

/**
 * Append one JSON-line error record to `~/.appwrite-utils-cli/errors.log` (if
 * writable) and echo a one-liner to stderr via `MessageFormatter.error`.
 *
 * Designed to be safe to call from a `process.on('uncaughtException')` handler —
 * no async, no rejections, swallows file-IO failures and reports them inline.
 */
export function logCliError(ctx: CliErrorContext): void {
  const details = extractDetails(ctx.error);
  const payload = {
    ts: new Date().toISOString(),
    command: ctx.command,
    ...(ctx.context ? { context: ctx.context } : {}),
    error: {
      name: details.name,
      message: details.message,
      ...(details.code !== undefined ? { code: details.code } : {}),
      ...(details.type !== undefined ? { type: details.type } : {}),
      ...(details.appwriteResponse !== undefined ? { appwriteResponse: details.appwriteResponse } : {}),
      ...(details.stack ? { stack: details.stack } : {}),
    },
    ...(details.cause ? { cause: details.cause } : {}),
    ...(ctx.args !== undefined ? { args: redactArgs(ctx.args) } : {}),
  };

  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch (err) {
    serialized = JSON.stringify({
      ts: payload.ts,
      command: payload.command,
      error: { name: "LoggerSerializationError", message: err instanceof Error ? err.message : String(err) },
    });
  }

  const line = `[appwrite-cli][error] ${serialized}`;
  process.stderr.write(line + "\n");

  const path = ensureLogFile();
  if (path) {
    try {
      appendFileSync(path, line + "\n", { encoding: "utf8", mode: 0o600 });
    } catch (err) {
      process.stderr.write(
        `[appwrite-cli][error] log file write failed at ${path}: ${err instanceof Error ? err.message : String(err)}\n`
      );
    }
  }

  // User-visible single line, separate from the JSON above for readability.
  const head = `${details.name}: ${details.message}`;
  const suffix = details.cause
    ? ` [cause=${details.cause.name}${details.cause.code !== undefined ? `:${details.cause.code}` : ""}${details.cause.hostname ? ` host=${details.cause.hostname}` : ""}]`
    : "";
  MessageFormatter.error(head + suffix, undefined, { prefix: "CLI" });
  if (path) {
    MessageFormatter.info(`Logged to ${path}`, { prefix: "CLI" });
  }
}

/** Resolved log file path (creates the directory on first access). */
export function getCliLogPath(): string | undefined {
  return ensureLogFile();
}
