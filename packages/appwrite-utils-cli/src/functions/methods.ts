import {
  AppwriteException,
  Client,
  Functions,
  Query,
  Runtime,
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
