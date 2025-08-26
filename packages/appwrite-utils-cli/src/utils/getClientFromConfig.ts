import { type AppwriteConfig } from "appwrite-utils";
import { Client } from "node-appwrite";
import { AdapterFactory, type AdapterFactoryResult } from "../adapters/AdapterFactory.js";
import type { DatabaseAdapter } from "../adapters/DatabaseAdapter.js";

/**
 * Legacy function - returns basic Client for backwards compatibility
 * @deprecated Use getAdapterFromConfig for dual API support
 */
export const getClientFromConfig = (config: AppwriteConfig) => {
  let appwriteClient: Client | undefined;
  if (!config.appwriteClient) {
    appwriteClient = new Client()
      .setEndpoint(config.appwriteEndpoint)
      .setProject(config.appwriteProject)
      .setKey(config.appwriteKey);
    config.appwriteClient = appwriteClient;
  }
  return appwriteClient;
};

/**
 * Legacy function - returns basic Client
 * @deprecated Use createDatabaseAdapter for dual API support
 */
export const getClient = (endpoint: string, project: string, key: string) => {
  return new Client().setEndpoint(endpoint).setProject(project).setKey(key);
};

/**
 * Modern adapter-based client creation with dual API support
 * Returns both adapter and legacy client for compatibility
 */
export const getAdapterFromConfig = async (config: AppwriteConfig, forceRefresh?: boolean): Promise<{
  adapter: DatabaseAdapter;
  client: Client;
  apiMode: 'legacy' | 'tablesdb';
}> => {
  const result = await AdapterFactory.createFromConfig(config, forceRefresh);
  
  return {
    adapter: result.adapter,
    client: result.client,
    apiMode: result.apiMode
  };
};

/**
 * Create adapter from individual parameters
 */
export const getAdapter = async (
  endpoint: string, 
  project: string, 
  key: string,
  apiMode: 'auto' | 'legacy' | 'tablesdb' = 'auto'
): Promise<{
  adapter: DatabaseAdapter;
  client: Client;
  apiMode: 'legacy' | 'tablesdb';
}> => {
  const result = await AdapterFactory.create({
    appwriteEndpoint: endpoint,
    appwriteProject: project,
    appwriteKey: key,
    apiMode
  });
  
  return {
    adapter: result.adapter,
    client: result.client,
    apiMode: result.apiMode
  };
};
