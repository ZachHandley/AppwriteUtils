import { Client } from "appwrite";

export const getAppwriteClient = (
  endpoint: string,
  project: string,
  sessionKey?: string
) => {
  const client = new Client();
  client.setEndpoint(endpoint).setProject(project);
  if (sessionKey) {
    client.setSession(sessionKey);
  }
  return client;
};
