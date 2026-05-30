/**
 * Thin REST wrappers around Appwrite's Proxy service.
 *
 * The `node-appwrite@23` SDK that the rest of the CLI uses does not expose
 * the Proxy service yet (`@appwrite.io/console@12` does, but that's a
 * browser SDK with the wrong auth model). The endpoints are stable and
 * documented; we just call them with the API key the user already gave us.
 *
 * Endpoint shapes were verified against
 * `node_modules/.bun/@appwrite.io+console@12.0.0/dist/esm/sdk.js`:
 *   GET    /v1/proxy/rules          (queries[]=, search=, total=)
 *   POST   /v1/proxy/rules/function ({ domain, functionId, branch? })
 *   POST   /v1/proxy/rules/site     ({ domain, siteId, branch? })
 *   DELETE /v1/proxy/rules/{ruleId}
 */
import type { Client } from "node-appwrite";

export interface ProxyRule {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  domain: string;
  resourceType?: string;
  resourceId?: string;
  deploymentResourceType?: "function" | "site";
  deploymentResourceId?: string;
  deploymentVcsProviderBranch?: string;
  status?: "created" | "verifying" | "verified" | "unverified";
  type?: "api" | "deployment" | "redirect";
  trigger?: "manual" | "deployment";
  redirectUrl?: string;
  redirectStatusCode?: number;
  logs?: string;
}

export type ProxyResourceType = "function" | "site";

function authHeaders(client: Client): Record<string, string> {
  const { project, key } = client.config;
  return {
    "X-Appwrite-Project": project,
    "X-Appwrite-Key": key,
    "Content-Type": "application/json",
  };
}

function baseUrl(client: Client): string {
  // client.config.endpoint already includes /v1; the SDK just appends.
  return client.config.endpoint.replace(/\/$/, "");
}

async function request<T>(
  method: "GET" | "POST" | "DELETE",
  url: string,
  init: { headers: Record<string, string>; body?: unknown }
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: init.headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    // Surface Appwrite's structured error if present, otherwise the raw body.
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = j.message ? `${j.message} (${res.status})` : text;
    } catch {}
    throw new Error(`Proxy API ${method} ${url} failed: ${detail}`);
  }
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

/**
 * List proxy rules attached to a function or site. Uses the same `queries[]`
 * filtering wire format as the rest of the Appwrite REST API.
 */
export async function listRulesForResource(
  client: Client,
  resourceType: ProxyResourceType,
  resourceId: string
): Promise<ProxyRule[]> {
  const queries = [
    JSON.stringify({ method: "equal", attribute: "deploymentResourceType", values: [resourceType] }),
    JSON.stringify({ method: "equal", attribute: "deploymentResourceId", values: [resourceId] }),
  ];
  const params = new URLSearchParams();
  for (const q of queries) params.append("queries[]", q);
  const url = `${baseUrl(client)}/proxy/rules?${params.toString()}`;
  const body = await request<{ total: number; rules: ProxyRule[] }>(
    "GET",
    url,
    { headers: authHeaders(client) }
  );
  return body.rules ?? [];
}

export async function createFunctionRule(
  client: Client,
  params: { domain: string; functionId: string; branch?: string }
): Promise<ProxyRule> {
  return request<ProxyRule>(
    "POST",
    `${baseUrl(client)}/proxy/rules/function`,
    { headers: authHeaders(client), body: params }
  );
}

export async function createSiteRule(
  client: Client,
  params: { domain: string; siteId: string; branch?: string }
): Promise<ProxyRule> {
  return request<ProxyRule>(
    "POST",
    `${baseUrl(client)}/proxy/rules/site`,
    { headers: authHeaders(client), body: params }
  );
}

export async function deleteRule(client: Client, ruleId: string): Promise<void> {
  await request<void>(
    "DELETE",
    `${baseUrl(client)}/proxy/rules/${encodeURIComponent(ruleId)}`,
    { headers: authHeaders(client) }
  );
}

/**
 * Reconcile a resource's desired vs existing proxy rules. Always creates
 * missing domains; only deletes extras when `prune` is true. Idempotent —
 * existing rules with matching domains are left alone.
 *
 * Returns a summary so the caller can log what changed.
 */
export async function reconcileResourceDomains(
  client: Client,
  resourceType: ProxyResourceType,
  resourceId: string,
  desiredDomains: string[],
  options: { prune?: boolean; branch?: string } = {}
): Promise<{ created: string[]; deleted: string[]; kept: string[] }> {
  const desired = new Set(desiredDomains.map((d) => d.trim()).filter(Boolean));
  const existing = await listRulesForResource(client, resourceType, resourceId);
  const existingByDomain = new Map(existing.map((r) => [r.domain, r]));

  const created: string[] = [];
  const deleted: string[] = [];
  const kept: string[] = [];

  for (const domain of desired) {
    if (existingByDomain.has(domain)) {
      kept.push(domain);
      continue;
    }
    if (resourceType === "function") {
      await createFunctionRule(client, {
        domain,
        functionId: resourceId,
        branch: options.branch,
      });
    } else {
      await createSiteRule(client, {
        domain,
        siteId: resourceId,
        branch: options.branch,
      });
    }
    created.push(domain);
  }

  if (options.prune) {
    for (const rule of existing) {
      if (!desired.has(rule.domain)) {
        await deleteRule(client, rule.$id);
        deleted.push(rule.domain);
      }
    }
  }

  return { created, deleted, kept };
}
