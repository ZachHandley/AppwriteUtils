/**
 * Normalize agent-supplied Appwrite query strings into the JSON wire format
 * that Appwrite's REST API expects.
 *
 * Appwrite's REST endpoints accept queries as a list of JSON-encoded strings
 * like `{"method":"limit","values":[10]}` — what the node-appwrite `Query`
 * class produces via its static helpers + `toString()`. Agents naturally
 * write SDK-style strings (`Query.limit(10)`, `limit(10)`) because that's
 * what the docs show. We accept all three forms and emit the wire form.
 *
 * @packageDocumentation
 */
import { Query } from "node-appwrite";

/**
 * Convert each user-supplied query entry into the JSON wire form that
 * `tables.listRows`, `storage.listBuckets`, etc. expect.
 *
 * Accepts three forms per entry:
 *  1. JSON wire form already — `{"method":"limit","values":[10]}` → passthrough
 *  2. SDK syntax with prefix — `Query.limit(10)` → dispatches `Query.limit(10)`
 *  3. Bare method form — `limit(10)` → same dispatch
 *
 * Returns `undefined` when input is `undefined` so the SDK can apply its own
 * default (Appwrite defaults to 25 docs for most list endpoints).
 *
 * @throws Error with the offending input + an `available methods` hint when
 *   a method name doesn't exist on the `Query` class.
 */
export function normalizeQueries(
  input: string[] | undefined | null
): string[] | undefined {
  if (input === undefined || input === null) return undefined;
  if (!Array.isArray(input)) {
    throw new Error(
      `Invalid queries input: expected an array of strings, got ${typeof input}.`
    );
  }
  if (input.length === 0) return [];
  return input.map((entry, idx) => normalizeOne(entry, idx));
}

function normalizeOne(raw: unknown, idx: number): string {
  if (typeof raw !== "string") {
    throw new Error(
      `queries[${idx}]: expected a string, got ${typeof raw}.`
    );
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error(`queries[${idx}]: empty string is not a valid query.`);
  }

  // Form 1: JSON wire form. If it parses and looks like a Query object,
  // re-stringify in canonical form (handles incidental whitespace).
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { method?: unknown };
      if (parsed && typeof parsed === "object" && typeof parsed.method === "string") {
        return JSON.stringify(parsed);
      }
    } catch {
      // Fall through — not valid JSON, try SDK syntax.
    }
  }

  // Form 2 & 3: SDK-style call. Accept optional `Query.` prefix.
  const callMatch = trimmed.match(/^(?:Query\.)?([A-Za-z_$][\w$]*)\(([\s\S]*)\)\s*$/);
  if (!callMatch) {
    throw new Error(
      `queries[${idx}]: '${truncate(raw)}' is not a recognized query format. ` +
        `Use SDK syntax like Query.limit(10) or limit(10), or JSON wire form ` +
        `{"method":"limit","values":[10]}. Call query_help for the full reference.`
    );
  }

  const methodName = callMatch[1];
  const argsStr = callMatch[2];

  const fn = (Query as unknown as Record<string, unknown>)[methodName];
  if (typeof fn !== "function") {
    throw new Error(
      `queries[${idx}]: Unknown Query method '${methodName}'. ` +
        `Call query_help to see the available methods (limit, equal, orderDesc, search, ...).`
    );
  }

  let args: unknown[];
  try {
    args = parseCallArgs(argsStr);
  } catch (err) {
    throw new Error(
      `queries[${idx}]: failed to parse arguments for ${methodName}(...): ` +
        `${err instanceof Error ? err.message : String(err)}. ` +
        `Args must be JSON-compatible literals (numbers, booleans, double-quoted strings, arrays). ` +
        `Got: ${truncate(argsStr)}`
    );
  }

  try {
    const result = (fn as (...a: unknown[]) => unknown).apply(Query, args);
    if (typeof result !== "string") {
      throw new Error(
        `Query.${methodName}(...) did not return a string (got ${typeof result}).`
      );
    }
    return result;
  } catch (err) {
    throw new Error(
      `queries[${idx}]: Query.${methodName}(...) threw: ` +
        `${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Parse a comma-separated argument list from the inside of a function call.
 * Tries a strict JSON parse first (after wrapping in `[...]`), then falls
 * back to a single-quote → double-quote normalization for the common
 * `Query.equal('status', 'active')` style.
 *
 * Edge cases:
 *  - Empty arg list (`limit()`) → returns `[]`.
 *  - Nested arrays (`select(["a","b"])`) → handled by JSON parser.
 *  - Strings with embedded commas or brackets — supported as long as quoted.
 */
function parseCallArgs(argsStr: string): unknown[] {
  const trimmed = argsStr.trim();
  if (trimmed.length === 0) return [];

  // First attempt: assume the user used valid JSON literal syntax.
  try {
    const parsed = JSON.parse(`[${trimmed}]`);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Fall through.
  }

  // Second attempt: swap unescaped single quotes for double quotes. This is
  // a deliberately conservative pass — only touches `'...'` segments that
  // sit between commas / parens, never inside an existing double-quoted
  // string. Good enough for `Query.equal('status', 'active')`.
  const fixed = swapSingleToDoubleQuotes(trimmed);
  const parsed = JSON.parse(`[${fixed}]`);
  if (!Array.isArray(parsed)) {
    throw new Error("Argument list did not parse to an array.");
  }
  return parsed;
}

function swapSingleToDoubleQuotes(input: string): string {
  let out = "";
  let inDouble = false;
  let inSingle = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const prev = i > 0 ? input[i - 1] : "";
    if (ch === '"' && prev !== "\\" && !inSingle) {
      inDouble = !inDouble;
      out += ch;
      continue;
    }
    if (ch === "'" && prev !== "\\" && !inDouble) {
      inSingle = !inSingle;
      out += '"';
      continue;
    }
    out += ch;
  }
  return out;
}

function truncate(s: string, max = 80): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}
