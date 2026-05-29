import { Client, Project, ID, type Models } from "node-appwrite";
import pLimit from "p-limit";
import { tryAwaitWithRetry } from "../utils/helperFunctions.js";

// Concurrency limits — mirror FunctionManager / UsersManager style.
// Reads are funneled through `queryLimit`; writes (create/update/delete) go
// through `projectLimit`. All SDK calls are retried via `tryAwaitWithRetry`.
const projectLimit = pLimit(5);   // Moderate limit for project-variable writes
const queryLimit = pLimit(25);    // Higher limit for read operations

export interface CreateProjectVariableOptions {
  /** Optional secret flag. Default: false. Once secret, the value is never returned by the API. */
  secret?: boolean;
  /**
   * Optional custom variable ID. If omitted, a unique ID is generated via
   * `ID.unique()` because the underlying SDK requires `variableId`.
   */
  variableId?: string;
}

export interface UpdateProjectVariablePatch {
  /** New key (optional). Max length: 255 chars. */
  key?: string;
  /** New value (optional). Max length: 8192 chars. */
  value?: string;
  /** Toggle secret flag (optional). Once secret, value is never returned by the API. */
  secret?: boolean;
}

/**
 * Manager wrapping the node-appwrite v23 `Project` server-side service for
 * project-level configuration — specifically project variables, which inherit
 * into every function in the project.
 *
 * The underlying SDK reads the project from the bound `Client` (set via
 * `client.setProject(projectId)` which `AuthResolver` / `ClientRegistry`
 * already handles upstream). The `projectId` argument in every method is a
 * documentation/sanity-check device for caller clarity — we do not throw on
 * mismatch because the bound-client project is the source of truth.
 *
 * Reads go through `queryLimit` (concurrency 25); writes through
 * `projectLimit` (concurrency 5). All SDK calls are wrapped in
 * `tryAwaitWithRetry` for transient-error resilience.
 */
export class ProjectsManager {
  private client: Client;
  private project: Project;

  constructor(client: Client) {
    this.client = client;
    this.project = new Project(client);
  }

  /**
   * List all project variables. Project variables are inherited by every
   * function in the project unless overridden by a function-scoped variable.
   *
   * @param projectId - Sanity-check argument; the bound client's project is
   *   the actual target. Not forwarded to the SDK.
   * @param queries - Optional Appwrite Query strings.
   */
  public async listVariables(
    projectId: string,
    queries?: string[]
  ): Promise<Models.VariableList> {
    void projectId;
    return await queryLimit(() =>
      tryAwaitWithRetry(async () => {
        const params: { queries?: string[] } = {};
        if (queries && queries.length > 0) params.queries = queries;
        return await this.project.listVariables(params);
      })
    );
  }

