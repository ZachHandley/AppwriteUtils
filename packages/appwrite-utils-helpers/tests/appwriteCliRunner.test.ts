import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import * as realOs from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";

// `node:os`.homedir is the seam through which the runner discovers the
// Appwrite CLI's prefs.json. Under bun-on-snap, the real homedir() ignores
// HOME env overrides, so we mock it directly. The mock reads a mutable
// state var so beforeEach can swap the value per-test.
const homeState = { current: realOs.homedir() };
mock.module("node:os", () => ({
  ...realOs,
  homedir: () => homeState.current,
}));

// We replace `execa` with a mock that records all calls AND snapshots the
// tmpdir prefs.json AT THE TIME OF CALL — because the runner deletes the
// tmpdir in `finally`, the prefs file is gone by the time the test
// assertions run. Capturing inside the mock gives us the file shape that
// the real `appwrite` subprocess WOULD have seen.
type ExecaCall = {
  args: unknown[];
  opts: unknown;
  /** env.HOME the subprocess would have seen. */
  envHome?: string;
  /** Snapshot of tmpdir/.appwrite/prefs.json contents at call time. */
  tmpdirPrefs?: unknown;
};
const execaCalls: ExecaCall[] = [];

mock.module("execa", () => ({
  execa: (...callArgs: unknown[]) => {
    const opts = callArgs[callArgs.length - 1] as
      | { env?: Record<string, string> }
      | undefined;
    const envHome = opts?.env?.HOME;
    let tmpdirPrefs: unknown;
    if (envHome) {
      const prefsPath = join(envHome, ".appwrite", "prefs.json");
      if (existsSync(prefsPath)) {
        try {
          tmpdirPrefs = JSON.parse(readFileSync(prefsPath, "utf-8"));
        } catch {
          // Leave undefined on parse errors.
        }
      }
    }
    execaCalls.push({
      args: callArgs.slice(0, -1),
      opts,
      envHome,
      tmpdirPrefs,
    });
    return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
  },
}));

// Dynamic import so the mock is wired before the module evaluates.
const { runAppwriteCli, runAppwriteCliIsolated, injectCredentials, hasCliPrefsFor } =
  await import("../src/cli/appwriteCliRunner.js");

let tempHome: string;

async function writePrefs(prefs: unknown): Promise<void> {
  const dir = join(tempHome, ".appwrite");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "prefs.json"), JSON.stringify(prefs), "utf-8");
}

beforeEach(async () => {
  execaCalls.length = 0;
  tempHome = await mkdtemp(join(tmpdir(), "appwrite-runner-test-"));
  homeState.current = tempHome;
});

afterEach(async () => {
  await rm(tempHome, { recursive: true, force: true });
});

