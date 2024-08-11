import { type AppwriteConfig } from "appwrite-utils";
import { Client } from "node-appwrite";
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
