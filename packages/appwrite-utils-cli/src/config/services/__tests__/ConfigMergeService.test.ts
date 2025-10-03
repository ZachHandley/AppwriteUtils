import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { ConfigMergeService } from "../ConfigMergeService.js";
import type { ConfigOverrides } from "../ConfigMergeService.js";
import type { AppwriteConfig } from "appwrite-utils";
import type { SessionAuthInfo } from "../SessionAuthService.js";

describe("ConfigMergeService", () => {
  let service: ConfigMergeService;
  let baseConfig: AppwriteConfig;
  let sessionInfo: SessionAuthInfo;

  // Store original env vars
  const originalEnv = { ...process.env };

  beforeEach(() => {
    service = new ConfigMergeService();

    baseConfig = {
      appwriteEndpoint: "https://cloud.appwrite.io/v1",
      appwriteProject: "test-project",
      appwriteKey: "test-api-key",
      databases: [],
      buckets: [],
      functions: [],
    } as unknown as AppwriteConfig;

    sessionInfo = {
      projectId: "test-project",
      endpoint: "https://cloud.appwrite.io/v1",
      cookie: "eyJhbGc.test.cookie",
      email: "test@example.com",
    };
  });

  afterEach(() => {
    // Restore original env vars
    process.env = { ...originalEnv };
  });

  describe("mergeSession", () => {
    it("should merge session cookie into config", () => {
      const result = service.mergeSession(baseConfig, sessionInfo);

      expect(result.sessionCookie).toBe("eyJhbGc.test.cookie");
      expect(result.authMethod).toBe("session");
    });

    it("should not mutate original config", () => {
      const original = { ...baseConfig };
      service.mergeSession(baseConfig, sessionInfo);

      expect(baseConfig).toEqual(original);
    });

    it("should preserve all existing config properties", () => {
      const result = service.mergeSession(baseConfig, sessionInfo);

      expect(result.appwriteEndpoint).toBe(baseConfig.appwriteEndpoint);
      expect(result.appwriteProject).toBe(baseConfig.appwriteProject);
      expect(result.appwriteKey).toBe(baseConfig.appwriteKey);
    });
  });

  describe("applyOverrides", () => {
    it("should apply all provided overrides", () => {
      const overrides: ConfigOverrides = {
        appwriteEndpoint: "https://custom.appwrite.io/v1",
        appwriteProject: "override-project",
        appwriteKey: "override-key",
        sessionCookie: "override-cookie",
        authMethod: "apikey",
      };

      const result = service.applyOverrides(baseConfig, overrides);

      expect(result.appwriteEndpoint).toBe("https://custom.appwrite.io/v1");
      expect(result.appwriteProject).toBe("override-project");
      expect(result.appwriteKey).toBe("override-key");
      expect(result.sessionCookie).toBe("override-cookie");
      expect(result.authMethod).toBe("apikey");
    });

    it("should skip undefined and null values", () => {
      const overrides: ConfigOverrides = {
        appwriteEndpoint: undefined,
        appwriteProject: null as any,
        appwriteKey: "new-key",
      };

      const result = service.applyOverrides(baseConfig, overrides);

      expect(result.appwriteEndpoint).toBe(baseConfig.appwriteEndpoint);
      expect(result.appwriteProject).toBe(baseConfig.appwriteProject);
      expect(result.appwriteKey).toBe("new-key");
    });

    it("should not mutate original config", () => {
      const original = { ...baseConfig };
      const overrides: ConfigOverrides = {
        appwriteEndpoint: "https://custom.appwrite.io/v1",
      };

      service.applyOverrides(baseConfig, overrides);

      expect(baseConfig).toEqual(original);
    });
  });

  describe("mergeEnvironmentVariables", () => {
    it("should merge environment variables when config values are not set", () => {
      process.env.APPWRITE_ENDPOINT = "https://env.appwrite.io/v1";
      process.env.APPWRITE_PROJECT = "env-project";
      process.env.APPWRITE_API_KEY = "env-api-key";
      process.env.APPWRITE_SESSION_COOKIE = "env-cookie";

      const emptyConfig = {
        databases: [],
        buckets: [],
        functions: [],
      } as unknown as AppwriteConfig;

      const result = service.mergeEnvironmentVariables(emptyConfig);

      expect(result.appwriteEndpoint).toBe("https://env.appwrite.io/v1");
      expect(result.appwriteProject).toBe("env-project");
      expect(result.appwriteKey).toBe("env-api-key");
      expect(result.sessionCookie).toBe("env-cookie");
    });

    it("should not override existing config values", () => {
      process.env.APPWRITE_ENDPOINT = "https://env.appwrite.io/v1";
      process.env.APPWRITE_PROJECT = "env-project";

      const result = service.mergeEnvironmentVariables(baseConfig);

      expect(result.appwriteEndpoint).toBe(baseConfig.appwriteEndpoint);
      expect(result.appwriteProject).toBe(baseConfig.appwriteProject);
    });

    it("should ignore empty environment variables", () => {
      process.env.APPWRITE_ENDPOINT = "";
      process.env.APPWRITE_PROJECT = "";

      const emptyConfig = {
        databases: [],
        buckets: [],
        functions: [],
      } as unknown as AppwriteConfig;

      const result = service.mergeEnvironmentVariables(emptyConfig);

      expect(result.appwriteEndpoint).toBeUndefined();
      expect(result.appwriteProject).toBeUndefined();
    });
  });

  describe("mergeSources", () => {
    it("should merge multiple sources in priority order", () => {
      const source1 = {
        appwriteEndpoint: "https://source1.appwrite.io/v1",
        appwriteProject: "source1-project",
      };

      const source2 = {
        appwriteProject: "source2-project",
        appwriteKey: "source2-key",
      };

      const source3 = {
        appwriteKey: "source3-key",
        sessionCookie: "source3-cookie",
      };

      const result = service.mergeSources([source1, source2, source3]);

      expect(result.appwriteEndpoint).toBe("https://source1.appwrite.io/v1");
      expect(result.appwriteProject).toBe("source2-project");
      expect(result.appwriteKey).toBe("source3-key");
      expect(result.sessionCookie).toBe("source3-cookie");
    });

    it("should handle arrays by replacing, not merging", () => {
      const source1 = {
        appwriteEndpoint: "https://cloud.appwrite.io/v1",
        appwriteProject: "test",
        databases: [{ $id: "db1", name: "db1" }],
      } as Partial<AppwriteConfig>;

      const source2 = {
        databases: [{ $id: "db2", name: "db2" }, { $id: "db3", name: "db3" }],
      } as Partial<AppwriteConfig>;

      const result = service.mergeSources([source1, source2]);

      expect(result.databases).toHaveLength(2);
      expect(result.databases).toEqual([{ $id: "db2", name: "db2" }, { $id: "db3", name: "db3" }]);
    });

    it("should skip undefined and null sources", () => {
      const source1 = {
        appwriteEndpoint: "https://cloud.appwrite.io/v1",
        appwriteProject: "test",
      };

      const result = service.mergeSources([
        source1,
        undefined as any,
        null as any,
        { appwriteKey: "key" },
      ]);

      expect(result.appwriteEndpoint).toBe("https://cloud.appwrite.io/v1");
      expect(result.appwriteProject).toBe("test");
      expect(result.appwriteKey).toBe("key");
    });

    it("should throw error when no valid sources provided", () => {
      expect(() => service.mergeSources([])).toThrow(
        "No valid configuration sources provided for merging"
      );

      expect(() =>
        service.mergeSources([undefined as any, null as any])
      ).toThrow("No valid configuration sources provided for merging");
    });

    it("should throw error when merged config lacks required fields", () => {
      const invalidSource = {
        appwriteKey: "key",
      };

      expect(() => service.mergeSources([invalidSource])).toThrow(
        "Merged configuration is missing required fields"
      );
    });
  });

  describe("mergeAllSources", () => {
    it("should merge all sources in correct priority order", () => {
      process.env.APPWRITE_ENDPOINT = "https://env.appwrite.io/v1";
      process.env.APPWRITE_API_KEY = "env-key";

      const overrides: ConfigOverrides = {
        appwriteKey: "override-key",
      };

      const result = service.mergeAllSources(baseConfig, {
        session: sessionInfo,
        overrides,
        includeEnv: true,
      });

      // Base config endpoint
      expect(result.appwriteEndpoint).toBe(baseConfig.appwriteEndpoint);
      // Session should set session cookie
      expect(result.sessionCookie).toBe(sessionInfo.cookie);
      // Override should win for API key
      expect(result.appwriteKey).toBe("override-key");
    });

    it("should exclude environment variables when includeEnv is false", () => {
      process.env.APPWRITE_SESSION_COOKIE = "env-cookie";

      const configWithoutKey = {
        ...baseConfig,
        appwriteKey: undefined,
      } as unknown as AppwriteConfig;

      const result = service.mergeAllSources(configWithoutKey, {
        includeEnv: false,
      });

      expect(result.sessionCookie).toBeUndefined();
    });

    it("should work with only base config", () => {
      const result = service.mergeAllSources(baseConfig, {});

      expect(result.appwriteEndpoint).toBe(baseConfig.appwriteEndpoint);
      expect(result.appwriteProject).toBe(baseConfig.appwriteProject);
    });

    it("should apply priority: overrides > session > env > base", () => {
      process.env.APPWRITE_KEY = "env-key";

      const configWithoutKey = {
        ...baseConfig,
        appwriteKey: undefined,
        sessionCookie: undefined,
      } as unknown as AppwriteConfig;

      // Test with session (should override env)
      const withSession = service.mergeAllSources(configWithoutKey, {
        session: sessionInfo,
        includeEnv: true,
      });

      expect(withSession.sessionCookie).toBe(sessionInfo.cookie);
      expect(withSession.authMethod).toBe("session");

      // Test with override (should override session)
      const withOverride = service.mergeAllSources(configWithoutKey, {
        session: sessionInfo,
        overrides: { authMethod: "apikey" },
        includeEnv: true,
      });

      expect(withOverride.authMethod).toBe("apikey");
    });
  });

  describe("deep merge behavior", () => {
    it("should deeply merge nested objects", () => {
      const source1 = {
        appwriteEndpoint: "https://cloud.appwrite.io/v1",
        appwriteProject: "test",
        databases: [
          {
            $id: "db1",
            name: "Database 1",
          },
        ],
      } as Partial<AppwriteConfig>;

      const source2 = {
        databases: [
          {
            $id: "db1",
            name: "Updated Database",
          },
        ],
      } as Partial<AppwriteConfig>;

      const result = service.mergeSources([source1, source2]);

      // Arrays are replaced, not merged
      expect(result.databases).toHaveLength(1);
      expect(result.databases![0].name).toBe("Updated Database");
    });

    it("should preserve immutability throughout merge chain", () => {
      const original1 = { ...baseConfig };
      const original2 = { appwriteKey: "new-key" };

      service.mergeSources([baseConfig, original2]);

      expect(baseConfig).toEqual(original1);
      expect(original2).toEqual({ appwriteKey: "new-key" });
    });
  });
});
