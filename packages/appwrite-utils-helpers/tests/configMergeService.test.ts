import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { ConfigMergeService } from "../src/config/services/ConfigMergeService.js";
import type { AppwriteConfig } from "appwrite-utils";

// Snapshot the env vars we mutate so we don't pollute the wider test run.
const ENV_KEYS = [
  "APPWRITE_ENDPOINT",
  "APPWRITE_PROJECT_ID",
  "APPWRITE_PROJECT",
  "APPWRITE_API_KEY",
  "APPWRITE_SESSION_COOKIE",
] as const;

const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
});

function baseConfig(): AppwriteConfig {
  // Minimal — the merge service only touches the four credential fields.
  return {
    appwriteEndpoint: "",
    appwriteProject: "",
  } as unknown as AppwriteConfig;
}

describe("ConfigMergeService.mergeEnvironmentVariables — env-var parity", () => {
  test("#20 — APPWRITE_PROJECT_ID alone resolves into the merged config", () => {
    process.env.APPWRITE_PROJECT_ID = "proj-id-only";

    const service = new ConfigMergeService();
    const merged = service.mergeEnvironmentVariables(baseConfig());

    expect(merged.appwriteProject).toBe("proj-id-only");
  });

  test("#21 — APPWRITE_PROJECT alone resolves (backcompat alias)", () => {
    process.env.APPWRITE_PROJECT = "proj-legacy-only";

    const service = new ConfigMergeService();
    const merged = service.mergeEnvironmentVariables(baseConfig());

    expect(merged.appwriteProject).toBe("proj-legacy-only");
  });

  test("#22 — both set: APPWRITE_PROJECT_ID wins on conflict", () => {
    process.env.APPWRITE_PROJECT_ID = "winner-id";
    process.env.APPWRITE_PROJECT = "loser-legacy";

    const service = new ConfigMergeService();
    const merged = service.mergeEnvironmentVariables(baseConfig());

    expect(merged.appwriteProject).toBe("winner-id");
  });

  test("env values do NOT overwrite already-set config fields (env is lowest priority)", () => {
    process.env.APPWRITE_PROJECT_ID = "env-project";
    process.env.APPWRITE_API_KEY = "env-key";

    const cfg = baseConfig();
    cfg.appwriteProject = "file-project";

    const merged = new ConfigMergeService().mergeEnvironmentVariables(cfg);

    expect(merged.appwriteProject).toBe("file-project");
    expect(merged.appwriteKey).toBe("env-key");
  });

  test("merging is non-mutating", () => {
    process.env.APPWRITE_PROJECT_ID = "env-project";

    const cfg = baseConfig();
    const merged = new ConfigMergeService().mergeEnvironmentVariables(cfg);

    expect(merged).not.toBe(cfg);
    expect(cfg.appwriteProject).toBe("");
  });
});
