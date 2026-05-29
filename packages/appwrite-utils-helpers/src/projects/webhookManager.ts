import { Client, Webhooks, ID, type Models } from "node-appwrite";
import pLimit from "p-limit";
import { tryAwaitWithRetry } from "../utils/helperFunctions.js";

// Mirror ProjectsManager / FunctionManager concurrency split. Webhook writes
// are infrequent and rate-limited server-side; reads happen during MCP audits
// where a tighter parallelism budget is acceptable.
const webhookWriteLimit = pLimit(5);
const webhookReadLimit = pLimit(25);

export interface CreateWebhookOptions {
  /** Custom webhook ID. Auto-generated via `ID.unique()` when omitted. */
  webhookId?: string;
  /** Webhook enabled flag. Default: true (Appwrite default). */
  enabled?: boolean;
  /** SSL/TLS certificate verification for the webhook URL. Default: true. */
  security?: boolean;
  /** Optional HTTP basic-auth username. Max 256 chars. */
  httpUser?: string;
  /** Optional HTTP basic-auth password. Max 256 chars. */
  httpPass?: string;
}

export interface UpdateWebhookPatch {
  /** New webhook name. Max 128 chars. */
  name?: string;
  /** New webhook URL. */
  url?: string;
  /** New events list. Max 100. */
  events?: string[];
  /** Enabled flag. */
  enabled?: boolean;
  /** SSL/TLS certificate verification. */
  security?: boolean;
  /** HTTP basic-auth username. */
  httpUser?: string;
  /** HTTP basic-auth password. */
  httpPass?: string;
}

/**
 * Manager wrapping the node-appwrite `Webhooks` service for project-level
 * webhook configuration. Webhooks deliver Appwrite events (database row
 * mutations, function invocations, auth events, etc.) to an external URL with
 * an HMAC-signed payload.
 *
 * Available on both Appwrite Cloud and self-hosted — webhooks are a core
 * project feature, not a cloud-only add-on like Backups.
 *
 * Concurrency: 25 for reads, 5 for writes. All SDK calls are wrapped in
 * `tryAwaitWithRetry` for transient-error resilience.
 *
 * The `Webhooks` SDK service operates on the project bound to the client
 * (set via `client.setProject(projectId)` upstream). The `projectId` arg on
 * each method here is a documentation/sanity-check device, mirroring the
 * `ProjectsManager` pattern.
 */
export class WebhookManager {
  private client: Client;
  private webhooks: Webhooks;

  constructor(client: Client) {
    this.client = client;
    this.webhooks = new Webhooks(client);
  }

  /**
   * List webhooks configured for the bound project. Supports Appwrite Query
   * filters on: name, url, httpUser, security, events, enabled, logs, attempts.
   */
  public async listWebhooks(
    projectId: string,
    queries?: string[]
  ): Promise<Models.WebhookList> {
    void projectId;
    return await webhookReadLimit(() =>
      tryAwaitWithRetry(async () => {
        const params: { queries?: string[] } = {};
        if (queries && queries.length > 0) params.queries = queries;
        return await this.webhooks.list(params);
      })
    );
  }

  /**
   * Get a single webhook by ID.
   */
  public async getWebhook(
    projectId: string,
    webhookId: string
  ): Promise<Models.Webhook> {
    void projectId;
    return await webhookReadLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.webhooks.get({ webhookId })
      )
    );
  }

  /**
   * Create a new webhook. If `options.webhookId` is omitted, a unique ID is
   * generated via `ID.unique()`. Response includes the freshly-minted
   * `signatureKey` — copy it now if you need to verify signatures, the
   * unredacted key only flows back here and on `rotateSignature`.
   */
  public async createWebhook(
    projectId: string,
    name: string,
    url: string,
    events: string[],
    options: CreateWebhookOptions = {}
  ): Promise<Models.Webhook> {
    void projectId;
    const webhookId = options.webhookId ?? ID.unique();

    return await webhookWriteLimit(() =>
      tryAwaitWithRetry(async () => {
        const params: {
          webhookId: string;
          url: string;
          name: string;
          events: string[];
          enabled?: boolean;
          security?: boolean;
          httpUser?: string;
          httpPass?: string;
        } = { webhookId, url, name, events };
        if (options.enabled !== undefined) params.enabled = options.enabled;
        if (options.security !== undefined) params.security = options.security;
        if (options.httpUser !== undefined) params.httpUser = options.httpUser;
        if (options.httpPass !== undefined) params.httpPass = options.httpPass;
        return await this.webhooks.create(params);
      })
    );
  }

  /**
   * Update an existing webhook. The SDK requires `name`, `url`, and `events`
   * on every update — when a patch omits any of these, the current value is
   * read first and re-sent so the call remains a true partial update from
   * the caller's perspective. This mirrors how the official Appwrite console
   * sends webhook PATCHes.
   */
  public async updateWebhook(
    projectId: string,
    webhookId: string,
    patch: UpdateWebhookPatch
  ): Promise<Models.Webhook> {
    void projectId;
    return await webhookWriteLimit(() =>
      tryAwaitWithRetry(async () => {
        // Fetch the current shape only when the patch is incomplete — saves a
        // round-trip for full-shape updates.
        const needsBaseline =
          patch.name === undefined ||
          patch.url === undefined ||
          patch.events === undefined;
        const baseline = needsBaseline
          ? await this.webhooks.get({ webhookId })
          : null;

        const params: {
          webhookId: string;
          name: string;
          url: string;
          events: string[];
          enabled?: boolean;
          security?: boolean;
          httpUser?: string;
          httpPass?: string;
        } = {
          webhookId,
          name: patch.name ?? baseline!.name,
          url: patch.url ?? baseline!.url,
          events: patch.events ?? baseline!.events,
        };
        if (patch.enabled !== undefined) params.enabled = patch.enabled;
        if (patch.security !== undefined) params.security = patch.security;
        if (patch.httpUser !== undefined) params.httpUser = patch.httpUser;
        if (patch.httpPass !== undefined) params.httpPass = patch.httpPass;
        return await this.webhooks.update(params);
      })
    );
  }

  /**
   * Delete a webhook by ID. The Appwrite project stops emitting events to
   * the URL immediately.
   */
  public async deleteWebhook(
    projectId: string,
    webhookId: string
  ): Promise<void> {
    void projectId;
    await webhookWriteLimit(() =>
      tryAwaitWithRetry(async () => {
        await this.webhooks.delete({ webhookId });
      })
    );
  }

  /**
   * Rotate the webhook signature key. The new key is returned in the
   * response (`signatureKey` field) — copy it immediately and update any
   * downstream signature verification, the unredacted key only flows back
   * here and on the initial `createWebhook` call.
   */
  public async rotateSignature(
    projectId: string,
    webhookId: string
  ): Promise<Models.Webhook> {
    void projectId;
    return await webhookWriteLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.webhooks.updateSignature({ webhookId })
      )
    );
  }
}
