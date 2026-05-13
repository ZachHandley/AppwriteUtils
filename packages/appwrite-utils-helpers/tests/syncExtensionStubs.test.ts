import { describe, expect, test } from "bun:test";
import { syncExtensionStubsFromOfficial } from "../src/cli/configBridge.js";
import type {
  AppwriteOfficialConfig,
  AppwriteUtilsExtension,
} from "appwrite-utils";

function makeOfficial(
  partial: Partial<AppwriteOfficialConfig>
): AppwriteOfficialConfig {
  return {
    projectId: "test-project",
    ...partial,
  } as AppwriteOfficialConfig;
}

function makeExt(
  partial: Partial<AppwriteUtilsExtension> = {}
): AppwriteUtilsExtension {
  return {
    apiMode: "auto",
    enableBackups: true,
    backupInterval: 3600,
    backupRetention: 30,
    enableBackupCleanup: true,
    enableMockData: false,
    documentBucketId: "documents",
    usersCollectionName: "Members",
    ...partial,
  } as AppwriteUtilsExtension;
}

describe("syncExtensionStubsFromOfficial", () => {
  test("adds stubs for $ids missing from ext.extensions", () => {
    const official = makeOfficial({
      functions: [
        { $id: "fn-a", name: "A", runtime: "node-22" },
        { $id: "fn-b", name: "B", runtime: "node-22" },
      ],
      sites: [{ $id: "site-1", name: "Site 1" }],
    });
    const ext = makeExt();

    const result = syncExtensionStubsFromOfficial(ext, official);

    expect(result.added.sort()).toEqual(
      ["functions:fn-a", "functions:fn-b", "sites:site-1"].sort()
    );
    expect(result.orphaned).toEqual([]);
    expect(result.ext.extensions).toEqual({
      functions: { "fn-a": {}, "fn-b": {} },
      sites: { "site-1": {} },
    });
  });

  test("returns input unchanged when nothing to add", () => {
    const official = makeOfficial({
      functions: [{ $id: "fn-a", name: "A", runtime: "node-22" }],
    });
    const ext = makeExt({
      extensions: { functions: { "fn-a": { deployDir: "./fn-a" } } },
    });

    const result = syncExtensionStubsFromOfficial(ext, official);

    expect(result.added).toEqual([]);
    expect(result.orphaned).toEqual([]);
    expect(result.ext).toBe(ext);
  });

  test("preserves existing extension content when stubbing siblings", () => {
    const official = makeOfficial({
      functions: [
        { $id: "fn-a", name: "A", runtime: "node-22" },
        { $id: "fn-b", name: "B", runtime: "node-22" },
      ],
    });
    const ext = makeExt({
      extensions: {
        functions: { "fn-a": { deployDir: "./fn-a", ignore: "node_modules" } },
      },
    });

    const result = syncExtensionStubsFromOfficial(ext, official);

    expect(result.added).toEqual(["functions:fn-b"]);
    expect(result.ext.extensions?.functions).toEqual({
      "fn-a": { deployDir: "./fn-a", ignore: "node_modules" },
      "fn-b": {},
    });
  });

  test("reports orphans without deleting them", () => {
    const official = makeOfficial({
      functions: [{ $id: "fn-a", name: "A", runtime: "node-22" }],
    });
    const ext = makeExt({
      extensions: {
        functions: {
          "fn-a": { deployDir: "./fn-a" },
          "fn-gone": { deployDir: "./fn-gone" },
        },
      },
    });

    const result = syncExtensionStubsFromOfficial(ext, official);

    expect(result.added).toEqual([]);
    expect(result.orphaned).toEqual(["functions:fn-gone"]);
    expect(result.ext.extensions?.functions).toEqual({
      "fn-a": { deployDir: "./fn-a" },
      "fn-gone": { deployDir: "./fn-gone" },
    });
  });

  test("skips path-mode resources (string-typed extension entries)", () => {
    const official = makeOfficial({
      functions: [
        { $id: "fn-a", name: "A", runtime: "node-22" },
        { $id: "fn-b", name: "B", runtime: "node-22" },
      ],
    });
    const ext = makeExt({
      extensions: { functions: "./functions-ext.yaml" },
    });

    const result = syncExtensionStubsFromOfficial(ext, official);

    expect(result.added).toEqual([]);
    expect(result.orphaned).toEqual([]);
    // ext.extensions.functions stays a string — untouched.
    expect(result.ext.extensions?.functions).toBe("./functions-ext.yaml");
  });

  test("handles every supported resource type", () => {
    const official = makeOfficial({
      functions: [{ $id: "fn1", name: "F", runtime: "node-22" }],
      sites: [{ $id: "s1", name: "S" }],
      buckets: [{ $id: "b1", name: "B" }],
      collections: [{ $id: "c1", databaseId: "d1", name: "C" }],
      tablesDB: [{ $id: "d1", name: "DB" }],
      tables: [{ $id: "t1", databaseId: "d1", name: "T" }],
      teams: [{ $id: "tm1", name: "T1" }],
      webhooks: [{ $id: "w1", name: "W", url: "https://x", events: [] }],
      topics: [{ $id: "tp1", name: "TP" }],
      messages: [{ $id: "m1", name: "M" }],
    });
    const ext = makeExt();

    const result = syncExtensionStubsFromOfficial(ext, official);

    expect(result.added.sort()).toEqual(
      [
        "buckets:b1",
        "collections:c1",
        "functions:fn1",
        "messages:m1",
        "sites:s1",
        "tables:t1",
        "tablesDB:d1",
        "teams:tm1",
        "topics:tp1",
        "webhooks:w1",
      ].sort()
    );
  });

  test("no-op when official has empty resource arrays", () => {
    const official = makeOfficial({ functions: [], sites: [] });
    const ext = makeExt();

    const result = syncExtensionStubsFromOfficial(ext, official);

    expect(result.added).toEqual([]);
    expect(result.orphaned).toEqual([]);
    expect(result.ext).toBe(ext);
  });
});
