import { describe, expect, test } from "bun:test";
import { resolveCliCredentials } from "../src/cli/resolveCliCredentials.js";

// Plan tests #12-16: per-field precedence argv > APPWRITE_* env > sidecar.auth.
describe("resolveCliCredentials precedence", () => {
  test("#12 — argv beats env beats sidecar", () => {
    const result = resolveCliCredentials({
      argv: { endpoint: "argv-endpoint", projectId: "argv-project", apiKey: "argv-key" },
      sidecarAuth: {
        endpoint: "sidecar-endpoint",
        projectId: "sidecar-project",
        apiKey: "sidecar-key",
      },
      env: {
        APPWRITE_ENDPOINT: "env-endpoint",
        APPWRITE_PROJECT_ID: "env-project",
        APPWRITE_API_KEY: "env-key",
      },
    });

    expect(result).toEqual({
      endpoint: "argv-endpoint",
      projectId: "argv-project",
      apiKey: "argv-key",
    });
  });

  test("#13 — env beats sidecar when argv missing", () => {
    const result = resolveCliCredentials({
      argv: {},
      sidecarAuth: {
        endpoint: "sidecar-endpoint",
        projectId: "sidecar-project",
        apiKey: "sidecar-key",
      },
      env: {
        APPWRITE_ENDPOINT: "env-endpoint",
        APPWRITE_PROJECT_ID: "env-project",
        APPWRITE_API_KEY: "env-key",
      },
    });

    expect(result).toEqual({
      endpoint: "env-endpoint",
      projectId: "env-project",
      apiKey: "env-key",
    });
  });

  test("#14 — sidecar fills gaps left by argv/env", () => {
    const result = resolveCliCredentials({
      argv: { endpoint: "argv-endpoint" },
      sidecarAuth: {
        endpoint: "sidecar-endpoint",
        projectId: "sidecar-project",
        apiKey: "sidecar-key",
      },
      env: { APPWRITE_PROJECT_ID: "env-project" },
    });

    expect(result).toEqual({
      endpoint: "argv-endpoint",
      projectId: "env-project",
      apiKey: "sidecar-key",
    });
  });

  test("#15 — sidecar alone is sufficient", () => {
    const result = resolveCliCredentials({
      argv: {},
      sidecarAuth: {
        endpoint: "sidecar-endpoint",
        projectId: "sidecar-project",
        apiKey: "sidecar-key",
      },
      env: {},
    });

    expect(result).toEqual({
      endpoint: "sidecar-endpoint",
      projectId: "sidecar-project",
      apiKey: "sidecar-key",
    });
  });

  test("#16 — nothing → undefined", () => {
    expect(resolveCliCredentials({ argv: {}, sidecarAuth: {}, env: {} })).toBeUndefined();
    expect(resolveCliCredentials({ env: {} })).toBeUndefined();
  });

  test("empty-string argv does NOT clobber env/sidecar", () => {
    const result = resolveCliCredentials({
      argv: { endpoint: "", projectId: "", apiKey: "" },
      sidecarAuth: { endpoint: "sidecar-endpoint", projectId: "sidecar-project" },
      env: { APPWRITE_API_KEY: "env-key" },
    });

    expect(result).toEqual({
      endpoint: "sidecar-endpoint",
      projectId: "sidecar-project",
      apiKey: "env-key",
    });
  });

  test("apiKey is omitted from result when unresolved (rather than set to undefined)", () => {
    const result = resolveCliCredentials({
      argv: { endpoint: "e", projectId: "p" },
      env: {},
    });
    expect(result).toEqual({ endpoint: "e", projectId: "p" });
    expect("apiKey" in (result ?? {})).toBe(false);
  });

  test("missing endpoint OR projectId returns undefined even if apiKey resolves", () => {
    expect(
      resolveCliCredentials({
        argv: { apiKey: "k" },
        env: { APPWRITE_ENDPOINT: "e" }, // no projectId
      })
    ).toBeUndefined();

    expect(
      resolveCliCredentials({
        argv: { apiKey: "k" },
        env: { APPWRITE_PROJECT_ID: "p" }, // no endpoint
      })
    ).toBeUndefined();
  });
});
