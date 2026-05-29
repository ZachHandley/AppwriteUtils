import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ProjectRegistry } from "../src/state/ProjectRegistry.js";
import { AuthResolver } from "../src/auth/AuthResolver.js";

let scratch: string;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "appwrite-mcp-projsel-"));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe("ProjectRegistry", () => {
  test("set / get / list round-trip and persist to disk", async () => {
    const file = join(scratch, "projects.json");
    const reg = new ProjectRegistry(file);

    await reg.set("proj-abc", { projectDir: "/tmp/proj-abc", endpoint: "https://x.test/v1" });
    await reg.set("proj-xyz", { projectDir: "/tmp/proj-xyz" });

    const a = await reg.get("proj-abc");
    expect(a?.projectDir).toBe("/tmp/proj-abc");
    expect(a?.endpoint).toBe("https://x.test/v1");
    expect(typeof a?.lastSelectedAt).toBe("string");

    const items = await reg.list();
    expect(items.map((e) => e.projectId).sort()).toEqual(["proj-abc", "proj-xyz"]);

    // Fresh instance reads the same on-disk file.
    const reg2 = new ProjectRegistry(file);
    const aAgain = await reg2.get("proj-abc");
    expect(aAgain?.projectDir).toBe("/tmp/proj-abc");
  });

  test("remove deletes an entry and persists", async () => {
    const file = join(scratch, "projects.json");
    const reg = new ProjectRegistry(file);

    await reg.set("p1", { projectDir: "/tmp/p1" });
    expect(await reg.remove("p1")).toBe(true);
    expect(await reg.get("p1")).toBeNull();

    // Remove of unknown is a no-op (false), not an error.
    expect(await reg.remove("never-existed")).toBe(false);
  });

  test("tolerates a missing file (empty snapshot)", async () => {
    const reg = new ProjectRegistry(join(scratch, "does-not-exist.json"));
    expect(await reg.list()).toEqual([]);
    expect(await reg.get("anything")).toBeNull();
  });

  test("tolerates a corrupt file (treated as empty)", async () => {
    const file = join(scratch, "corrupt.json");
    await writeFile(file, "not json {{{", "utf-8");
    const reg = new ProjectRegistry(file);
    expect(await reg.list()).toEqual([]);
  });

  test("normalize drops entries missing projectDir", async () => {
    const file = join(scratch, "partial.json");
    await writeFile(
      file,
      JSON.stringify({
        good: { projectDir: "/tmp/good", lastSelectedAt: "2025-01-01T00:00:00.000Z" },
        bad: { endpoint: "https://x.test/v1" },
      }),
      "utf-8"
    );
    const reg = new ProjectRegistry(file);
    expect((await reg.list()).map((e) => e.projectId)).toEqual(["good"]);
  });

  test("on-disk file is the same JSON we wrote", async () => {
    const file = join(scratch, "projects.json");
    const reg = new ProjectRegistry(file);
    await reg.set("p1", { projectDir: "/tmp/p1", endpoint: "https://x.test/v1" });
    const raw = await readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, { projectDir?: string }>;
    expect(parsed["p1"]?.projectDir).toBe("/tmp/p1");
  });
});

describe("AuthResolver projectDir override", () => {
  test("getEffectiveConfigDir prefers override.projectDir over server-default configDir", () => {
    const resolver = new AuthResolver({ configDir: "/server/default" });
    expect(resolver.getEffectiveConfigDir()).toBe("/server/default");

    resolver.setOverride({
      projectId: "proj-1",
      projectDir: "/override/dir",
    });
    expect(resolver.getEffectiveConfigDir()).toBe("/override/dir");

    resolver.clearOverride();
    expect(resolver.getEffectiveConfigDir()).toBe("/server/default");
  });

  test("override carries projectDir through getOverride()", () => {
    const resolver = new AuthResolver({});
    resolver.setOverride({
      projectId: "proj-1",
      projectDir: "/some/dir",
      endpoint: "https://x.test/v1",
    });
    const ov = resolver.getOverride();
    expect(ov?.projectId).toBe("proj-1");
    expect(ov?.projectDir).toBe("/some/dir");
    expect(ov?.endpoint).toBe("https://x.test/v1");
  });

  test("setOverride resets the project-config cache so getProjectConfig re-resolves under the new dir", async () => {
    // Two real fake project dirs, each with its own appwrite.json that
    // declares a different projectId. We then bind the resolver to one,
    // observe the projectId, switch to the other, and confirm getProjectConfig
    // now returns the second project's ID.
    const projA = join(scratch, "projA");
    const projB = join(scratch, "projB");
    await import("node:fs/promises").then((fs) =>
      Promise.all([
        fs.mkdir(projA, { recursive: true }),
        fs.mkdir(projB, { recursive: true }),
      ])
    );
    await writeFile(
      join(projA, "appwrite.json"),
      JSON.stringify({ projectId: "id-A" }),
      "utf-8"
    );
    await writeFile(
      join(projB, "appwrite.json"),
      JSON.stringify({ projectId: "id-B" }),
      "utf-8"
    );

    const resolver = new AuthResolver({ configDir: projA });
    const cfgA = await resolver.getProjectConfig();
    expect(cfgA?.projectId).toBe("id-A");

    // Without the cache reset this would still return id-A; the test asserts
    // that setOverride invalidates the cache so the new dir wins.
    resolver.setOverride({ projectId: "id-B", projectDir: projB });
    const cfgB = await resolver.getProjectConfig();
    expect(cfgB?.projectId).toBe("id-B");

    resolver.clearOverride();
    const cfgAAgain = await resolver.getProjectConfig();
    expect(cfgAAgain?.projectId).toBe("id-A");
  });
});
