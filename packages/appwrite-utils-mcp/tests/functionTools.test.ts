import { describe, expect, test, mock } from "bun:test";

/**
 * These tests exercise the execution-payload tools (get_execution,
 * get_execution_logs, fetch_execution_chunk) against a mocked
 * FunctionManager. Behaviour under test:
 *   - tail: N on get_execution_logs returns last N lines
 *   - excludeResponseBody: true drops responseBody from get_execution
 *   - Auto-truncation when a field exceeds EXECUTION_FIELD_TRUNCATE_THRESHOLD
 *   - fetch_execution_chunk pagination (offset/length/hasMore semantics)
 */

// Mutable hook so each test can swap the execution payload the mock returns.
let mockExecutionPayload: any = null;

mock.module("appwrite-utils-helpers", () => {
  class MockFunctionManager {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_client: any) {}
    async getExecution(_fid: string, eid: string) {
      return (
        mockExecutionPayload ?? {
          $id: eid,
          $createdAt: "2026-05-17T00:00:00Z",
          $updatedAt: "2026-05-17T00:00:01Z",
          functionId: "fn1",
          deploymentId: "dep1",
          trigger: "http",
          status: "completed",
          requestMethod: "GET",
          requestPath: "/",
          responseStatusCode: 200,
          responseBody: "small body",
          logs: "line1\nline2\nline3\nline4\nline5\nline6",
          errors: "",
          duration: 0.123,
        }
      );
    }
    async listExecutions() {
      return { total: 0, executions: [] };
    }
  }
  return { FunctionManager: MockFunctionManager };
});

const { functionsToolGroup } = await import("../src/tools/functions/index.js");

const fakeContext: any = {
  authResolver: {
    resolve: async () => ({
      credentials: {
        endpoint: "https://example.test/v1",
        projectId: "p1",
        apiKey: "k",
        authMethod: "apiKey",
      },
    }),
  },
  clientRegistry: {
    getOrCreate: async () => ({ client: {} }),
  },
  stateManager: {},
  toolRegistry: {},
};

const getEx = functionsToolGroup.tools.find((t) => t.name === "get_execution")!;
const getExLogs = functionsToolGroup.tools.find(
  (t) => t.name === "get_execution_logs",
)!;
const chunk = functionsToolGroup.tools.find(
  (t) => t.name === "fetch_execution_chunk",
)!;

describe("get_execution_logs — tail slicing", () => {
  test("tail: 2 returns the last 2 lines", async () => {
    mockExecutionPayload = null;
    const r: any = await getExLogs.handler(
      { functionId: "fn1", executionId: "ex1", tail: 2 },
      fakeContext,
    );
    expect(r.logs).toBe("line5\nline6");
  });

  test("no tail returns all lines", async () => {
    mockExecutionPayload = null;
    const r: any = await getExLogs.handler(
      { functionId: "fn1", executionId: "ex1" },
      fakeContext,
    );
    expect(r.logs.split("\n").length).toBe(6);
  });

  test("tail larger than line count returns everything", async () => {
    mockExecutionPayload = null;
    const r: any = await getExLogs.handler(
      { functionId: "fn1", executionId: "ex1", tail: 100 },
      fakeContext,
    );
    expect(r.logs.split("\n").length).toBe(6);
  });
});

describe("get_execution — excludeResponseBody", () => {
  test("default: responseBody present", async () => {
    mockExecutionPayload = null;
    const r: any = await getEx.handler(
      { functionId: "fn1", executionId: "ex1" },
      fakeContext,
    );
    expect(r.responseBody).toBe("small body");
  });

  test("excludeResponseBody: true drops the field", async () => {
    mockExecutionPayload = null;
    const r: any = await getEx.handler(
      { functionId: "fn1", executionId: "ex1", excludeResponseBody: true },
      fakeContext,
    );
    expect("responseBody" in r).toBe(false);
    expect(r.$id).toBe("ex1"); // metadata preserved
    expect(r.logs).toBeDefined();
  });
});

