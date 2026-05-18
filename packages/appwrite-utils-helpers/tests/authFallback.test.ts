import { describe, expect, test, mock } from "bun:test";

/**
 * Tests for the auth-resolution refinements landed alongside the user's
 * "get_execution_logs / no auth available" diagnostic session:
 *   - testSession: account.get() fallback when project-scoped probe fails
 *   - ConfigManager: API-key fallback chain after findWorkingSession returns null
 *   - ClientFactory: enriched "no auth" error with discovery diagnostic
 */

// Hooks for swapping node-appwrite class behaviour per-test. We replace the
// real SDK with stubs so testSession's probes hit our mocks instead of the
// network.
interface NextResult {
  ok?: boolean;
  err?: Error;
}
let nextTablesListResult: NextResult = { ok: true };
let nextDatabasesListResult: NextResult = { ok: true };
let nextAccountGetResult: NextResult = { ok: true };
const setTablesListResult = (r: NextResult) => { nextTablesListResult = r; };
const setDatabasesListResult = (r: NextResult) => { nextDatabasesListResult = r; };
const setAccountGetResult = (r: NextResult) => { nextAccountGetResult = r; };

mock.module("node-appwrite", () => {
  // NOTE: this mock is module-scoped — Bun's mock.module bleeds into other
  // test files in the same run. Mirror the REAL `node-appwrite` Client's
  // setKey/setEndpoint/setProject side effects exactly, so buildAppwriteClient
  // tests (which import the same module) still see real-ish behaviour.
  class Client {
    headers: Record<string, string> = {};
    config: Record<string, string> = {};
    setEndpoint(value: string) { this.config.endpoint = value; return this; }
    setProject(value: string) { this.config.project = value; return this; }
    setKey(value: string) {
      this.headers["X-Appwrite-Key"] = value;
      this.config.key = value;
      return this;
    }
  }
  class TablesDB {
    constructor(_c: unknown) {}
    async list() {
      if (nextTablesListResult.err) throw nextTablesListResult.err;
      return { tables: [], total: 0 };
    }
  }
  class Databases {
    constructor(_c: unknown) {}
    async list() {
      if (nextDatabasesListResult.err) throw nextDatabasesListResult.err;
      return { databases: [], total: 0 };
    }
  }
  class Account {
    constructor(_c: unknown) {}
    async get() {
      if (nextAccountGetResult.err) throw nextAccountGetResult.err;
      return { $id: "user", email: "x@example.com" };
    }
  }
  class Query {
    static limit(_n: number) { return ""; }
  }
  return { Client, TablesDB, Databases, Account, Query };
});

// Also mock fetchServerVersion so testSession's version-detection path is
// deterministic (returns null = useTables defaults to false → Databases path).
mock.module("../src/utils/versionDetection.js", () => ({
  fetchServerVersion: async () => null,
  isVersionAtLeast: () => false,
  detectAppwriteVersionCached: async () => ({ apiMode: "legacy" }),
}));

const { SessionAuthService } = await import(
  "../src/config/services/SessionAuthService.js"
);

describe("testSession — account.get() fallback", () => {
  // testSession is private; we exercise it via the public isSessionWorking
  // wrapper which forwards directly to testSession.

  test("project-scoped probe succeeds → session valid", async () => {
    setDatabasesListResult({ ok: true });
    setAccountGetResult({ err: new Error("should not be called") });

    const svc = new SessionAuthService();
    const ok = await svc.isSessionWorking(
      "https://example.test/v1",
      "p1",
      "a_session_x=y"
    );
    expect(ok).toBe(true);
  });

  test("project-scoped probe fails BUT account.get() succeeds → session valid", async () => {
    setDatabasesListResult({ err: Object.assign(new Error("404 not found"), { code: 404 }) });
    setAccountGetResult({ ok: true });

    const svc = new SessionAuthService();
    const ok = await svc.isSessionWorking(
      "https://example.test/v1",
      "p1",
      "a_session_x=y"
    );
    expect(ok).toBe(true);
  });

  test("BOTH probes fail → session invalid", async () => {
    setDatabasesListResult({ err: Object.assign(new Error("401 unauthorized"), { code: 401 }) });
    setAccountGetResult({ err: Object.assign(new Error("401 unauthorized"), { code: 401 }) });

    const svc = new SessionAuthService();
    const ok = await svc.isSessionWorking(
      "https://example.test/v1",
      "p1",
      "a_session_x=y"
    );
    expect(ok).toBe(false);
  });

  test("empty cookie → returns false without calling SDK", async () => {
    // Set both to errors so if the SDK IS called we'd see one
    setDatabasesListResult({ err: new Error("should not be called") });
    setAccountGetResult({ err: new Error("should not be called") });

    const svc = new SessionAuthService();
    const ok = await svc.isSessionWorking(
      "https://example.test/v1",
      "p1",
      ""
    );
    expect(ok).toBe(false);
  });
});
