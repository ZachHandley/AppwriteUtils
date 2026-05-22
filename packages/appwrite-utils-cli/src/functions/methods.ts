import {
  AppwriteException,
  Client,
  Functions,
  Query,
  Runtime,
  type Models,
  type Scopes,
} from "node-appwrite";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import {
  type AppwriteFunction,
  type FunctionScope,
  type Specification,
  type Runtime as AppwriteUtilsRuntime,
  EventTypeSchema,
} from "appwrite-utils";
import chalk from "chalk";
import { extract as extractTar } from "tar";
import { MessageFormatter } from "appwrite-utils-helpers";
import { expandTildePath, normalizeFunctionName } from 'appwrite-utils-helpers';

/**
 * Validates and filters events array for Appwrite functions
 * - Filters out empty/invalid strings
 * - Validates against EventTypeSchema
 * - Limits to 100 items maximum (Appwrite limit)
 * - Returns empty array if input is invalid
 */
const validateEvents = (events?: string[]): string[] => {
  if (!events || !Array.isArray(events)) return [];

  return events
    .filter(event => {
      if (!event || typeof event !== 'string' || event.trim().length === 0) {
        return false;
      }
      // Validate against EventTypeSchema
      const result = EventTypeSchema.safeParse(event);
      if (!result.success) {
        MessageFormatter.warning(`Invalid event type "${event}" will be filtered out`, { prefix: "Functions" });
        return false;
      }
      return true;
    })
    .slice(0, 100);
};

export const listFunctions = async (
  client: Client,
  queries?: string[],
  search?: string
) => {
  const functions = new Functions(client);
  const functionsList = await functions.list(queries, search);
  return functionsList;
};

export const getFunction = async (client: Client, functionId: string) => {
  const functions = new Functions(client);
  const functionResponse = await functions.get(functionId);
  return functionResponse;
};

export const downloadLatestFunctionDeployment = async (
  client: Client,
  functionId: string,
  basePath: string = process.cwd()
) => {
  const functions = new Functions(client);
  const functionInfo = await getFunction(client, functionId);
  const functionDeployments = await functions.listDeployments(functionId, [
    Query.orderDesc("$createdAt"),
  ]);

  if (functionDeployments.deployments.length === 0) {
    throw new Error("No deployments found for function");
  }

  const latestDeployment = functionDeployments.deployments[0];
  const deploymentData = await functions.getDeploymentDownload(
    functionId,
    latestDeployment.$id
  );

  // Create function directory using provided basePath
  const functionDir = join(
    basePath,
    normalizeFunctionName(functionInfo.name)
  );
  await fs.promises.mkdir(functionDir, { recursive: true });

  // Create temporary file for tar extraction
  const tarPath = join(functionDir, "temp.tar.gz");
  const uint8Array = new Uint8Array(deploymentData);
  await fs.promises.writeFile(tarPath, uint8Array);

  try {
    // Extract tar file
    extractTar({
      C: functionDir,
      file: tarPath,
      sync: true,
    });

    return {
      path: functionDir,
      function: functionInfo,
      deployment: latestDeployment,
    };
  } finally {
    // Clean up tar file
    await fs.promises.unlink(tarPath).catch(() => {});
  }
};

export const deleteFunction = async (client: Client, functionId: string) => {
  const functions = new Functions(client);
  const functionResponse = await functions.delete(functionId);
  return functionResponse;
};

export const createFunction = async (
  client: Client,
  functionConfig: AppwriteFunction
) => {
  const functions = new Functions(client);
  const functionResponse = await functions.create(
    functionConfig.$id,
    functionConfig.name,
    functionConfig.runtime as Runtime,
    functionConfig.execute,
    validateEvents(functionConfig.events),
    functionConfig.schedule,
    functionConfig.timeout,
    functionConfig.enabled,
    functionConfig.logging,
    functionConfig.entrypoint,
    functionConfig.commands,
    functionConfig.scopes as Scopes[],
    functionConfig.installationId,
    functionConfig.providerRepositoryId,
    functionConfig.providerBranch,
    functionConfig.providerSilentMode,
    functionConfig.providerRootDirectory,
    functionConfig.buildSpecification,
    functionConfig.runtimeSpecification
  );
  return functionResponse;
};

