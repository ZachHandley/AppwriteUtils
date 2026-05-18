import { describe, expect, test } from "bun:test";
import { buildAppwriteClient } from "../src/clients/buildAppwriteClient.js";

/**
 * Wire-shape regression tests for the SINGLE source of truth for client
 * construction (`buildAppwriteClient`). If any of these break, every
 * downstream caller (probe, production, version-detection) breaks the same
 * way — which is the point: one place to change the wire shape, one place
 * to test it.
 */

describe("buildAppwriteClient — wire shape", () => {
  test("cookie auth sets headers['cookie'] + X-Appwrite-Mode: admin", () => {
    const client = buildAppwriteClient({
      endpoint: "https://example.test/v1",
      projectId: "p1",
      sessionCookie: "a_session_console=xyz",
    });
    expect((client.headers as any).cookie).toBe("a_session_console=xyz");
    expect((client.headers as any)["X-Appwrite-Mode"]).toBe("admin");
    expect((client.headers as any)["X-Appwrite-Key"]).toBeUndefined();
  });

  test("API key auth sets X-Appwrite-Mode: default, no cookie header", () => {
    const client = buildAppwriteClient({
      endpoint: "https://example.test/v1",
      projectId: "p1",
      apiKey: "standard_test_key",
    });
    expect((client.headers as any).cookie).toBeUndefined();
    expect((client.headers as any)["X-Appwrite-Mode"]).toBe("default");
    // node-appwrite's setKey() sets X-Appwrite-Key under the hood
    expect((client.headers as any)["X-Appwrite-Key"]).toBe("standard_test_key");
  });

  test("auto mode with both creds present: cookie wins", () => {
    const client = buildAppwriteClient({
      endpoint: "https://example.test/v1",
      projectId: "p1",
      sessionCookie: "a_session_x=y",
      apiKey: "standard_key",
      authMethod: "auto",
    });
    expect((client.headers as any).cookie).toBe("a_session_x=y");
    expect((client.headers as any)["X-Appwrite-Mode"]).toBe("admin");
    expect((client.headers as any)["X-Appwrite-Key"]).toBeUndefined();
  });

  test("explicit authMethod=apikey ignores cookie even when present", () => {
    const client = buildAppwriteClient({
      endpoint: "https://example.test/v1",
      projectId: "p1",
      sessionCookie: "a_session_should_be_ignored=z",
      apiKey: "standard_real_key",
      authMethod: "apikey",
    });
    expect((client.headers as any).cookie).toBeUndefined();
    expect((client.headers as any)["X-Appwrite-Key"]).toBe("standard_real_key");
    expect((client.headers as any)["X-Appwrite-Mode"]).toBe("default");
  });

  test("explicit authMethod=session ignores apiKey even when present", () => {
    const client = buildAppwriteClient({
      endpoint: "https://example.test/v1",
      projectId: "p1",
      sessionCookie: "a_session_x=y",
      apiKey: "standard_should_be_ignored",
      authMethod: "session",
    });
    expect((client.headers as any).cookie).toBe("a_session_x=y");
    expect((client.headers as any)["X-Appwrite-Mode"]).toBe("admin");
    expect((client.headers as any)["X-Appwrite-Key"]).toBeUndefined();
  });

  test("no auth supplied: bare endpoint+project, no auth headers", () => {
    const client = buildAppwriteClient({
      endpoint: "https://example.test/v1",
      projectId: "p1",
    });
    expect((client.headers as any).cookie).toBeUndefined();
    expect((client.headers as any)["X-Appwrite-Key"]).toBeUndefined();
    expect((client.headers as any)["X-Appwrite-Mode"]).toBeUndefined();
  });

  test("reuse: rebinds the SAME client instance — no new construction", () => {
    const first = buildAppwriteClient({
      endpoint: "https://example.test/v1",
      projectId: "p1",
      sessionCookie: "a_session_first=1",
    });
    const second = buildAppwriteClient({
      endpoint: "https://example.test/v1",
      projectId: "p2",
      sessionCookie: "a_session_second=2",
      reuse: first,
    });
    expect(second).toBe(first); // identity preserved
    expect((second.headers as any).cookie).toBe("a_session_second=2");
  });

  test("reuse: swap from cookie to API key clears the cookie header", () => {
    const client = buildAppwriteClient({
      endpoint: "https://example.test/v1",
      projectId: "p1",
      sessionCookie: "a_session_old=1",
    });
    expect((client.headers as any).cookie).toBe("a_session_old=1");

    buildAppwriteClient({
      endpoint: "https://example.test/v1",
      projectId: "p1",
      apiKey: "standard_new_key",
      authMethod: "apikey",
      reuse: client,
    });
    expect((client.headers as any).cookie).toBeUndefined();
    expect((client.headers as any)["X-Appwrite-Key"]).toBe("standard_new_key");
    expect((client.headers as any)["X-Appwrite-Mode"]).toBe("default");
  });

  test("empty cookie string is treated as no cookie (falls through to apiKey)", () => {
    const client = buildAppwriteClient({
      endpoint: "https://example.test/v1",
      projectId: "p1",
      sessionCookie: "   ",
      apiKey: "standard_fallback",
    });
    expect((client.headers as any).cookie).toBeUndefined();
    expect((client.headers as any)["X-Appwrite-Key"]).toBe("standard_fallback");
  });

  test("never uses setSession() — raw cookie header only (anti-regression)", () => {
    // node-appwrite's setSession sets headers['X-Appwrite-Session'], NOT
    // headers['cookie']. The Appwrite CLI writes the full cookie string and
    // we must reproduce it on the wire. If anyone reaches for setSession()
    // in the future, this test will catch the regression.
    const client = buildAppwriteClient({
      endpoint: "https://example.test/v1",
      projectId: "p1",
      sessionCookie: "a_session_console=value",
    });
    expect((client.headers as any)["X-Appwrite-Session"]).toBeUndefined();
    expect((client.headers as any).cookie).toBe("a_session_console=value");
  });
});