describe("appwriteCliRunner auth bridge", () => {
  test("#17 — prefs.json short-circuit: no injectCredentials calls when prefs match", async () => {
    // A matching project-keyed entry in prefs.json. The runner's hasCliPrefsFor
    // should return true and skip the four `client` sub-calls.
    await writePrefs({
      "proj-123": {
        endpoint: "https://example.test/v1",
        project: "proj-123",
        cookie: "valid-cookie",
      },
    });

    await runAppwriteCli(["whoami"], {
      credentials: {
        endpoint: "https://example.test/v1",
        projectId: "proj-123",
        apiKey: "k",
      },
    });

    // Only the actual `appwrite whoami` call should have happened — no
    // `appwrite client --reset/...` sub-calls.
    const clientCalls = execaCalls.filter((c) => {
      const args = c.args[1] as string[] | undefined;
      return Array.isArray(args) && args.includes("client");
    });
    expect(clientCalls.length).toBe(0);

    // Exactly one execa call total: the `appwrite whoami` invocation.
    expect(execaCalls.length).toBe(1);
    const finalArgs = execaCalls[0]?.args[1] as string[];
    expect(finalArgs).toContain("whoami");
  });

  test("#18 — prefs miss + creds: prefs is written into tmpdir, not into homedir()", async () => {
    // No prefs.json under tempHome (homedir() mock) — and we supply creds.
    // Under the always-isolated design: runAppwriteCli mkdtemps an isolated
    // home, writes our creds there, then runs `whoami` with env.HOME → tmpdir.
    // The real prefs.json (here: tempHome/.appwrite/prefs.json) is NEVER created.
    await runAppwriteCli(["whoami"], {
      credentials: {
        endpoint: "https://example.test/v1",
        projectId: "proj-123",
        apiKey: "my-key",
      },
    });

    // No `appwrite client` subprocesses — Appwrite's state-mutation surface
    // is never invoked.
    const clientCalls = execaCalls.filter((c) => {
      const args = c.args[1] as string[] | undefined;
      return Array.isArray(args) && args.includes("client");
    });
    expect(clientCalls.length).toBe(0);

    // Exactly one execa call: the `appwrite whoami` invocation.
    expect(execaCalls.length).toBe(1);
    const call = execaCalls[0]!;
    const finalArgs = call.args[1] as string[];
    expect(finalArgs).toContain("whoami");

    // The subprocess saw env.HOME pointing at a tmpdir under our prefix —
    // NOT at the mocked homedir().
    expect(call.envHome).toBeDefined();
    expect(call.envHome).not.toBe(tempHome);
    expect(call.envHome!.includes("appwrite-mcp-cli-")).toBe(true);

    // Inside the tmpdir, the prefs file has the shape we wrote.
    expect(call.tmpdirPrefs).toBeDefined();
    const prefs = call.tmpdirPrefs as Record<string, any>;
    expect(typeof prefs.current).toBe("string");
    expect(prefs.current.length).toBeGreaterThan(0);
    const session = prefs[prefs.current];
    expect(session.endpoint).toBe("https://example.test/v1");
    expect(session.project).toBe("proj-123");
    expect(session.key).toBe("my-key");
    expect(session.cookie).toBeUndefined();

    // CRITICAL — the user's real prefs path (tempHome/.appwrite/prefs.json
    // under the mocked homedir()) was NEVER created.
    expect(existsSync(join(tempHome, ".appwrite", "prefs.json"))).toBe(false);
  });

  test("#18b — apiKey omitted: tmpdir prefs has endpoint+project but no key", async () => {
    await runAppwriteCli(["whoami"], {
      credentials: {
        endpoint: "https://example.test/v1",
        projectId: "proj-123",
      },
    });

    const clientCalls = execaCalls.filter((c) => {
      const args = c.args[1] as string[] | undefined;
      return Array.isArray(args) && args.includes("client");
    });
    expect(clientCalls.length).toBe(0);
    expect(execaCalls.length).toBe(1);

    const prefs = execaCalls[0]!.tmpdirPrefs as Record<string, any>;
    const session = prefs[prefs.current];
    expect(session.endpoint).toBe("https://example.test/v1");
    expect(session.project).toBe("proj-123");
    expect(session.key).toBeUndefined();
    expect(session.cookie).toBeUndefined();

    // Real prefs path untouched.
    expect(existsSync(join(tempHome, ".appwrite", "prefs.json"))).toBe(false);
  });

  test("#19 — sidecar creds land in tmpdir prefs, not in real homedir prefs", async () => {
    const { resolveCliCredentials } = await import(
      "../src/cli/resolveCliCredentials.js"
    );

    const credentials = resolveCliCredentials({
      argv: {},
      env: {},
      sidecarAuth: {
        endpoint: "https://sidecar.example/v1",
        projectId: "sidecar-project",
        apiKey: "sidecar-key",
      },
    });

    expect(credentials).toEqual({
      endpoint: "https://sidecar.example/v1",
      projectId: "sidecar-project",
      apiKey: "sidecar-key",
    });

    await runAppwriteCli(["whoami"], { credentials });

    const clientCalls = execaCalls.filter((c) => {
      const args = c.args[1] as string[] | undefined;
      return Array.isArray(args) && args.includes("client");
    });
    expect(clientCalls.length).toBe(0);

    const prefs = execaCalls[0]!.tmpdirPrefs as Record<string, any>;
    const session = prefs[prefs.current];
    expect(session.endpoint).toBe("https://sidecar.example/v1");
    expect(session.project).toBe("sidecar-project");
    expect(session.key).toBe("sidecar-key");

    // Real prefs path untouched.
    expect(existsSync(join(tempHome, ".appwrite", "prefs.json"))).toBe(false);
  });

  test("#20 — seed copy: existing real prefs are read-only-copied into the tmpdir for commands without creds", async () => {
    // The user has an existing `~/.appwrite/prefs.json` (mocked via tempHome).
    // A creds-less command (think interactive `appwrite whoami`) should still
    // see that auth state — we copy the file into the tmpdir read-only.
    await writePrefs({
      current: "session-abc",
      "session-abc": {
        endpoint: "https://existing.example/v1",
        project: "existing-proj",
        cookie: "existing-cookie",
      },
    });
    const realPrefsBefore = readFileSync(
      join(tempHome, ".appwrite", "prefs.json"),
      "utf-8",
    );

    await runAppwriteCli(["whoami"]); // no credentials

    expect(execaCalls.length).toBe(1);
    const call = execaCalls[0]!;
    expect(call.envHome).not.toBe(tempHome);
    expect(call.envHome!.includes("appwrite-mcp-cli-")).toBe(true);

    // The tmpdir prefs is the seeded copy of the real file.
    const prefs = call.tmpdirPrefs as Record<string, any>;
    expect(prefs.current).toBe("session-abc");
    expect(prefs["session-abc"].endpoint).toBe("https://existing.example/v1");
    expect(prefs["session-abc"].cookie).toBe("existing-cookie");

    // And the real prefs file is byte-identical to what we wrote.
    const realPrefsAfter = readFileSync(
      join(tempHome, ".appwrite", "prefs.json"),
      "utf-8",
    );
    expect(realPrefsAfter).toBe(realPrefsBefore);
  });

  test("#21 — existing real prefs + creds: tmpdir prefs is overwritten, real prefs unchanged", async () => {
    await writePrefs({
      current: "old-session",
      "old-session": {
        endpoint: "https://old.example/v1",
        project: "old-proj",
        key: "old-key",
      },
    });
    const realPrefsBefore = readFileSync(
      join(tempHome, ".appwrite", "prefs.json"),
      "utf-8",
    );

    await runAppwriteCli(["whoami"], {
      credentials: {
        endpoint: "https://new.example/v1",
        projectId: "new-proj",
        apiKey: "new-key",
      },
    });

    const prefs = execaCalls[0]!.tmpdirPrefs as Record<string, any>;
    const session = prefs[prefs.current];
    expect(session.endpoint).toBe("https://new.example/v1");
    expect(session.project).toBe("new-proj");
    expect(session.key).toBe("new-key");
    // Old session should NOT survive the overwrite — writeIsolatedPrefs
    // replaces the entire file with a fresh shape.
    expect(prefs["old-session"]).toBeUndefined();

    // Real prefs untouched.
    expect(
      readFileSync(join(tempHome, ".appwrite", "prefs.json"), "utf-8"),
    ).toBe(realPrefsBefore);
  });

  test("#22 — injectCredentials throws (no longer writes to real prefs)", async () => {
    await expect(
      injectCredentials({
        endpoint: "https://example.test/v1",
        projectId: "p",
        apiKey: "k",
      }),
    ).rejects.toThrow(/injectCredentials\(\) was removed/);

    // Real prefs untouched.
    expect(existsSync(join(tempHome, ".appwrite", "prefs.json"))).toBe(false);
  });

  test("#23 — runAppwriteCliIsolated is an alias for runAppwriteCli", () => {
    expect(runAppwriteCliIsolated).toBe(runAppwriteCli);
  });

  test("#24 — disablePrefsSeed: real prefs are NOT copied into the tmpdir when opted out", async () => {
    await writePrefs({
      current: "should-not-leak",
      "should-not-leak": {
        endpoint: "https://leaked.example/v1",
        cookie: "leaked-cookie",
      },
    });

    await runAppwriteCli(["whoami"], { disablePrefsSeed: true });

    const prefs = execaCalls[0]!.tmpdirPrefs;
    // No prefs file should exist in the tmpdir because we disabled seeding
    // and didn't supply creds.
    expect(prefs).toBeUndefined();
  });
});

