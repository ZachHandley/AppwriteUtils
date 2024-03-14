import { Client, Databases, Storage } from "node-appwrite";
import { performDatabaseSetupActions } from "./migrations/setupDatabase";

const APPWRITE_API_KEY =
  "0f9c898795db0d370244620e72e2c6b47de5f515ff411acad1aed10d11f541e08f7d62624120c0d34a4a46d045c7f4ab2ec991d9559a8519b8f7930be83b7593d6061ca17aa6c55a91eca7923fc2bbcf8b6a30343417ca31bd9d50c1ddf85e86f7fa69476c8529c06c3f19a9280e48ffa55315d701d8b120d13da8ae18ac09b9";
const APPWRITE_ENDPOINT = "https://appwrite.blackleafdigital.com/v1";
const APPWRITE_PROJECT = "65f31b9f540542961b39";

const appwriteServer = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT)
  .setKey(APPWRITE_API_KEY);
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
