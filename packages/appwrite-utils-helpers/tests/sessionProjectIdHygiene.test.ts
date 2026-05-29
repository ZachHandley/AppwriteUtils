import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";

import { loadYamlConfig, writeYamlConfig } from "../src/config/yamlConfig.js";

/**
 * Regression coverage for the `sessionProjectId` removal:
 *
 *  - existing user YAMLs that still carry a `sessionProjectId` field (written
 *    by an older release of this package) must still parse cleanly — Zod
 *    strips unknown keys by default, so loading just silently drops it
 *  - `writeYamlConfig` MUST NOT re-emit the field even if it survived round-trip
 *    via some other path (we want it gone next time the file is written)
 */

let scratch: string;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "appwrite-mcp-sessionhygiene-"));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

const yamlWithStraySessionProjectId = `
appwrite:
  endpoint: https://x.test/v1
  project: real-project-id
  key: standard_realkey
  authMethod: auto
  sessionProjectId: stale-prefs-key
logging:
  enabled: false
  level: info
backups:
  enabled: true
  interval: 3600
  retention: 30
  cleanup: true
data:
  enableMockData: false
  documentBucketId: documents
  usersCollectionName: Members
  importDirectory: importData
appwriteCollections: []
appwriteTables: []
functions: []
sites: []
buckets: []
teams: []
extension:
  enabled: false
`;

describe("sessionProjectId hygiene", () => {
  test("loadYamlConfig tolerates a stray sessionProjectId without crashing", async () => {
    const path = join(scratch, "appwrite-config.yaml");
    await writeFile(path, yamlWithStraySessionProjectId, "utf-8");

    const config = await loadYamlConfig(path);
    expect(config).not.toBeNull();
    expect(config!.appwriteProject).toBe("real-project-id");
    // Zod-stripped — the field never makes it onto the loaded config.
    expect((config as any).sessionProjectId).toBeUndefined();
  });

  test("writeYamlConfig does NOT emit sessionProjectId even when injected onto the config object", async () => {
    const path = join(scratch, "appwrite-config.yaml");
    await writeFile(path, yamlWithStraySessionProjectId, "utf-8");

    const config = await loadYamlConfig(path);
    expect(config).not.toBeNull();

    // Simulate an older code path that sneaks the field back in.
    (config as any).sessionProjectId = "should-never-be-written";

    await writeYamlConfig(path, config!);
    const raw = await readFile(path, "utf-8");
    const parsed = yaml.load(raw) as { appwrite?: Record<string, unknown> };
    expect(parsed.appwrite).toBeDefined();
    expect("sessionProjectId" in (parsed.appwrite ?? {})).toBe(false);
  });
});
