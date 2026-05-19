import { describe, expect, test } from "bun:test";
import { ChunkCache } from "../src/state/chunkCache.js";
import { truncateAndCache } from "../src/utils/chunking.js";
import { clampQueryLimit } from "../src/utils/clampQueryLimit.js";
import { Query } from "node-appwrite";

describe("ChunkCache", () => {
  test("put + slice round-trips a payload", () => {
    const cache = new ChunkCache({ ttlMs: 10_000, maxTotalBytes: 1024 * 1024 });
    cache.put("k", "abc", "hello world");
    const got = cache.slice("k", "abc", 0, 5);
    expect(got).not.toBeNull();
    expect(got!.payload).toBe("hello");
    expect(got!.totalLength).toBe("hello world".length);
    expect(got!.eof).toBe(false);
  });

  test("slice past end marks eof", () => {
    const cache = new ChunkCache();
    cache.put("k", "x", "abc");
    const got = cache.slice("k", "x", 1, 100);
    expect(got!.payload).toBe("bc");
    expect(got!.eof).toBe(true);
  });

  test("missing key returns null", () => {
    const cache = new ChunkCache();
    expect(cache.slice("k", "missing", 0, 10)).toBeNull();
  });

  test("expired entry returns null", async () => {
    const cache = new ChunkCache({ ttlMs: 1 });
    cache.put("k", "x", "abc");
    await new Promise((r) => setTimeout(r, 5));
    expect(cache.slice("k", "x", 0, 10)).toBeNull();
  });

  test("evicts oldest when over byte cap", () => {
    const cache = new ChunkCache({ maxTotalBytes: 10 });
    cache.put("k", "a", "1234567890"); // 10 bytes — fits exactly
    cache.put("k", "b", "abcde"); // pushes over cap, "a" should evict
    expect(cache.has("k", "a")).toBe(false);
    expect(cache.has("k", "b")).toBe(true);
  });
});

describe("truncateAndCache", () => {
  test("passes through small payloads untouched", () => {
    const result = truncateAndCache("hello", {
      kind: "test",
      key: "small",
      hardCapChars: 1000,
      firstChunkChars: 500,
    });
    expect(result.truncated).toBe(false);
    expect(result.inline).toBe("hello");
    expect(result.chunkRef).toBeUndefined();
  });

  test("chunks oversized payloads and caches the rest", () => {
    const big = "x".repeat(100_000);
    const result = truncateAndCache(big, {
      kind: "test",
      key: "big",
      hardCapChars: 60_000,
      firstChunkChars: 50_000,
    });
    expect(result.truncated).toBe(true);
    expect(result.inline.length).toBe(50_000);
    expect(result.chunkRef).toBeDefined();
    expect(result.chunkRef!.totalChars).toBe(100_000);
    expect(result.chunkRef!.nextOffset).toBe(50_000);
    expect(result.chunkRef!.fetchHint).toContain("fetch_payload_chunk");
  });
});

describe("clampQueryLimit", () => {
  test("passes through under-limit queries", () => {
    const result = clampQueryLimit([Query.limit(50)], { maxLimit: 100 });
    expect(result.clamped).toBe(false);
    expect(result.effectiveLimit).toBe(50);
  });

  test("clamps over-limit queries", () => {
    const result = clampQueryLimit([Query.limit(5000)], { maxLimit: 100 });
    expect(result.clamped).toBe(true);
    expect(result.effectiveLimit).toBe(100);
    // The rewritten entry should be a Query.limit(100) wire-form string
    const parsed = JSON.parse(result.queries[0]!);
    expect(parsed.method).toBe("limit");
    expect(parsed.values[0]).toBe(100);
  });

  test("injects default when no limit present", () => {
    const result = clampQueryLimit([], { maxLimit: 100, defaultLimit: 25 });
    expect(result.injectedDefault).toBe(true);
    expect(result.effectiveLimit).toBe(25);
    expect(result.queries.length).toBe(1);
  });

  test("does not inject when caller-supplied limit exists", () => {
    const result = clampQueryLimit([Query.limit(10)], {
      maxLimit: 100,
      defaultLimit: 25,
    });
    expect(result.injectedDefault).toBe(false);
    expect(result.effectiveLimit).toBe(10);
  });

  test("handles undefined queries", () => {
    const result = clampQueryLimit(undefined, {
      maxLimit: 100,
      defaultLimit: 25,
    });
    expect(result.injectedDefault).toBe(true);
    expect(result.queries.length).toBe(1);
  });

  test("default limit is also clamped to maxLimit", () => {
    const result = clampQueryLimit([], { maxLimit: 10, defaultLimit: 500 });
    expect(result.effectiveLimit).toBe(10);
  });
});