  /**
   * Get a single project variable by ID.
   *
   * @param projectId - Sanity-check argument; the bound client's project is
   *   the actual target.
   * @param variableId - Variable ID to fetch.
   */
  public async getVariable(
    projectId: string,
    variableId: string
  ): Promise<Models.Variable> {
    void projectId;
    return await queryLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.project.getVariable({ variableId })
      )
    );
  }

  /**
   * Create a new project variable. If `options.variableId` is omitted, a
   * unique ID is generated via `ID.unique()` because the SDK requires it.
   *
   * @param projectId - Sanity-check argument; the bound client's project is
   *   the actual target.
   * @param key - Variable key. Max length: 255 chars.
   * @param value - Variable value. Max length: 8192 chars.
   * @param options - Optional `secret` flag and custom `variableId`.
   */
  public async createVariable(
    projectId: string,
    key: string,
    value: string,
    options: CreateProjectVariableOptions = {}
  ): Promise<Models.Variable> {
    void projectId;
    const variableId = options.variableId ?? ID.unique();
    const secret = options.secret ?? false;

    return await projectLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.project.createVariable({
          variableId,
          key,
          value,
          secret,
        })
      )
    );
  }

  /**
   * Update an existing project variable. All patch fields are optional —
   * mirrors the SDK's `updateVariable({ variableId, key?, value?, secret? })`
   * signature.
   *
   * @param projectId - Sanity-check argument; the bound client's project is
   *   the actual target.
   * @param variableId - Variable ID to update.
   * @param patch - Optional `key`, `value`, and/or `secret` to update.
   */
  public async updateVariable(
    projectId: string,
    variableId: string,
    patch: UpdateProjectVariablePatch
  ): Promise<Models.Variable> {
    void projectId;
    return await projectLimit(() =>
      tryAwaitWithRetry(async () => {
        const params: {
          variableId: string;
          key?: string;
          value?: string;
          secret?: boolean;
        } = { variableId };
        if (patch.key !== undefined) params.key = patch.key;
        if (patch.value !== undefined) params.value = patch.value;
        if (patch.secret !== undefined) params.secret = patch.secret;
        return await this.project.updateVariable(params);
      })
    );
  }

  /**
   * Delete a project variable by ID.
   *
   * @param projectId - Sanity-check argument; the bound client's project is
   *   the actual target.
   * @param variableId - Variable ID to delete.
   */
  public async deleteVariable(
    projectId: string,
    variableId: string
  ): Promise<void> {
    void projectId;
    await projectLimit(() =>
      tryAwaitWithRetry(async () => {
        await this.project.deleteVariable({ variableId });
      })
    );
  }

  /**
   * Upsert a project variable BY KEY: update the existing variable with that
   * key, or create it if absent. Appwrite enforces unique keys per project
   * scope, so the key is the natural idempotency anchor.
   */
  public async upsertVariable(
    projectId: string,
    key: string,
    value: string,
    options: CreateProjectVariableOptions = {}
  ): Promise<Models.Variable> {
    const existing = await this.listVariables(projectId);
    const match = existing.variables.find((v) => v.key === key);
    if (match) {
      return await this.updateVariable(projectId, match.$id, {
        key,
        value,
        secret: options.secret,
      });
    }
    return await this.createVariable(projectId, key, value, options);
  }

  /**
   * Bulk upsert project variables by key. Lists once, then routes each entry
   * to update-or-create. Concurrency bounded by the shared limiters in the
   * underlying create/update calls.
   */
  public async upsertVariables(
    projectId: string,
    vars: Array<{ key: string; value: string; secret?: boolean }>
  ): Promise<Models.Variable[]> {
    const existing = await this.listVariables(projectId);
    const byKey = new Map(existing.variables.map((v) => [v.key, v]));
    return await Promise.all(
      vars.map((entry) => {
        const match = byKey.get(entry.key);
        if (match) {
          return this.updateVariable(projectId, match.$id, {
            key: entry.key,
            value: entry.value,
            secret: entry.secret,
          });
        }
        return this.createVariable(projectId, entry.key, entry.value, {
          secret: entry.secret,
        });
      })
    );
  }

  /**
   * Bulk delete project variables. Accepts variable IDs and/or keys; keys are
   * resolved to IDs via a single list call. Returns the IDs deleted and the
   * keys that didn't resolve (skipped, not errored).
   */
  public async deleteVariables(
    projectId: string,
    selector: { variableIds?: string[]; keys?: string[] }
  ): Promise<{ deleted: string[]; skipped: string[] }> {
    const ids = new Set(selector.variableIds ?? []);
    const skipped: string[] = [];

    if (selector.keys && selector.keys.length > 0) {
      const existing = await this.listVariables(projectId);
      const byKey = new Map(existing.variables.map((v) => [v.key, v.$id]));
      for (const key of selector.keys) {
        const id = byKey.get(key);
        if (id) ids.add(id);
        else skipped.push(key);
      }
    }

    const deleted: string[] = [];
    await Promise.all(
      [...ids].map(async (id) => {
        await this.deleteVariable(projectId, id);
        deleted.push(id);
      })
    );
    return { deleted, skipped };
  }
}
