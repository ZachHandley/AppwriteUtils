import type { AppwriteConfig } from "appwrite-utils";

// Example base configuration using types from appwrite-utils
const appwriteConfig: AppwriteConfig = {
  appwriteEndpoint: "https://cloud.appwrite.io/v1",
  appwriteProject: "YOUR_PROJECT_ID",
  appwriteKey: "YOUR_API_KEY",
  enableBackups: true,
  backupInterval: 3600,
  backupRetention: 30,
  enableBackupCleanup: true,
  enableMockData: false,
  documentBucketId: "documents",
  usersCollectionName: "Members",
  databases: [
    { $id: "main", name: "Main" },
    { $id: "staging", name: "Staging" },
    { $id: "dev", name: "Development" },
  ],
  buckets: [],
};

export default appwriteConfig;
