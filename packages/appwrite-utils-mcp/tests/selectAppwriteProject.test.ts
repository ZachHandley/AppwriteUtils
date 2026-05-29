import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AuthResolver } from "../src/auth/AuthResolver.js";
import { ProjectRegistry } from "../src/state/ProjectRegistry.js";
import { metaToolGroup } from "../src/tools/meta/index.js";

let scratch: string;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "appwrite-mcp-select-"));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

function getSelectTool() {
  const tool = metaToolGroup.tools.find((t) => t.name === "select_appwrite_project");
  if (!tool) throw new Error("select_appwrite_project tool not registered");
  return tool;
}

function buildContext(opts: { configDir?: string; registryPath: string }): any {
  const authResolver = new AuthResolver({ configDir: opts.configDir });
  const projectRegistry = new ProjectRegistry(opts.registryPath);
  let invalidateCount = 0;
  const clientRegistry = {
    invalidate: () => {
      invalidateCount++;
    },
    getInvalidateCount: () => invalidateCount,
  };
  return {
    authResolver,
    clientRegistry,
    projectRegistry,
    stateManager: {} as any,
  };
}

describe("select_appwrite_project handler", () => {
  test("with only projectDir: discovers projectId, sets override, persists registry", async () => {
    const projectDir = join(scratch, "MyApp");
    await mkdir(projectDir, { recursive: true });
    await writeFile(
      join(projectDir, "appwrite.json"),
      JSON.stringify({ projectId: "myapp-id" }),
      "utf-8"
    );

    const ctx = buildContext({
      configDir: scratch,
      registryPath: join(scratch, "registry.json"),
    });

    const select = getSelectTool();
    const result = (await select.handler({ projectDir }, ctx)) as Record<string, unknown>;

    expect(result.active).toBe(true);
    expect(result.projectId).toBe("myapp-id");
    expect(result.projectDir).toBe(projectDir);
    expect(result.registryWritten).toBe(true);
    expect(typeof result.configSource).toBe("string");

    const override = ctx.authResolver.getOverride();
    expect(override?.projectId).toBe("myapp-id");
    expect(override?.projectDir).toBe(projectDir);

    expect(ctx.authResolver.getEffectiveConfigDir()).toBe(projectDir);
    expect(ctx.clientRegistry.getInvalidateCount()).toBe(1);

    // Registry persisted on disk.
    const entry = await ctx.projectRegistry.get("myapp-id");
    expect(entry?.projectDir).toBe(projectDir);
  });

  test("with only projectId after prior selection: rehydrates projectDir from registry", async () => {
    const projectDir = join(scratch, "RehydrateApp");
    await mkdir(projectDir, { recursive: true });
    await writeFile(
      join(projectDir, "appwrite.json"),
      JSON.stringify({ projectId: "rehydrate-id" }),
      "utf-8"
    );

    const registryPath = join(scratch, "registry.json");

    // First selection: by dir, populates registry.
    const ctx1 = buildContext({ configDir: scratch, registryPath });
    await getSelectTool().handler({ projectDir }, ctx1);

    // Second selection: fresh context (simulates MCP restart), only projectId
    // — the dir must come back from the registry on disk.
    const ctx2 = buildContext({ configDir: scratch, registryPath });
    const result = (await getSelectTool().handler(
      { projectId: "rehydrate-id" },
      ctx2
    )) as Record<string, unknown>;

    expect(result.projectId).toBe("rehydrate-id");
    expect(result.projectDir).toBe(projectDir);
    expect(ctx2.authResolver.getEffectiveConfigDir()).toBe(projectDir);
  });

  test("with projectDir lacking a config and no projectId: throws", async () => {
    const emptyDir = join(scratch, "EmptyApp");
    await mkdir(emptyDir, { recursive: true });

    const ctx = buildContext({
      configDir: scratch,
      registryPath: join(scratch, "registry.json"),
    });

    await expect(getSelectTool().handler({ projectDir: emptyDir }, ctx)).rejects.toThrow(
      /No Appwrite config/
    );
  });

  test("with projectDir that does not exist: throws fast", async () => {
    const ctx = buildContext({
      configDir: scratch,
      registryPath: join(scratch, "registry.json"),
    });
    await expect(
      getSelectTool().handler({ projectDir: join(scratch, "nope-never") }, ctx)
    ).rejects.toThrow(/projectDir does not exist/);
  });

  test("caller-supplied projectId wins over the discovered one", async () => {
    const projectDir = join(scratch, "ConflictApp");
    await mkdir(projectDir, { recursive: true });
    await writeFile(
      join(projectDir, "appwrite.json"),
      JSON.stringify({ projectId: "discovered-id" }),
      "utf-8"
    );

    const ctx = buildContext({
      configDir: scratch,
      registryPath: join(scratch, "registry.json"),
    });

    const result = (await getSelectTool().handler(
      { projectDir, projectId: "caller-id" },
      ctx
    )) as Record<string, unknown>;

    expect(result.projectId).toBe("caller-id");
    // Registry still maps caller-supplied id -> the chosen dir.
    const entry = await ctx.projectRegistry.get("caller-id");
    expect(entry?.projectDir).toBe(projectDir);
  });

  test("with neither projectId nor projectDir: zod rejects", async () => {
    const ctx = buildContext({
      configDir: scratch,
      registryPath: join(scratch, "registry.json"),
    });
    await expect(getSelectTool().handler({}, ctx)).rejects.toThrow();
  });
});