export const updateFunctionSpecifications = async (
  client: Client,
  functionId: string,
  buildSpecification: Specification,
  runtimeSpecification: Specification
) => {
  const curFunction = await listFunctions(client, [
    Query.equal("$id", functionId),
  ]);
  if (curFunction.functions.length === 0) {
    throw new Error("Function not found");
  }
  const functionFound = curFunction.functions[0];
  try {
    const functionResponse = await updateFunction(client, {
      ...functionFound,
      runtime: functionFound.runtime as AppwriteUtilsRuntime,
      scopes: functionFound.scopes as FunctionScope[],
      buildSpecification,
      runtimeSpecification,
    });
    return functionResponse;
  } catch (error) {
    if (
      error instanceof AppwriteException &&
      error.message.includes("Invalid `specification`")
    ) {
      MessageFormatter.error(
        "Error updating function specifications, please try setting the env variable `_FUNCTIONS_CPUS` and `_FUNCTIONS_RAM` to non-zero values",
        undefined,
        { prefix: "Functions" }
      );
    } else {
      MessageFormatter.error("Error updating function specifications", error instanceof Error ? error : undefined, { prefix: "Functions" });
      throw error;
    }
  }
};

export const listSpecifications = async (client: Client) => {
  const functions = new Functions(client);
  const specifications = await functions.listSpecifications();
  return specifications;
};

export const listFunctionDeployments = async (
  client: Client,
  functionId: string,
  queries?: string[]
) => {
  const functions = new Functions(client);
  const deployments = await functions.listDeployments(functionId, queries);
  return deployments;
};

export interface WaitForDeploymentOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

