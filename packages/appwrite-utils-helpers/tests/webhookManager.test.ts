import { describe, expect, test } from "bun:test";
import { Client, type Models } from "node-appwrite";

import { WebhookManager } from "../src/projects/webhookManager.js";

/**
 * Build a WebhookManager backed by a fake `Webhooks` SDK stub. We construct
 * the real manager (so concurrency limiters + retry wrapping are exercised)
 * then replace its private `.webhooks` slot with a stub that records calls.
 */
function buildManagerWithStub() {
  const client = new Client();
  const manager = new WebhookManager(client);

  const calls: Array<{ method: string; args: unknown }> = [];
  let nextGetResult: Partial<Models.Webhook> | null = null;

  const stub = {
    async list(params: { queries?: string[] }): Promise<Models.WebhookList> {
      calls.push({ method: "list", args: params });
      return { total: 0, webhooks: [] };
    },
    async get(params: { webhookId: string }): Promise<Models.Webhook> {
      calls.push({ method: "get", args: params });
      return {
        $id: params.webhookId,
        $createdAt: "now",
        $updatedAt: "now",
        name: nextGetResult?.name ?? "Baseline name",
        url: nextGetResult?.url ?? "https://baseline.test/hook",
        events: nextGetResult?.events ?? ["baseline.event"],
        security: nextGetResult?.security ?? true,
        httpUser: nextGetResult?.httpUser ?? "",
        httpPass: nextGetResult?.httpPass ?? "",
        signatureKey: nextGetResult?.signatureKey ?? "sk-baseline",
        enabled: nextGetResult?.enabled ?? true,
        logs: "",
        attempts: 0,
      } as Models.Webhook;
    },
    async create(params: unknown): Promise<Models.Webhook> {
      calls.push({ method: "create", args: params });
      return { $id: "wh-new" } as Models.Webhook;
    },
    async update(params: unknown): Promise<Models.Webhook> {
      calls.push({ method: "update", args: params });
      return { $id: "wh-updated" } as Models.Webhook;
    },
    async delete(params: unknown): Promise<Record<string, never>> {
      calls.push({ method: "delete", args: params });
      return {};
    },
    async updateSignature(params: unknown): Promise<Models.Webhook> {
      calls.push({ method: "updateSignature", args: params });
      return { $id: "wh-rotated", signatureKey: "sk-rotated" } as Models.Webhook;
    },
  };

  (manager as unknown as { webhooks: typeof stub }).webhooks = stub;

  return {
    manager,
    calls,
    setNextGetResult(w: Partial<Models.Webhook> | null) {
      nextGetResult = w;
    },
  };
}

describe("WebhookManager", () => {
  test("listWebhooks omits empty queries from the SDK params", async () => {
    const { manager, calls } = buildManagerWithStub();
    await manager.listWebhooks("proj-1");
    expect(calls[0]?.args).toEqual({});
  });

  test("listWebhooks forwards non-empty queries", async () => {
    const { manager, calls } = buildManagerWithStub();
    await manager.listWebhooks("proj-1", ['equal("enabled",true)']);
    expect(calls[0]?.args).toEqual({ queries: ['equal("enabled",true)'] });
  });

  test("createWebhook generates a unique webhookId when not provided", async () => {
    const { manager, calls } = buildManagerWithStub();
    await manager.createWebhook("proj-1", "n", "https://a.test/h", ["x.y"]);
    const args = calls[0]?.args as { webhookId?: string };
    expect(typeof args.webhookId).toBe("string");
    expect(args.webhookId!.length).toBeGreaterThan(0);
  });

  test("createWebhook honors an explicit webhookId", async () => {
    const { manager, calls } = buildManagerWithStub();
    await manager.createWebhook("proj-1", "n", "https://a.test/h", ["x.y"], {
      webhookId: "my-id",
    });
    expect((calls[0]?.args as { webhookId: string }).webhookId).toBe("my-id");
  });

  test("createWebhook only forwards options that were actually set", async () => {
    const { manager, calls } = buildManagerWithStub();
    await manager.createWebhook("proj-1", "n", "https://a.test/h", ["x.y"], {
      enabled: true,
    });
    const args = calls[0]?.args as Record<string, unknown>;
    expect(args.enabled).toBe(true);
    expect("security" in args).toBe(false);
    expect("httpUser" in args).toBe(false);
    expect("httpPass" in args).toBe(false);
  });

  test("updateWebhook with a partial patch first reads baseline then sends a full PUT", async () => {
    // The SDK requires name/url/events on every PATCH; the manager must
    // backfill from a fresh get() when the caller omits any of them.
    const { manager, calls, setNextGetResult } = buildManagerWithStub();
    setNextGetResult({
      name: "Old name",
      url: "https://old.test/hook",
      events: ["a.b", "c.d"],
    });
    await manager.updateWebhook("proj-1", "wh-1", { enabled: false });

    expect(calls[0]?.method).toBe("get");
    expect(calls[1]?.method).toBe("update");
    const upd = calls[1]?.args as {
      name: string;
      url: string;
      events: string[];
      enabled: boolean;
    };
    expect(upd.name).toBe("Old name");
    expect(upd.url).toBe("https://old.test/hook");
    expect(upd.events).toEqual(["a.b", "c.d"]);
    expect(upd.enabled).toBe(false);
  });

  test("updateWebhook with a full patch skips the baseline GET", async () => {
    const { manager, calls } = buildManagerWithStub();
    await manager.updateWebhook("proj-1", "wh-1", {
      name: "New",
      url: "https://new.test/hook",
      events: ["fresh.event"],
      enabled: true,
    });
    expect(calls.map((c) => c.method)).toEqual(["update"]);
  });

  test("rotateSignature returns the new signatureKey for the caller to copy", async () => {
    const { manager } = buildManagerWithStub();
    const res = await manager.rotateSignature("proj-1", "wh-1");
    expect(res.signatureKey).toBe("sk-rotated");
  });

  test("deleteWebhook returns void after a successful call", async () => {
    const { manager, calls } = buildManagerWithStub();
    await manager.deleteWebhook("proj-1", "wh-1");
    expect(calls[0]?.method).toBe("delete");
    expect((calls[0]?.args as { webhookId: string }).webhookId).toBe("wh-1");
  });
});
