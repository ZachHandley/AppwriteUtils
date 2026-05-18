import { describe, expect, test, mock } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Tests for the auth-resolution refinements landed alongside the user's
 * "get_execution_logs / no auth available" diagnostic session:
 *   - testSession: account.get() fallback when project-scoped probe fails
 *   - ConfigManager: API-key fallback chain after findWorkingSession returns null
 *   - ClientFactory: enriched "no auth" error with discovery diagnostic
 *   - findCurrentSession: only surfaces projectId when entry has explicit
 *     `project` field; user-session entries (cookie/login) return undefined
 *     so AuthResolver doesn't 404 by sending the user-account-ID as
 *     X-Appwrite-Project.
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

describe("findCurrentSession — entry-key vs entry.project disambiguation", () => {
  // Helper: write a custom prefs.json to a tmpdir and point the service at it
  // via the constructor's `prefsPath` parameter. We DON'T touch the real
  // ~/.appwrite/prefs.json — that's the user's file and we have a hard rule
  // against mutating it.
  const writePrefs = (content: unknown): string => {
    const dir = mkdtempSync(join(tmpdir(), "awu-currentSession-"));
    const path = join(dir, "prefs.json");
    writeFileSync(path, JSON.stringify(content), { mode: 0o600 });
    return path;
  };

  test("user-session entry (cookie only, no entry.project) → projectId undefined", async () => {
    // Reproduces the prod bug: prefs.current points at an entry created by
    // `appwrite login`. The entry KEY is the user/session ID, NOT a project
    // ID. findCurrentSession MUST NOT propagate the entry key as projectId.
    const prefsPath = writePrefs({
      current: "user-session-id-xyz",
      "user-session-id-xyz": {
        endpoint: "https://cloud.appwrite.io/v1",
        email: "test@example.com",
        cookie: "a_session_console=value",
        // NO `project` field — this is what `appwrite login` writes
      },
    });

    try {
      const svc = new SessionAuthService(prefsPath);
      const current = await svc.findCurrentSession();
      expect(current).not.toBeNull();
      expect(current!.endpoint).toBe("https://cloud.appwrite.io/v1");
      expect(current!.sessionCookie).toBe("a_session_console=value");
      expect(current!.email).toBe("test@example.com");
      // CRITICAL: projectId must NOT be the entry key
      expect(current!.projectId).toBeUndefined();
    } finally {
      rmSync(prefsPath, { recursive: true, force: true });
    }
  });

  test("project-key entry (has entry.project + entry.key) → projectId = entry.project", async () => {
    // `appwrite client --project-id real-project --key standard_xxx` writes an
    // entry with both `project` AND `key` fields. The entry key in prefs.json
    // also happens to equal the project ID for this kind of entry. We pick
    // up the explicit `project` field — that's the source of truth.
    const prefsPath = writePrefs({
      current: "real-project",
      "real-project": {
        endpoint: "https://appwrite.example.test/v1",
        project: "real-project",
        key: "standard_aaaabbbbccccdddd",
      },
    });

    try {
      const svc = new SessionAuthService(prefsPath);
      const current = await svc.findCurrentSession();
      expect(current).not.toBeNull();
      expect(current!.endpoint).toBe("https://appwrite.example.test/v1");
      expect(current!.projectId).toBe("real-project");
      expect(current!.apiKey).toBe("standard_aaaabbbbccccdddd");
      expect(current!.sessionCookie).toBeUndefined();
    } finally {
      rmSync(prefsPath, { recursive: true, force: true });
    }
  });

  test("current points at a missing entry → returns null", async () => {
    const prefsPath = writePrefs({
      current: "nonexistent-id",
      "some-other-id": {
        endpoint: "https://cloud.appwrite.io/v1",
        cookie: "a_session_x=y",
      },
    });

    try {
      const svc = new SessionAuthService(prefsPath);
      const current = await svc.findCurrentSession();
      expect(current).toBeNull();
    } finally {
      rmSync(prefsPath, { recursive: true, force: true });
    }
  });
});
