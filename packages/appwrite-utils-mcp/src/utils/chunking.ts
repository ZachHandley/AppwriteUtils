/**
 * Helpers for tools that produce occasionally-oversized payloads.
 *
 * `truncateAndCache` is the single chokepoint: serialize whatever you'd return,
 * pass it through here, and either get back the original (if small enough) or
 * a `{ inline, chunkRef }` pair where `inline` is the first chunk and
 * `chunkRef` points at the rest in the shared chunk cache.
 *
 * Agents fetch additional chunks via the `fetch_payload_chunk` meta tool.
 *
 * @packageDocumentation
 */
import { chunkCache } from "../state/chunkCache.js";

export interface TruncateAndCacheOptions {
  /** Namespace for the cache entry (e.g. `table-rows`, `table-schema`). */
  kind: string;
  /** Per-call identity (e.g. `${databaseId}:${tableId}:${queryHash}`). */
  key: string;
  /**
   * If the serialized payload exceeds this many chars, it's cached and the
   * caller gets back a chunk-ref to fetch the rest. Defaults to 60_000.
   */
  hardCapChars?: number;
  /**
   * Size of the inline first chunk returned to the agent alongside the ref.
   * Defaults to 50_000.
   */
  firstChunkChars?: number;
}

export interface ChunkRef {
  kind: string;
  key: string;
  totalChars: number;
  nextOffset: number;
  fetchHint: string;
}

export interface TruncateResult {
  /** First chunk of the payload (the WHOLE payload when it fit). */
  inline: string;
  /** True when the payload was too large and was cached. */
  truncated: boolean;
  /** Present iff `truncated` — call `fetch_payload_chunk` with these fields. */
  chunkRef?: ChunkRef;
}

const DEFAULT_HARD_CAP = 60_000;
const DEFAULT_FIRST_CHUNK = 50_000;

/**
 * If `payload` is small enough, return it untouched. Otherwise, stash the full
 * payload in the chunk cache and return the first chunk + a chunk-ref the
 * agent can use to pull the rest.
 */
export function truncateAndCache(
  payload: string,
  opts: TruncateAndCacheOptions
): TruncateResult {
  const hardCap = opts.hardCapChars ?? DEFAULT_HARD_CAP;
  const firstChunk = Math.min(opts.firstChunkChars ?? DEFAULT_FIRST_CHUNK, hardCap);
  if (payload.length <= hardCap) {
    return { inline: payload, truncated: false };
  }
  chunkCache.put(opts.kind, opts.key, payload);
  const nextOffset = firstChunk;
  return {
    inline: payload.slice(0, firstChunk),
    truncated: true,
    chunkRef: {
      kind: opts.kind,
      key: opts.key,
      totalChars: payload.length,
      nextOffset,
      fetchHint:
        `Payload is ${payload.length.toLocaleString()} chars — first ${firstChunk.toLocaleString()} inline. ` +
        `Call fetch_payload_chunk(kind='${opts.kind}', key='${opts.key}', offset=${nextOffset}, length=${firstChunk}) for the next chunk.`,
    },
  };
}