describe("get_execution — auto-truncation on large responseBody", () => {
  test("responseBody > 60K triggers truncation with hint", async () => {
    mockExecutionPayload = {
      $id: "ex-big",
      $createdAt: "now",
      $updatedAt: "now",
      functionId: "fn1",
      deploymentId: "d",
      trigger: "http",
      status: "completed",
      requestMethod: "GET",
      requestPath: "/",
      responseStatusCode: 200,
      responseBody: "X".repeat(80_000),
      logs: "",
      errors: "",
      duration: 1,
    };

    const r: any = await getEx.handler(
      { functionId: "fn1", executionId: "ex-big" },
      fakeContext,
    );
    expect(r.responseBody.length).toBe(50_000);
    expect(r.responseBodyTruncated).toBe(true);
    expect(r.responseBodyTotal).toBe(80_000);
    expect(r.responseBodyFetchHint).toContain("fetch_execution_chunk");
    expect(r.responseBodyFetchHint).toContain("offset=50000");
    expect(r.responseBodyFetchHint).toContain("field='responseBody'");
  });

  test("small responseBody is not truncated, no hint emitted", async () => {
    mockExecutionPayload = {
      $id: "ex-small",
      $createdAt: "now",
      $updatedAt: "now",
      functionId: "fn1",
      deploymentId: "d",
      trigger: "http",
      status: "completed",
      requestMethod: "GET",
      requestPath: "/",
      responseStatusCode: 200,
      responseBody: "tiny",
      logs: "",
      errors: "",
      duration: 1,
    };
    const r: any = await getEx.handler(
      { functionId: "fn1", executionId: "ex-small" },
      fakeContext,
    );
    expect(r.responseBody).toBe("tiny");
    expect(r.responseBodyTruncated).toBeUndefined();
    expect(r.responseBodyFetchHint).toBeUndefined();
  });
});

describe("fetch_execution_chunk — pagination", () => {
  test("offset=50000 returns the remainder, hasMore=false", async () => {
    mockExecutionPayload = {
      responseBody: "A".repeat(80_000),
      logs: "",
      errors: "",
    };
    const r: any = await chunk.handler(
      {
        functionId: "fn1",
        executionId: "ex-big",
        field: "responseBody",
        offset: 50_000,
        length: 50_000,
      },
      fakeContext,
    );
    expect(r.offset).toBe(50_000);
    expect(r.length).toBe(30_000);
    expect(r.total).toBe(80_000);
    expect(r.hasMore).toBe(false);
    expect(r.content).toBe("A".repeat(30_000));
  });

  test("first 20K with hasMore=true", async () => {
    mockExecutionPayload = {
      responseBody: "A".repeat(80_000),
      logs: "",
      errors: "",
    };
    const r: any = await chunk.handler(
      {
        functionId: "fn1",
        executionId: "ex-big",
        field: "responseBody",
        offset: 0,
        length: 20_000,
      },
      fakeContext,
    );
    expect(r.length).toBe(20_000);
    expect(r.hasMore).toBe(true);
    expect(r.content).toBe("A".repeat(20_000));
  });

  test("offset past end returns empty content + hasMore=false", async () => {
    mockExecutionPayload = {
      responseBody: "A".repeat(80_000),
      logs: "",
      errors: "",
    };
    const r: any = await chunk.handler(
      {
        functionId: "fn1",
        executionId: "ex-big",
        field: "responseBody",
        offset: 100_000,
        length: 50_000,
      },
      fakeContext,
    );
    expect(r.content).toBe("");
    expect(r.length).toBe(0);
    expect(r.hasMore).toBe(false);
  });

  test("field='logs' slices the logs field", async () => {
    mockExecutionPayload = {
      responseBody: "",
      logs: "L".repeat(200),
      errors: "",
    };
    const r: any = await chunk.handler(
      {
        functionId: "fn1",
        executionId: "ex1",
        field: "logs",
        offset: 50,
        length: 100,
      },
      fakeContext,
    );
    expect(r.content).toBe("L".repeat(100));
    expect(r.field).toBe("logs");
  });
});
