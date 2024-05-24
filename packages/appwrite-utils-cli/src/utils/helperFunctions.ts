import {
  AppwriteException,
  Client,
  type Models,
  type Storage,
} from "node-appwrite";
import fs from "node:fs";
import path from "node:path";
import type { CollectionImportData } from "../migrations/dataLoader.js";
import type { ConfigCollection } from "appwrite-utils";

export const toPascalCase = (str: string): string => {
  return (
    str
      // Split the string into words on spaces or camelCase transitions
      .split(/(?:\s+)|(?:([A-Z][a-z]+))/g)
      // Filter out empty strings that can appear due to the split regex
      .filter(Boolean)
      // Capitalize the first letter of each word and join them together
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join("")
  );
};

export const toCamelCase = (str: string): string => {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) =>
      index === 0 ? word.toLowerCase() : word.toUpperCase()
    )
    .replace(/\s+/g, "");
};

export const ensureDirectoryExistence = (filePath: string) => {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
};

export const writeFileSync = (
  filePath: string,
  content: string,
  options: { flag: string }
) => {
  ensureDirectoryExistence(filePath);
  fs.writeFileSync(filePath, content, options);
};

export const readFileSync = (filePath: string) => {
  return fs.readFileSync(filePath, "utf8");
};

export const existsSync = (filePath: string) => {
  return fs.existsSync(filePath);
};

export const mkdirSync = (filePath: string) => {
  ensureDirectoryExistence(filePath);
  fs.mkdirSync(filePath);
};

export const readdirSync = (filePath: string) => {
  return fs.readdirSync(filePath);
};

export const areCollectionNamesSame = (a: string, b: string) => {
  return (
    a.toLowerCase().trim().replace(" ", "") ===
    b.toLowerCase().trim().replace(" ", "")
  );
};

/**
 * Generates the view URL for a specific file based on the provided endpoint, project ID, bucket ID, file ID, and optional JWT token.
 *
 * @param {string} endpoint - the base URL endpoint
 * @param {string} projectId - the ID of the project
 * @param {string} bucketId - the ID of the bucket
 * @param {string} fileId - the ID of the file
 * @param {Models.Jwt} [jwt] - optional JWT token generated via the Appwrite SDK
 * @return {string} the generated view URL for the file
 */
export const getFileViewUrl = (
  endpoint: string,
  projectId: string,
  bucketId: string,
  fileId: string,
  jwt?: Models.Jwt
) => {
  return `${endpoint}/storage/buckets/${bucketId}/files/${fileId}/view?project=${projectId}${
    jwt ? `&jwt=${jwt.jwt}` : ""
  }`;
};

/**
 * Generates a download URL for a file based on the provided endpoint, project ID, bucket ID, file ID, and optionally a JWT.
 *
 * @param {string} endpoint - The base URL endpoint.
 * @param {string} projectId - The ID of the project.
 * @param {string} bucketId - The ID of the bucket.
 * @param {string} fileId - The ID of the file.
 * @param {Models.Jwt} [jwt] - Optional JWT object for authentication with Appwrite.
 * @return {string} The complete download URL for the file.
 */
export const getFileDownloadUrl = (
  endpoint: string,
  projectId: string,
  bucketId: string,
  fileId: string,
  jwt?: Models.Jwt
) => {
  return `${endpoint}/storage/buckets/${bucketId}/files/${fileId}/download?project=${projectId}${
    jwt ? `&jwt=${jwt.jwt}` : ""
  }`;
};

export const finalizeByAttributeMap = async (
  appwriteFolderPath: string,
  collection: ConfigCollection,
  item: CollectionImportData["data"][number]
) => {
  const schemaFolderPath = path.join(appwriteFolderPath, "schemas");
  const zodSchema = await import(
    `${schemaFolderPath}/${toCamelCase(collection.name)}.ts`
  );
  return zodSchema.parse({
    ...item.context,
    ...item.finalData,
  });
};

export let numTimesFailedTotal = 0;

/**
 * Tries to execute the given createFunction and retries up to 5 times if it fails.
 *
 * @param {() => Promise<any>} createFunction - The function to be executed.
 * @param {number} [attemptNum=0] - The number of attempts made so far (default: 0).
 * @return {Promise<any>} - A promise that resolves to the result of the createFunction or rejects with an error if it fails after 5 attempts.
 */
export const tryAwaitWithRetry = async <T>(
  createFunction: () => Promise<T>,
  attemptNum: number = 0,
  throwError: boolean = false
): Promise<T> => {
  try {
    return await createFunction();
  } catch (error) {
    if (
      error instanceof AppwriteException &&
      (error.message.toLowerCase().includes("fetch failed") ||
        error.message.toLowerCase().includes("server error"))
    ) {
      numTimesFailedTotal++;
      console.log(`Fetch failed on attempt ${attemptNum}. Retrying...`);
      if (attemptNum > 5) {
        throw error;
      }
      return tryAwaitWithRetry(createFunction, attemptNum + 1);
    }
    if (throwError) {
      throw error;
    }
    // @ts-ignore
    return Promise.resolve();
  }
};

export const getAppwriteClient = (
  endpoint: string,
  projectId: string,
  apiKey: string
) => {
  return new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);
};
