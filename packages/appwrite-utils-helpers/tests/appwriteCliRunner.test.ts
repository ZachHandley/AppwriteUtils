import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
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

// We replace `execa` with a mock that records all calls and returns a
// success result. The mock must be installed BEFORE we import the module
// under test so that the module captures the mocked binding at top level.
type ExecaCall = { args: unknown[]; opts: unknown };
const execaCalls: ExecaCall[] = [];

mock.module("execa", () => ({
  execa: (...callArgs: unknown[]) => {
    execaCalls.push({ args: callArgs.slice(0, -1), opts: callArgs[callArgs.length - 1] });
    return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
  },
}));

// Dynamic import so the mock is wired before the module evaluates.
const { runAppwriteCli, hasCliPrefsFor } = await import(
  "../src/cli/appwriteCliRunner.js"
);

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

  test("#18 — prefs.json miss: 4 sequential client calls before the actual command", async () => {
    // No prefs.json written → hasCliPrefsFor returns false → injectCredentials runs.
    await runAppwriteCli(["whoami"], {
      credentials: {
        endpoint: "https://example.test/v1",
        projectId: "proj-123",
        apiKey: "my-key",
      },
    });

    const clientCalls = execaCalls.filter((c) => {
      const args = c.args[1] as string[] | undefined;
      return Array.isArray(args) && args.includes("client");
    });

    // reset → endpoint → project-id → key
    expect(clientCalls.length).toBe(4);

    const flags = clientCalls.map((c) => {
      const args = c.args[1] as string[];
      return args.slice(args.indexOf("client") + 1);
    });

    expect(flags[0]).toEqual(["--reset"]);
    expect(flags[1]).toEqual(["--endpoint", "https://example.test/v1"]);
    expect(flags[2]).toEqual(["--project-id", "proj-123"]);
    expect(flags[3]).toEqual(["--key", "my-key"]);

    // Plus one more for the actual whoami.
    expect(execaCalls.length).toBe(5);
  });

  test("#18b — apiKey omitted: only 3 client calls (no --key)", async () => {
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
    expect(clientCalls.length).toBe(3);
    expect(execaCalls.length).toBe(4);
  });

  test("#19 — end-to-end via sidecar auth: creds resolved from sidecar are injected", async () => {
    // Lazy import so the mock is in place and we get the same module instance.
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

    const endpointCall = execaCalls.find((c) => {
      const args = c.args[1] as string[] | undefined;
      return Array.isArray(args) && args.includes("--endpoint");
    });
    expect(endpointCall).toBeDefined();
    const endpointArgs = endpointCall!.args[1] as string[];
    expect(endpointArgs[endpointArgs.indexOf("--endpoint") + 1]).toBe(
      "https://sidecar.example/v1"
    );

    const keyCall = execaCalls.find((c) => {
      const args = c.args[1] as string[] | undefined;
      return Array.isArray(args) && args.includes("--key");
    });
    const keyArgs = keyCall!.args[1] as string[];
    expect(keyArgs[keyArgs.indexOf("--key") + 1]).toBe("sidecar-key");
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
