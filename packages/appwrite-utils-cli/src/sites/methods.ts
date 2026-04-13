import {
  Client,
  Sites,
  type Framework,
  type BuildRuntime,
  type Adapter,
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