describe("hasCliPrefsFor prefs.json layout support", () => {
  test("flat layout match", async () => {
    await writePrefs({
      endpoint: "https://example.test/v1",
      project: "p1",
      cookie: "c",
    });
    expect(await hasCliPrefsFor("https://example.test/v1", "p1")).toBe(true);
    expect(await hasCliPrefsFor("https://example.test/v1", "p2")).toBe(false);
  });

  test("current-session layout match", async () => {
    await writePrefs({
      current: "session-1",
      "session-1": {
        endpoint: "https://example.test/v1",
        project: "p1",
        cookie: "c",
      },
    });
    expect(await hasCliPrefsFor("https://example.test/v1", "p1")).toBe(true);
  });

  test("project-keyed layout match", async () => {
    await writePrefs({
      p1: { endpoint: "https://example.test/v1", cookie: "c" },
    });
    expect(await hasCliPrefsFor("https://example.test/v1", "p1")).toBe(true);
  });

  test("any-entry fallback match", async () => {
    await writePrefs({
      "some-random-id": {
        endpoint: "https://example.test/v1",
        project: "p1",
        key: "k",
      },
    });
    expect(await hasCliPrefsFor("https://example.test/v1", "p1")).toBe(true);
  });

  test("returns false when prefs file is missing", async () => {
    expect(await hasCliPrefsFor("https://example.test/v1", "p1")).toBe(false);
  });
});
