import path from "path";
import fs from "fs";
import { type AppwriteConfig, type Collection } from "appwrite-utils";
import { register } from "tsx/esm/api"; // Import the register function
import { pathToFileURL } from "node:url";

/**
 * Recursively searches for a file named 'appwriteConfig.ts' starting from the given directory.
 * @param dir The directory to start the search from.
 * @returns The path to the file if found, or null if not found.
 */
export const findAppwriteConfig = (dir: string): string | null => {
  if (dir === "node_modules") {
    return null;
  }
  const files = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    if (file.isDirectory() && file.name !== "node_modules") {
      const result = findAppwriteConfig(path.join(dir, file.name));
      if (result) return result;
    } else if (file.name === "appwriteConfig.ts") {
      return path.join(dir, file.name);
    }
  }

  return null;
};

/**
 * Loads the Appwrite configuration and all collection configurations from a specified directory.
 * @param configDir The directory containing the appwriteConfig.ts and collections folder.
 * @returns The loaded Appwrite configuration including collections.
 */
export const loadConfig = async (
  configDir: string
): Promise<AppwriteConfig> => {
  const unregister = register(); // Register tsx enhancement

  try {
    const configPath = path.join(configDir, "appwriteConfig.ts");
    console.log(`Loading config from: ${configPath}`);
    const configUrl = pathToFileURL(configPath).href;
    const configModule = (await import(configUrl));
    const config: AppwriteConfig | undefined = configModule.default?.default || configModule.default || configModule;
    if (!config) {
      throw new Error("Failed to load config");
    }
    const collectionsDir = path.join(configDir, "collections");
    const collectionFiles = fs.readdirSync(collectionsDir);

    config.collections = [];

    for (const file of collectionFiles) {
      if (file === "index.ts") {
        continue;
      }
      const filePath = path.join(collectionsDir, file);
      const fileUrl = pathToFileURL(filePath).href;
      const collectionModule = (await import(fileUrl));
      const collection: Collection | undefined = collectionModule.default?.default || collectionModule.default || collectionModule;
      if (collection) {
        config.collections.push(collection);
      }
    }

    return config;
  } finally {
    unregister(); // Unregister tsx when done
  }
};
