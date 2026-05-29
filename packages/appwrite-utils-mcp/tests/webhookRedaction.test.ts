import { describe, expect, test } from "bun:test";
import type { Models } from "node-appwrite";

import { _redactWebhookForTest } from "../src/tools/projects/index.js";

function makeWebhook(overrides: Partial<Models.Webhook> = {}): Models.Webhook {
  return {
    $id: "wh1",
    $createdAt: "2026-05-29T00:00:00.000Z",
    $updatedAt: "2026-05-29T00:00:01.000Z",
    name: "Test webhook",
    url: "https://example.test/hook",
    events: ["databases.*.collections.*.documents.*.create"],
    security: true,
    httpUser: "basic-user",
    httpPass: "super-secret-password",
    signatureKey: "sk_live_abcdef123456",
    enabled: true,
    logs: "",
    attempts: 0,
    ...overrides,
  } as Models.Webhook;
}

describe("redactWebhook (MCP boundary chokepoint)", () => {
  test("default redacts httpPass AND signatureKey, surfaces presence booleans", () => {
    const out = _redactWebhookForTest(makeWebhook()) as Record<string, unknown>;
    expect(out.hasHttpPass).toBe(true);
    expect(out.hasHttpUser).toBe(true);
    expect(out.hasSignatureKey).toBe(true);
    expect("httpPass" in out).toBe(false);
    expect("signatureKey" in out).toBe(false);
  });

  test("revealSignatureKey: true returns the key once (create / rotate paths)", () => {
    const out = _redactWebhookForTest(makeWebhook(), { revealSignatureKey: true });
    expect(out.signatureKey).toBe("sk_live_abcdef123456");
    // httpPass is still dropped — only signatureKey is opted in.
    expect("httpPass" in (out as Record<string, unknown>)).toBe(false);
  });

  test("missing httpPass / signatureKey on the server payload yields false booleans", () => {
    const out = _redactWebhookForTest(
      makeWebhook({ httpPass: "", signatureKey: "" })
    );
    expect(out.hasHttpPass).toBe(false);
    expect(out.hasSignatureKey).toBe(false);
  });

  test("revealSignatureKey: true with empty signatureKey does NOT add an empty-string field", () => {
    const out = _redactWebhookForTest(
      makeWebhook({ signatureKey: "" }),
      { revealSignatureKey: true }
    );
    expect("signatureKey" in (out as Record<string, unknown>)).toBe(false);
  });

  test("preserves non-sensitive fields verbatim", () => {
    const w = makeWebhook({
      name: "Order events",
      url: "https://api.test/orders",
      events: ["functions.*.executions.*.update"],
      enabled: false,
      security: false,
    });
    const out = _redactWebhookForTest(w);
    expect(out.name).toBe("Order events");
    expect(out.url).toBe("https://api.test/orders");
    expect(out.events).toEqual(["functions.*.executions.*.update"]);
    expect(out.enabled).toBe(false);
    expect(out.security).toBe(false);
  });
});
