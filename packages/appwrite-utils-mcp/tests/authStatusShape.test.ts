import { describe, expect, test } from "bun:test";

import { AuthResolver } from "../src/auth/AuthResolver.js";
import { configToolGroup } from "../src/tools/config/index.js";

function getAuthStatusTool() {
  const tool = configToolGroup.tools.find((t) => t.name === "get_auth_status");
  if (!tool) throw new Error("get_auth_status tool not registered");
  return tool;
}

/**
 * Build a context whose AuthResolver resolves to a deterministic identity,
 * so the test focuses on the SHAPE of get_auth_status output (not on the
 * full resolver tier resolution).
 */
function buildContext(opts: {
  resolveResult?: {
    endpoint: string;
    projectId: string;
    authMethod: "session" | "apikey";
    source: string;
  };
  resolveError?: string;
  override?: { projectId: string; projectDir?: string; endpoint?: string };
}): any {
  const resolver = new AuthResolver({});
  if (opts.override) {
    resolver.setOverride({
      projectId: opts.override.projectId,
      projectDir: opts.override.projectDir,
      endpoint: opts.override.endpoint,
    });
  }

  // Stub resolve() so we don't actually hit prefs.json.
  (resolver as unknown as { resolve: () => Promise<any> }).resolve = async () => {
    if (opts.resolveError) throw new Error(opts.resolveError);
    if (!opts.resolveResult) throw new Error("test stub: no resolveResult");
    return {
      credentials: {
        endpoint: opts.resolveResult.endpoint,
        projectId: opts.resolveResult.projectId,
        authMethod: opts.resolveResult.authMethod,
      },
      source: opts.resolveResult.source,
    };
  };

  // Stub getProjectConfig so the slim view's configSource is deterministic.
  (resolver as unknown as { getProjectConfig: () => Promise<any> }).getProjectConfig =
    async () => null;

  return { authResolver: resolver };
}

describe("get_auth_status — slim default shape", () => {
  test("default response has exactly the 9 slim keys", async () => {
    const ctx = buildContext({
      resolveResult: {
        endpoint: "https://x.test/v1",
        projectId: "proj-1",
        authMethod: "session",
        source: "session-override",
      },
      override: { projectId: "proj-1", projectDir: "/my/dir" },
    });

    const result = (await getAuthStatusTool().handler({}, ctx)) as Record<string, unknown>;

    expect(Object.keys(result).sort()).toEqual(
      [
        "authMethod",
        "authenticated",
        "configSource",
        "endpoint",
        "projectDir",
        "projectId",
        "resolveError",
        "source",
        "warnings",
      ].sort()
    );

    expect(result.authenticated).toBe(true);
    expect(result.authMethod).toBe("session");
    expect(result.endpoint).toBe("https://x.test/v1");
    expect(result.projectId).toBe("proj-1");
    expect(result.projectDir).toBe("/my/dir");
    expect(result.source).toBe("session-override");
    expect(result.warnings).toEqual([]);
    expect(result.resolveError).toBeNull();

    // No raw resolver-state blocks in the slim default.
    expect("serverDefaults" in result).toBe(false);
    expect("cwdProject" in result).toBe(false);
    expect("sessionOverride" in result).toBe(false);
    expect("effectiveConfigDir" in result).toBe(false);
    expect("diagnostics" in result).toBe(false);
  });

  test("includeDiagnostics: true reattaches the dropped blocks under a single key", async () => {
    const ctx = buildContext({
      resolveResult: {
        endpoint: "https://x.test/v1",
        projectId: "proj-1",
        authMethod: "apikey",
        source: "server-defaults",
      },
      override: { projectId: "proj-1" },
    });

    const result = (await getAuthStatusTool().handler(
      { includeDiagnostics: true },
      ctx
    )) as Record<string, any>;

    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics).toHaveProperty("serverDefaults");
    expect(result.diagnostics).toHaveProperty("cwdProject");
    expect(result.diagnostics).toHaveProperty("sessionOverride");
    expect(result.diagnostics).toHaveProperty("effectiveConfigDir");

    expect(result.diagnostics.sessionOverride.projectId).toBe("proj-1");

    // Slim fields are still present at the top level.
    expect(result.projectId).toBe("proj-1");
  });

  test("resolveError surfaces when resolve() throws; slim fields still present", async () => {
    const ctx = buildContext({
      resolveError: "no candidate credentials available",
    });

    const result = (await getAuthStatusTool().handler({}, ctx)) as Record<string, unknown>;
    expect(result.authenticated).toBe(false);
    expect(result.authMethod).toBe("none");
    expect(result.endpoint).toBeNull();
    expect(result.projectId).toBeNull();
    expect(result.source).toBeNull();
    expect(result.resolveError).toBe("no candidate credentials available");
    expect(result.warnings).toEqual([]);
  });
});