export const waitForDeploymentReady = async (
  client: Client,
  functionId: string,
  deploymentId: string,
  options: WaitForDeploymentOptions = {}
): Promise<Models.Deployment> => {
  const intervalMs = options.intervalMs ?? 3000;
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const functions = new Functions(client);
  const startedAt = Date.now();

  while (true) {
    const deployment = await functions.getDeployment(functionId, deploymentId);
    const status = deployment.status;

    if (status === "ready") {
      return deployment;
    }

    if (status === "failed" || status === "canceled") {
      const log = (deployment.buildLogs ?? "").slice(-2000);
      throw new Error(
        `Deployment ${deploymentId} ended with status "${status}".${
          log ? `\nBuild log (tail):\n${log}` : ""
        }`
      );
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(
        `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for deployment ${deploymentId} to become ready (last status: "${status}").`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
};

export const activateDeployment = async (
  client: Client,
  functionId: string,
  deploymentId: string
): Promise<Models.Function> => {
  const functions = new Functions(client);
  return await functions.updateFunctionDeployment(functionId, deploymentId);
};

export const updateFunction = async (
  client: Client,
  functionConfig: AppwriteFunction
) => {
  const functions = new Functions(client);
  const functionResponse = await functions.update(
    functionConfig.$id,
    functionConfig.name,
    functionConfig.runtime as Runtime,
    functionConfig.execute,
    validateEvents(functionConfig.events),
    functionConfig.schedule,
    functionConfig.timeout,
    functionConfig.enabled,
    functionConfig.logging,
    functionConfig.entrypoint,
    functionConfig.commands,
    functionConfig.scopes as Scopes[],
    functionConfig.installationId,
    functionConfig.providerRepositoryId,
    functionConfig.providerBranch,
    functionConfig.providerSilentMode,
    functionConfig.providerRootDirectory,
    functionConfig.buildSpecification,
    functionConfig.runtimeSpecification
  );
  return functionResponse;
};

export const createFunctionTemplate = async (
  templateType: "typescript-node" | "uv" | "count-docs-in-collection" | "hono-typescript",
  functionName: string,
  basePath: string = "./functions"
) => {
  const expandedBasePath = expandTildePath(basePath);
  const functionPath = join(expandedBasePath, functionName);
  const currentFileUrl = import.meta.url;
  const currentDir = dirname(fileURLToPath(currentFileUrl));
  const templatesPath = join(currentDir, "templates", templateType);

  // Create function directory
  await fs.promises.mkdir(functionPath, { recursive: true });

  // Copy template files recursively
  const copyTemplateFiles = async (sourcePath: string, targetPath: string) => {
    const entries = await fs.promises.readdir(sourcePath, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const srcPath = join(sourcePath, entry.name);
      const destPath = join(targetPath, entry.name);

      if (entry.isDirectory()) {
        await fs.promises.mkdir(destPath, { recursive: true });
        await copyTemplateFiles(srcPath, destPath);
      } else {
        let content = await fs.promises.readFile(srcPath, "utf-8");

        // Replace template variables
        content = content
          .replace(/\{\{functionName\}\}/g, functionName)
          .replace(/\{\{databaseId\}\}/g, "{{databaseId}}")
          .replace(/\{\{collectionId\}\}/g, "{{collectionId}}");

        await fs.promises.writeFile(destPath, content);
      }
    }
  };

  try {
    await copyTemplateFiles(templatesPath, functionPath);
    MessageFormatter.success(
      `Created ${templateType} function template at ${functionPath}`,
      { prefix: "Functions" }
    );
  } catch (error) {
    MessageFormatter.error("Failed to create function template", error instanceof Error ? error : undefined, { prefix: "Functions" });
    throw error;
  }

  return functionPath;
};

// ──────────────────────────────────────────────────
// VARIABLE MANAGEMENT
// ──────────────────────────────────────────────────

export const listFunctionVariables = async (
  client: Client,
  functionId: string
): Promise<Models.VariableList> => {
  const functions = new Functions(client);
  return await functions.listVariables({ functionId });
};

export const createFunctionVariable = async (
  client: Client,
  functionId: string,
  key: string,
  value: string,
  secret?: boolean
): Promise<Models.Variable> => {
  const functions = new Functions(client);
  return await functions.createVariable({
    functionId,
    key,
    value,
    secret,
  });
};

export const updateFunctionVariable = async (
  client: Client,
  functionId: string,
  variableId: string,
  key: string,
  value?: string,
  secret?: boolean
): Promise<Models.Variable> => {
  const functions = new Functions(client);
  return await functions.updateVariable({
    functionId,
    variableId,
    key,
    value,
    secret,
  });
};

export interface SyncVariablesOptions {
  /**
   * When true, overwrites Appwrite-side variables whose `secret` flag is true.
   * Default: false (secrets are preserved across deploys).
   */
  forceOverwriteSecrets?: boolean;
  /**
   * Optional MessageFormatter prefix override. Defaults to "Variables".
   */
  prefix?: string;
}

export interface SyncVariablesResult {
  created: string[];
  updated: string[];
  skipped: string[];
  unchanged: string[];
}

/**
 * Sync a function's variables to Appwrite while respecting Appwrite-side
 * secret variables. Behavior:
 *
 *   - For each key in `desiredVars`:
 *       - if absent on Appwrite → createVariable
 *       - if present and `secret === true` on Appwrite and
 *         `forceOverwriteSecrets !== true` → SKIP (preserve)
 *       - if present and value differs → updateVariable
 *       - if present and value matches → unchanged
 *   - Variables present on Appwrite but absent from `desiredVars` are
 *     LEFT ALONE. We never delete server-side vars during sync.
 *
 * This is intentionally additive/preserving so that out-of-band secrets
 * (e.g. OneUptime ingest tokens, payment provider keys set in the UI)
 * survive every redeploy.
 */
export const syncFunctionVariables = async (
  client: Client,
  functionId: string,
  desiredVars: Record<string, string> | undefined,
  options: SyncVariablesOptions = {}
): Promise<SyncVariablesResult> => {
  const prefix = options.prefix ?? "Variables";
  const result: SyncVariablesResult = {
    created: [],
    updated: [],
    skipped: [],
    unchanged: [],
  };

  if (!desiredVars || Object.keys(desiredVars).length === 0) {
    MessageFormatter.debug(
      `No local variables to sync for ${functionId}`,
      undefined,
      { prefix }
    );
    return result;
  }

  const existing = await listFunctionVariables(client, functionId);
  const existingByKey = new Map<string, Models.Variable>();
  for (const v of existing.variables) {
    existingByKey.set(v.key, v);
  }

  for (const [key, rawValue] of Object.entries(desiredVars)) {
    const value = String(rawValue);
    const current = existingByKey.get(key);

    if (!current) {
      await createFunctionVariable(client, functionId, key, value);
      result.created.push(key);
      MessageFormatter.debug(`Created ${key}`, undefined, { prefix });
      continue;
    }

    if (current.secret && !options.forceOverwriteSecrets) {
      result.skipped.push(key);
      MessageFormatter.info(
        `[preserve-secret] ${functionId}:${key} (Appwrite-side secret — not overwritten)`,
        { prefix }
      );
      continue;
    }

    if (current.value === value) {
      result.unchanged.push(key);
      continue;
    }

    await updateFunctionVariable(
      client,
      functionId,
      current.$id,
      key,
      value,
      current.secret
    );
    result.updated.push(key);
    MessageFormatter.debug(`Updated ${key}`, undefined, { prefix });
  }

  const summary = [
    result.created.length ? `created=${result.created.length}` : null,
    result.updated.length ? `updated=${result.updated.length}` : null,
    result.skipped.length ? `skipped=${result.skipped.length}` : null,
    result.unchanged.length ? `unchanged=${result.unchanged.length}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  if (summary) {
    MessageFormatter.success(`${functionId}: ${summary}`, { prefix });
  }

  return result;
};
