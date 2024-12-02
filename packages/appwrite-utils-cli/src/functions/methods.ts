import {
  AppwriteException,
  Client,
  Functions,
  Query,
  Runtime,
} from "node-appwrite";
import { join } from "node:path";
import fs from "node:fs";
import {
  type AppwriteFunction,
  type FunctionScope,
  type Specification,
} from "appwrite-utils";
import chalk from "chalk";
import { extract as extractTar } from "tar";

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
    functionInfo.name.toLowerCase().replace(/\s+/g, "-")
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
    functionConfig.events,
    functionConfig.schedule,
    functionConfig.timeout,
    functionConfig.enabled,
    functionConfig.logging,
    functionConfig.entrypoint,
    functionConfig.commands,
    functionConfig.scopes,
    functionConfig.installationId,
    functionConfig.providerRepositoryId,
    functionConfig.providerBranch,
    functionConfig.providerSilentMode,
    functionConfig.providerRootDirectory,
    functionConfig.templateRepository,
    functionConfig.templateOwner,
    functionConfig.templateRootDirectory,
    functionConfig.templateVersion,
    functionConfig.specification
  );
  return functionResponse;
};

export const updateFunctionSpecifications = async (
  client: Client,
  functionId: string,
  specification: Specification
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
      runtime: functionFound.runtime as Runtime,
      scopes: functionFound.scopes as FunctionScope[],
      specification: specification,
    });
    return functionResponse;
  } catch (error) {
    if (
      error instanceof AppwriteException &&
      error.message.includes("Invalid `specification`")
    ) {
      console.error(
        chalk.red(
          "Error updating function specifications, please try setting the env variable `_FUNCTIONS_CPUS` and `_FUNCTIONS_RAM` to non-zero values"
        )
      );
    } else {
      console.error(chalk.red("Error updating function specifications."));
      throw error;
    }
  }
};

export const listSpecifications = async (client: Client) => {
  const functions = new Functions(client);
  const specifications = await functions.listSpecifications();
  return specifications;
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
    functionConfig.events,
    functionConfig.schedule,
    functionConfig.timeout,
    functionConfig.enabled,
    functionConfig.logging,
    functionConfig.entrypoint,
    functionConfig.commands,
    functionConfig.scopes,
    functionConfig.installationId,
    functionConfig.providerRepositoryId,
    functionConfig.providerBranch,
    functionConfig.providerSilentMode,
    functionConfig.providerRootDirectory,
    functionConfig.specification
  );
  return functionResponse;
};

export const createFunctionTemplate = async (
  templateType: "typescript-node" | "poetry" | "count-docs-in-collection",
  functionName: string,
  basePath: string = "./functions"
) => {
  const functionPath = join(basePath, functionName);
  const templatesPath = join(__dirname, "templates", templateType);

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
    console.log(
      chalk.green(
        `✨ Created ${templateType} function template at ${functionPath}`
      )
    );
  } catch (error) {
    console.error(chalk.red(`Failed to create function template: ${error}`));
    throw error;
  }

  return functionPath;
};
