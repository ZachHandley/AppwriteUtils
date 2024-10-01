import path from "path";
import fs from "fs";
import { type AppwriteConfig, type Collection } from "appwrite-utils";
import { register } from "tsx/esm/api"; // Import the register function
import { fileURLToPath } from "node:url";

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
    const configUrl = fileURLToPath(new URL(configPath, import.meta.url));
    const config = (await import(configUrl)).default as AppwriteConfig;

    const collectionsDir = path.join(configDir, "collections");
    const collectionFiles = fs.readdirSync(collectionsDir);

    config.collections = [];

    for (const file of collectionFiles) {
      const filePath = path.join(collectionsDir, file);
      const fileUrl = fileURLToPath(new URL(filePath, import.meta.url));
      const collectionModule = (await import(fileUrl)).default as Collection;
      config.collections.push(collectionModule);
    }

    return config;
  } finally {
    unregister(); // Unregister tsx when done
  }
};
