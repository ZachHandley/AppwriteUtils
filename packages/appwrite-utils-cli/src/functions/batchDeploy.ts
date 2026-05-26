import type { Client } from "node-appwrite";
import pLimit from "p-limit";
import { type AppwriteFunction } from "appwrite-utils";
import { MessageFormatter } from "appwrite-utils-helpers";
import {
  finalizeFunctionDeployment,
  prepareFunctionDeployment,
  uploadFunctionDeployment,
} from "./deployments.js";
import type { WaitForDeploymentOptions } from "./methods.js";

export interface BatchDeployItem {
  functionName: string;
  functionConfig: AppwriteFunction;
  functionPath?: string;
  configDirPath?: string;
}

export interface BatchDeployResult {
  functionName: string;
  functionId: string;
  status: "ready" | "failed";
  deploymentId?: string;
  error?: Error;
  durationMs: number;
}

export interface BatchDeployOptions {
  buildConcurrency?: number;
  pollOptions?: WaitForDeploymentOptions;
}

/**
 * Pipelined multi-function deploy:
 *   - Uploads sequentially (clean cli-progress bar UX, no createDeployment
 *     rate-limit churn).
 *   - As each upload completes, its wait+activate task is enqueued on a
 *     pLimit(N) worker pool and starts running in parallel with the next
 *     upload.
 *   - At the end, all pending wait+activate tasks are awaited together via
 *     Promise.allSettled so one bad build does not abort the rest.
 *
 * Returns a per-function result array suitable for both human-readable
 * summary logging and machine-readable MCP responses.
 */
export const deployFunctionsBatch = async (
  client: Client,
  items: BatchDeployItem[],
  options: BatchDeployOptions = {}
): Promise<BatchDeployResult[]> => {
  if (items.length === 0) {
    return [];
  }

  const buildConcurrency = options.buildConcurrency ?? 5;
  const limit = pLimit(buildConcurrency);
  const overallStart = Date.now();

  type Pending = {
    functionName: string;
    functionId: string;
    startedAt: number;
    promise: Promise<BatchDeployResult>;
  };

  const pending: Pending[] = [];
  // Upload failures we surface up-front; finalize failures come from settled.
  const earlyFailures: BatchDeployResult[] = [];

  MessageFormatter.info(
    `Deploying ${items.length} function${items.length === 1 ? "" : "s"} (build concurrency: ${buildConcurrency})...`,
    { prefix: "BatchDeploy" }
  );

  for (const item of items) {
    const startedAt = Date.now();
    let prepared: Awaited<ReturnType<typeof prepareFunctionDeployment>>;
    let deploymentId: string;

    try {
      MessageFormatter.progress(
        `[${item.functionName}] Preparing and uploading...`,
        { prefix: "BatchDeploy" }
      );
      prepared = await prepareFunctionDeployment(
        client,
        item.functionName,
        item.functionConfig,
        item.functionPath,
        item.configDirPath
      );
      const uploaded = await uploadFunctionDeployment(
        client,
        prepared.functionId,
        prepared.deployPath,
        // Pass activate=true so Appwrite can auto-activate as soon as the
        // build finishes; finalizeFunctionDeployment also calls activate
        // explicitly afterwards to guarantee the final state.
        true,
        prepared.entrypoint,
        prepared.commands,
        prepared.ignored
      );
      deploymentId = uploaded.$id;
      MessageFormatter.success(
        `[${item.functionName}] Upload complete (deployment ${deploymentId}); build queued.`,
        { prefix: "BatchDeploy" }
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      MessageFormatter.error(
        `[${item.functionName}] Upload failed`,
        err,
        { prefix: "BatchDeploy" }
      );
      earlyFailures.push({
        functionName: item.functionName,
        functionId: item.functionConfig.$id,
        status: "failed",
        error: err,
        durationMs: Date.now() - startedAt,
      });
      continue;
    }

    const functionName = item.functionName;
    const functionId = prepared.functionId;
    const taskStartedAt = startedAt;

    const promise = limit(async (): Promise<BatchDeployResult> => {
      try {
        const ready = await finalizeFunctionDeployment(
          client,
          functionId,
          deploymentId,
          options.pollOptions
        );
        return {
          functionName,
          functionId,
          status: "ready",
          deploymentId: ready.$id,
          durationMs: Date.now() - taskStartedAt,
        };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        MessageFormatter.error(
          `[${functionName}] Build/activation failed`,
          err,
          { prefix: "BatchDeploy" }
        );
        return {
          functionName,
          functionId,
          status: "failed",
          deploymentId,
          error: err,
          durationMs: Date.now() - taskStartedAt,
        };
      }
    });

    pending.push({ functionName, functionId, startedAt: taskStartedAt, promise });
  }

  // All uploads done; await the finalize tasks. Use allSettled even though
  // the inner promises swallow errors, so we never bubble an unexpected
  // rejection.
  const settled = await Promise.allSettled(pending.map((p) => p.promise));

  const finalizeResults: BatchDeployResult[] = settled.map((s, idx) => {
    const slot = pending[idx];
    if (s.status === "fulfilled") {
      return s.value;
    }
    const err = s.reason instanceof Error ? s.reason : new Error(String(s.reason));
    return {
      functionName: slot.functionName,
      functionId: slot.functionId,
      status: "failed",
      error: err,
      durationMs: Date.now() - slot.startedAt,
    };
  });

  const results: BatchDeployResult[] = [...earlyFailures, ...finalizeResults];

  const readyCount = results.filter((r) => r.status === "ready").length;
  const failedCount = results.length - readyCount;
  const totalMs = Date.now() - overallStart;

  MessageFormatter.info(
    `Batch deploy summary: ${readyCount} ready, ${failedCount} failed in ${(totalMs / 1000).toFixed(1)}s`,
    { prefix: "BatchDeploy" }
  );

  for (const r of results) {
    if (r.status === "ready") {
      MessageFormatter.success(
        `  ✔ ${r.functionName} (${(r.durationMs / 1000).toFixed(1)}s) → ${r.deploymentId}`,
        { prefix: "BatchDeploy" }
      );
    } else {
      const msg = r.error?.message ?? "Unknown error";
      const tail = msg.length > 500 ? msg.slice(-500) : msg;
      MessageFormatter.error(
        `  ✘ ${r.functionName} (${(r.durationMs / 1000).toFixed(1)}s) — ${tail}`,
        undefined,
        { prefix: "BatchDeploy" }
      );
    }
  }

  return results;
};
