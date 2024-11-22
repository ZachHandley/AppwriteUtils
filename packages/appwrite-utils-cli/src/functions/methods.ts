import {
  AppwriteException,
  Client,
  Functions,
  Query,
  Runtime,
  type Models,
} from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { create as createTarball } from "tar";
import { join } from "node:path";
import fs from "node:fs";
import { type Specification } from "appwrite-utils";
import chalk from "chalk";

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

export const deleteFunction = async (client: Client, functionId: string) => {
  const functions = new Functions(client);
  const functionResponse = await functions.delete(functionId);
  return functionResponse;
};

export const createFunction = async (
  client: Client,
  functionId: string,
  name: string,
  runtime: Runtime,
  execute?: string[],
  events?: string[],
  schedule?: string,
  timeout?: number,
  enabled?: boolean,
  logging?: boolean,
  entrypoint?: string,
  commands?: string,
  scopes?: string[],
  installationId?: string,
  providerRepositoryId?: string,
  providerBranch?: string,
  providerSilentMode?: boolean,
  providerRootDirectory?: string,
  templateRepository?: string,
  templateOwner?: string,
  templateRootDirectory?: string,
  templateVersion?: string,
  specification?: string
) => {
  const functions = new Functions(client);
  const functionResponse = await functions.create(
    functionId,
    name,
    runtime,
    execute,
    events,
    schedule,
    timeout,
    enabled,
    logging,
    entrypoint,
    commands,
    scopes,
    installationId,
    providerRepositoryId,
    providerBranch,
    providerSilentMode,
    providerRootDirectory,
    templateRepository,
    templateOwner,
    templateRootDirectory,
    templateVersion,
    specification
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
    const functionResponse = await updateFunction(
      client,
      functionId,
      functionFound.name,
      functionFound.runtime as Runtime,
      functionFound.execute,
      functionFound.events,
      functionFound.schedule,
      functionFound.timeout,
      functionFound.enabled,
      functionFound.logging,
      functionFound.entrypoint,
      functionFound.commands,
      functionFound.scopes,
      functionFound.installationId,
      functionFound.providerRepositoryId,
      functionFound.providerBranch,
      functionFound.providerSilentMode,
      functionFound.providerRootDirectory,
      specification
    );
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
  functionId: string,
  name: string,
  runtime?: Runtime,
  execute?: string[],
  events?: string[],
  schedule?: string,
  timeout?: number,
  enabled?: boolean,
  logging?: boolean,
  entrypoint?: string,
  commands?: string,
  scopes?: string[],
  installationId?: string,
  providerRepositoryId?: string,
  providerBranch?: string,
  providerSilentMode?: boolean,
  providerRootDirectory?: string,
  specification?: Specification
) => {
  const functions = new Functions(client);
  const functionResponse = await functions.update(
    functionId,
    name,
    runtime,
    execute,
    events,
    schedule,
    timeout,
    enabled,
    logging,
    entrypoint,
    commands,
    scopes,
    installationId,
    providerRepositoryId,
    providerBranch,
    providerSilentMode,
    providerRootDirectory,
    specification
  );
  return functionResponse;
};

export const deployFunction = async (
  client: Client,
  functionId: string,
  codePath: string,
  activate: boolean = true,
  entrypoint: string = "index.js",
  commands: string = "npm install"
) => {
  const functions = new Functions(client);

  // Create temporary tar.gz file
  const tarPath = join(process.cwd(), `function-${functionId}.tar.gz`);
  await createTarball(
    {
      gzip: true,
      file: tarPath,
      cwd: codePath,
    },
    ["."] // Include all files from codePath
  );

  // Read the tar.gz file and create a File object
  const fileBuffer = await fs.promises.readFile(tarPath);
  const fileObject = InputFile.fromBuffer(
    new Uint8Array(fileBuffer),
    `function-${functionId}.tar.gz`
  );

  // Create deployment with the File object
  const functionResponse = await functions.createDeployment(
    functionId,
    fileObject,
    activate,
    entrypoint,
    commands
  );

  // Clean up the temporary tar file
  await fs.promises.unlink(tarPath);

  return functionResponse;
};
