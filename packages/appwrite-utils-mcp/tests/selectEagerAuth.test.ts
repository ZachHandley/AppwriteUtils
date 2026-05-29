import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AuthResolver } from "../src/auth/AuthResolver.js";
import { ProjectRegistry } from "../src/state/ProjectRegistry.js";
import { metaToolGroup } from "../src/tools/meta/index.js";

let scratch: string;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "appwrite-mcp-eager-auth-"));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

function getSelectTool() {
  const tool = metaToolGroup.tools.find((t) => t.name === "select_appwrite_project");
  if (!tool) throw new Error("select_appwrite_project tool not registered");
  return tool;
}

/**
 * Build a ToolContext + a tweakable SessionAuthService stub. Each test can
 * dictate what the prefs probe finds, simulating the "working session
 * present", "stale cache", or "no session at all" scenarios.
 */
function buildContext(opts: {
  configDir?: string;
  registryPath: string;
  /** What `findWorkingSession(endpoint, projectId)` should return. */
  workingSession?: { cookie: string; prefsKey: string; endpoint: string };
  /** What `isSessionWorking(endpoint, projectId, cookie)` returns per call. */
  isSessionWorking?: (
    endpoint: string,
    projectId: string,
    cookie: string
  ) => boolean | Promise<boolean>;
  /** What `loadSessionPrefs()` returns. */
  prefs?: Record<string, { cookie?: string; endpoint?: string }>;
}): any {
  const authResolver = new AuthResolver({ configDir: opts.configDir });
  const projectRegistry = new ProjectRegistry(opts.registryPath);

  // Stub the SessionAuthService so we don't hit prefs.json on disk during
  // these unit tests. Swap the instance the resolver hands out.
  const sessionService = {
    async findWorkingSession() {
      if (!opts.workingSession) return null;
      return {
        session: {
          endpoint: opts.workingSession.endpoint,
          projectId: "ignored",
          cookie: opts.workingSession.cookie,
        },
        prefsKey: opts.workingSession.prefsKey,
      };
    },
    async isSessionWorking(
      endpoint: string,
      projectId: string,
      cookie: string
    ) {
      if (!opts.isSessionWorking) return false;
      return await opts.isSessionWorking(endpoint, projectId, cookie);
    },
    async loadSessionPrefs() {
      return opts.prefs ?? null;
    },
  };
  (authResolver as unknown as { sessionService: typeof sessionService }).sessionService =
    sessionService;

  const clientRegistry = { invalidate: () => {} };
  return { authResolver, clientRegistry, projectRegistry, stateManager: {} as any };
}

async function makeProjectDir(scratchDir: string, name: string, projectId: string) {
  const dir = join(scratchDir, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "appwrite.json"), JSON.stringify({ projectId }), "utf-8");
  return dir;
}

describe("select_appwrite_project — eager auth probe", () => {
  test("with projectDir + working prefs session: pins sessionCookie + prefsKey, no warning", async () => {
    const projectDir = await makeProjectDir(scratch, "App1", "proj-app1");
    const ctx = buildContext({
      configDir: scratch,
      registryPath: join(scratch, "registry.json"),
      workingSession: {
        cookie: "cookie-XYZ",
        prefsKey: "session-12345",
        endpoint: "https://x.test/v1",
      },
    });

    const result = (await getSelectTool().handler(
      { projectDir, endpoint: "https://x.test/v1" },
      ctx
    )) as Record<string, any>;

    expect(result.hasSessionCookie).toBe(true);
    expect(result.hasApiKey).toBe(false);
    expect(result.authPinned.method).toBe("session");
    expect(result.authPinned.source).toBe("prefs-probe");
    expect(result.authPinned.prefsKey).toBe("session-12345");
    expect(result.warning).toBeNull();

    // Registry now carries the prefsKey too.
    const entry = await ctx.projectRegistry.get("proj-app1");
    expect(entry?.prefsKey).toBe("session-12345");
  });

  test("with no working prefs session: still binds, but surfaces a warning", async () => {
    const projectDir = await makeProjectDir(scratch, "App2", "proj-app2");
    const ctx = buildContext({
      configDir: scratch,
      registryPath: join(scratch, "registry.json"),
      workingSession: undefined,
    });

    const result = (await getSelectTool().handler(
      { projectDir, endpoint: "https://y.test/v1" },
      ctx
    )) as Record<string, any>;

    expect(result.active).toBe(true);
    expect(result.hasSessionCookie).toBe(false);
    expect(result.hasApiKey).toBe(false);
    expect(result.authPinned.method).toBe("none");
    expect(result.authPinned.source).toBe("none");
    expect(typeof result.warning).toBe("string");
    expect(result.warning).toMatch(/no working credentials/i);
    expect(result.warning).toContain("proj-app2");

    // Registry still gets the dir, just no prefsKey.
    const entry = await ctx.projectRegistry.get("proj-app2");
    expect(entry?.projectDir).toBe(projectDir);
    expect(entry?.prefsKey).toBeUndefined();
  });

  test("caller-supplied apiKey wins over any prefs probe", async () => {
    const projectDir = await makeProjectDir(scratch, "App3", "proj-app3");
    const ctx = buildContext({
      configDir: scratch,
      registryPath: join(scratch, "registry.json"),
      workingSession: {
        cookie: "cookie-from-probe",
        prefsKey: "should-be-ignored",
        endpoint: "https://z.test/v1",
      },
    });

    const result = (await getSelectTool().handler(
      {
        projectDir,
        endpoint: "https://z.test/v1",
        apiKey: "standard_abc",
      },
      ctx
    )) as Record<string, any>;

    expect(result.hasApiKey).toBe(true);
    expect(result.hasSessionCookie).toBe(false);
    expect(result.authPinned.source).toBe("caller-args");
    expect(result.authPinned.prefsKey).toBeNull();
  });

  test("select-by-projectId after a prior dir-select: rehydrates dir + prefsKey from registry", async () => {
    const projectDir = await makeProjectDir(scratch, "RehydrateApp", "proj-rehydrate");
    const registryPath = join(scratch, "registry.json");

    // First selection: by dir + working session — populates registry with prefsKey.
    const ctx1 = buildContext({
      configDir: scratch,
      registryPath,
      workingSession: {
        cookie: "cookie-rehydrate",
        prefsKey: "session-rehydrate",
        endpoint: "https://a.test/v1",
      },
    });
    await getSelectTool().handler(
      { projectDir, endpoint: "https://a.test/v1" },
      ctx1
    );

    // Second selection (fresh MCP): only projectId. The cached prefsKey
    // should drive a probe-cache hit; isSessionWorking returns true.
    const ctx2 = buildContext({
      configDir: scratch,
      registryPath,
      // No fallback findWorkingSession needed — cache should hit first.
      workingSession: undefined,
      prefs: {
        "session-rehydrate": { cookie: "cookie-rehydrate", endpoint: "https://a.test/v1" },
      },
      isSessionWorking: () => true,
    });

    const result = (await getSelectTool().handler(
      { projectId: "proj-rehydrate", endpoint: "https://a.test/v1" },
      ctx2
    )) as Record<string, any>;

    expect(result.projectDir).toBe(projectDir);
    expect(result.authPinned.method).toBe("session");
    expect(result.authPinned.source).toBe("prefs-cache");
    expect(result.authPinned.prefsKey).toBe("session-rehydrate");
  });
});
