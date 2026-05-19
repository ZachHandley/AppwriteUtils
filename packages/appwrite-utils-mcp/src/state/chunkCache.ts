/**
 * In-memory chunk cache for oversized tool payloads.
 *
 * Tools that produce a response larger than the MCP transport can carry stash
 * the full serialized payload here and return a `chunkRef` + an inline first
 * chunk. The agent calls `fetch_payload_chunk(kind, key, offset, length)` to
 * pull more.
 *
 * Per-server-instance, never persisted, evicted on TTL + total-byte cap. Keys
 * are namespaced by `kind` (e.g. `table-rows`, `table-schema`) so independent
 * call sites can't collide.
 *
 * @packageDocumentation
 */

interface ChunkEntry {
  kind: string;
  key: string;
  payload: string;
  size: number;
  createdAt: number;
  lastAccessed: number;
}

/** TTL after which a chunk entry is dropped (ms). */
const DEFAULT_TTL_MS = 5 * 60 * 1000;
/** Hard cap on total bytes across all entries; oldest evicted first. */
const DEFAULT_MAX_TOTAL_BYTES = 32 * 1024 * 1024;

export interface ChunkCacheOptions {
  ttlMs?: number;
  maxTotalBytes?: number;
}

export class ChunkCache {
  private entries = new Map<string, ChunkEntry>();
  private totalBytes = 0;
  private readonly ttlMs: number;
  private readonly maxTotalBytes: number;

  constructor(opts: ChunkCacheOptions = {}) {
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
    this.maxTotalBytes = opts.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  }

  private makeKey(kind: string, key: string): string {
    return `${kind}:${key}`;
  }

  /**
   * Store a payload under `kind:key`. Replaces any existing entry. Triggers
   * eviction when the total exceeds the cap.
   */
  put(kind: string, key: string, payload: string): void {
    this.sweep();
    const id = this.makeKey(kind, key);
    const existing = this.entries.get(id);
    if (existing) {
      this.totalBytes -= existing.size;
      this.entries.delete(id);
    }
    const now = Date.now();
    const entry: ChunkEntry = {
      kind,
      key,
      payload,
      size: payload.length,
      createdAt: now,
      lastAccessed: now,
    };
    this.entries.set(id, entry);
    this.totalBytes += entry.size;
    this.evictUntilUnderCap();
  }

  /**
   * Return a [offset, offset+length) byte slice of the payload (UTF-16 chars,
   * since we store as a JS string — fine for ASCII/JSON, and consistent for
   * agents that use string offsets). Updates lastAccessed.
   *
   * Returns `null` when the entry is missing or expired.
   */
  slice(
    kind: string,
    key: string,
    offset: number,
    length: number
  ): { payload: string; totalLength: number; eof: boolean } | null {
    const id = this.makeKey(kind, key);
    const entry = this.entries.get(id);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.entries.delete(id);
      this.totalBytes -= entry.size;
      return null;
    }
    entry.lastAccessed = Date.now();
    const start = Math.max(0, Math.floor(offset));
    const end = Math.min(entry.size, start + Math.max(0, Math.floor(length)));
    return {
      payload: entry.payload.slice(start, end),
      totalLength: entry.size,
      eof: end >= entry.size,
    };
  }

  /** Inspect — does this entry still live in the cache? */
  has(kind: string, key: string): boolean {
    const id = this.makeKey(kind, key);
    const entry = this.entries.get(id);
    if (!entry) return false;
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.entries.delete(id);
      this.totalBytes -= entry.size;
      return false;
    }
    return true;
  }

  /** Drop expired entries. Called opportunistically on each put. */
  private sweep(): void {
    const now = Date.now();
    for (const [id, entry] of this.entries) {
      if (now - entry.createdAt > this.ttlMs) {
        this.entries.delete(id);
        this.totalBytes -= entry.size;
      }
    }
  }

  /** Evict oldest-accessed entries until totalBytes is back under the cap. */
  private evictUntilUnderCap(): void {
    if (this.totalBytes <= this.maxTotalBytes) return;
    const sorted = [...this.entries.entries()].sort(
      (a, b) => a[1].lastAccessed - b[1].lastAccessed
    );
    for (const [id, entry] of sorted) {
      if (this.totalBytes <= this.maxTotalBytes) break;
      this.entries.delete(id);
      this.totalBytes -= entry.size;
    }
  }

  /** Test/diagnostic accessor — don't depend on this from tool code. */
  stats() {
    return {
      entries: this.entries.size,
      totalBytes: this.totalBytes,
      maxTotalBytes: this.maxTotalBytes,
      ttlMs: this.ttlMs,
    };
  }

  /** For tests only. */
  clear(): void {
    this.entries.clear();
    this.totalBytes = 0;
  }
}

/**
 * Singleton instance shared across all tool groups in this server process.
 * Each MCP server gets its own — never persisted, never crosses instances.
 */
export const chunkCache = new ChunkCache();
