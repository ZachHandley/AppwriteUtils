/**
 * Clamp the `limit(N)` query on a normalized Appwrite query list so a single
 * MCP tool call can't blow the response cap. Operates on the JSON wire form
 * produced by `normalizeQueries` — each entry is a string like
 * `{"method":"limit","values":[10]}`.
 *
 * If the caller never supplied a limit and `defaultLimit` is provided, one is
 * injected. If a limit is present but exceeds `maxLimit`, it's rewritten to
 * `maxLimit` and `clamped` is set so the caller can surface a hint in the
 * response (e.g., "_clamped: true, page to see more").
 *
 * @packageDocumentation
 */
import { Query } from "node-appwrite";

export interface LimitGuardOptions {
  /** Highest value a single page is allowed to request. Defaults to 100. */
  maxLimit?: number;
  /** Injected when no limit query is present. Omit to leave it server-default. */
  defaultLimit?: number;
}

export interface LimitGuardResult {
  /** The (possibly modified) wire-form query list to pass to the adapter. */
  queries: string[];
  /** True when a caller-supplied limit was rewritten down to `maxLimit`. */
  clamped: boolean;
  /** The value of the limit on the wire after clamping/injection, or undefined. */
  effectiveLimit?: number;
  /** True when this util injected the default (caller had no limit). */
  injectedDefault: boolean;
}

const DEFAULT_MAX = 100;

/**
 * Read-only inspection: does this wire-form entry encode a `limit(...)` query?
 */
function isLimitEntry(entry: string): boolean {
  if (!entry || entry[0] !== "{") return false;
  try {
    const parsed = JSON.parse(entry) as { method?: unknown };
    return parsed?.method === "limit";
  } catch {
    return false;
  }
}

function readLimitValue(entry: string): number | undefined {
  try {
    const parsed = JSON.parse(entry) as { method?: unknown; values?: unknown };
    if (parsed?.method !== "limit") return undefined;
    if (!Array.isArray(parsed.values)) return undefined;
    const v = parsed.values[0];
    return typeof v === "number" ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Clamp any `limit(N)` query > `maxLimit` down to `maxLimit`, and optionally
 * inject `defaultLimit` when no `limit` was supplied.
 *
 * Pass already-normalized wire-form strings (output of `normalizeQueries`).
 */
export function clampQueryLimit(
  queries: string[] | undefined,
  opts: LimitGuardOptions = {}
): LimitGuardResult {
  const maxLimit = Math.max(1, opts.maxLimit ?? DEFAULT_MAX);
  const list = queries ? [...queries] : [];
  let clamped = false;
  let limitIdx = list.findIndex(isLimitEntry);

  if (limitIdx === -1) {
    if (opts.defaultLimit !== undefined) {
      const def = Math.min(Math.max(1, opts.defaultLimit), maxLimit);
      list.push(Query.limit(def));
      return {
        queries: list,
        clamped: false,
        effectiveLimit: def,
        injectedDefault: true,
      };
    }
    return { queries: list, clamped: false, injectedDefault: false };
  }

  const current = readLimitValue(list[limitIdx]!);
  if (current !== undefined && current > maxLimit) {
    list[limitIdx] = Query.limit(maxLimit);
    clamped = true;
  }
  return {
    queries: list,
    clamped,
    effectiveLimit: clamped ? maxLimit : current,
    injectedDefault: false,
  };
}
