import {
  Client,
  Sites,
  type Framework,
  type BuildRuntime,
  type Adapter,
  type Models,
} from "node-appwrite";
import { type AppwriteSite } from "appwrite-utils";

export const listSites = async (
  client: Client,
  queries?: string[],
  search?: string
) => {
  const sites = new Sites(client);
  const sitesList = await sites.list({ queries, search });
  return sitesList;
};

export const getSite = async (client: Client, siteId: string) => {
  const sites = new Sites(client);
  const siteResponse = await sites.get({ siteId });
  return siteResponse;
};

export const deleteSite = async (client: Client, siteId: string) => {
  const sites = new Sites(client);
  const siteResponse = await sites.delete({ siteId });
  return siteResponse;
};

export const createSite = async (
  client: Client,
  siteConfig: AppwriteSite
) => {
  const sites = new Sites(client);
  const siteResponse = await sites.create({
    siteId: siteConfig.$id,
    name: siteConfig.name,
    framework: siteConfig.framework as Framework,
    buildRuntime: siteConfig.buildRuntime as BuildRuntime,
    enabled: siteConfig.enabled,
    logging: siteConfig.logging,
    timeout: siteConfig.timeout,
    installCommand: siteConfig.installCommand,
    buildCommand: siteConfig.buildCommand,
    outputDirectory: siteConfig.outputDirectory,
    adapter: siteConfig.adapter as Adapter | undefined,
    fallbackFile: siteConfig.fallbackFile,
    installationId: siteConfig.installationId,
    providerRepositoryId: siteConfig.providerRepositoryId,
    providerBranch: siteConfig.providerBranch,
    providerSilentMode: siteConfig.providerSilentMode,
    providerRootDirectory: siteConfig.providerRootDirectory,
    buildSpecification: siteConfig.buildSpecification,
    runtimeSpecification: siteConfig.runtimeSpecification,
  });
  return siteResponse;
};

export const updateSite = async (
  client: Client,
  siteConfig: AppwriteSite
) => {
  const sites = new Sites(client);
  const siteResponse = await sites.update({
    siteId: siteConfig.$id,
    name: siteConfig.name,
    framework: siteConfig.framework as Framework,
    buildRuntime: siteConfig.buildRuntime as BuildRuntime | undefined,
    enabled: siteConfig.enabled,
    logging: siteConfig.logging,
    timeout: siteConfig.timeout,
    installCommand: siteConfig.installCommand,
    buildCommand: siteConfig.buildCommand,
    outputDirectory: siteConfig.outputDirectory,
    adapter: siteConfig.adapter as Adapter | undefined,
    fallbackFile: siteConfig.fallbackFile,
    installationId: siteConfig.installationId,
    providerRepositoryId: siteConfig.providerRepositoryId,
    providerBranch: siteConfig.providerBranch,
    providerSilentMode: siteConfig.providerSilentMode,
    providerRootDirectory: siteConfig.providerRootDirectory,
    buildSpecification: siteConfig.buildSpecification,
    runtimeSpecification: siteConfig.runtimeSpecification,
  });
  return siteResponse;
};

export const listSiteDeployments = async (
  client: Client,
  siteId: string,
  queries?: string[]
) => {
  const sites = new Sites(client);
  const deployments = await sites.listDeployments({ siteId, queries });
  return deployments;
};

export interface WaitForSiteDeploymentOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

export const waitForSiteDeploymentReady = async (
  client: Client,
  siteId: string,
  deploymentId: string,
  options: WaitForSiteDeploymentOptions = {}
): Promise<Models.Deployment> => {
  const intervalMs = options.intervalMs ?? 3000;
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const sites = new Sites(client);
  const startedAt = Date.now();

  while (true) {
    const deployment = await sites.getDeployment({ siteId, deploymentId });
    const status = deployment.status;

    if (status === "ready") {
      return deployment;
    }

    if (status === "failed" || status === "canceled") {
      const log = (deployment.buildLogs ?? "").slice(-2000);
      throw new Error(
        `Site deployment ${deploymentId} ended with status "${status}".${
          log ? `\nBuild log (tail):\n${log}` : ""
        }`
      );
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(
        `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for site deployment ${deploymentId} to become ready (last status: "${status}").`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
};

export const activateSiteDeployment = async (
  client: Client,
  siteId: string,
  deploymentId: string
): Promise<Models.Site> => {
  const sites = new Sites(client);
  return await sites.updateSiteDeployment({ siteId, deploymentId });
};

export const listFrameworks = async (client: Client) => {
  const sites = new Sites(client);
  const frameworks = await sites.listFrameworks();
  return frameworks;
};

export const listSiteSpecifications = async (client: Client) => {
  const sites = new Sites(client);
  const specifications = await sites.listSpecifications();
  return specifications;
};

export const listSiteVariables = async (
  client: Client,
  siteId: string
) => {
  const sites = new Sites(client);
  const variables = await sites.listVariables({ siteId });
  return variables;
};

export const createSiteVariable = async (
  client: Client,
  siteId: string,
  key: string,
  value: string,
  secret?: boolean
) => {
  const sites = new Sites(client);
  const variable = await sites.createVariable({ siteId, key, value, secret });
  return variable;
};

export const updateSiteVariable = async (
  client: Client,
  siteId: string,
  variableId: string,
  key: string,
  value?: string,
  secret?: boolean
) => {
  const sites = new Sites(client);
  const variable = await sites.updateVariable({
    siteId,
    variableId,
    key,
    value,
    secret,
  });
  return variable;
};

export const deleteSiteVariable = async (
  client: Client,
  siteId: string,
  variableId: string
) => {
  const sites = new Sites(client);
  const result = await sites.deleteVariable({ siteId, variableId });
  return result;
};
