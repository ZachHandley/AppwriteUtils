import { Client, Databases, Storage } from "node-appwrite";
import { performDatabaseSetupActions } from "./migrations/setupDatabase";
import {
  APPWRITE_API_KEY,
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT,
} from "./appwriteConfig";

const appwriteServer = new Client()
  .setEndpoint(APPWRITE_ENDPOINT!)
  .setProject(APPWRITE_PROJECT!)
  .setKey(APPWRITE_API_KEY!);
const database = new Databases(appwriteServer);
const storage = new Storage(appwriteServer);

export const runMigrations = async (
  includeMain: boolean = false,
  wipeDatabases: boolean = false,
  generateSchemas: boolean = false,
  generateMockData: boolean = false,
  importData: boolean = false
) => {
  // Assuming you have initialized `database` and `storage` here
  await performDatabaseSetupActions(database, storage, {
    runMain: includeMain,
    wipeDatabases: wipeDatabases,
    generateSchemas: generateSchemas,
    generateMockData: generateMockData,
    importData: importData,
  });
};
