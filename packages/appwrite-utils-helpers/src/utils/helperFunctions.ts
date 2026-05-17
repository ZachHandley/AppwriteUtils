import {
  AppwriteException,
  type Models,
  type Storage,
} from "node-appwrite";
import fs from "node:fs";
import path from "node:path";
// import type { CollectionImportData } from "../migrations/dataLoader.js"; // CLI-only - commented out
import type { ConfigCollection } from "appwrite-utils";
import { getClientWithAuth } from "../clients/getClientFromConfig.js";
import { toPascalCase, toCamelCase } from "./caseConverters.js";

// Note: toPascalCase and toCamelCase are now imported from caseConverters.js
// Re-export them here for backward compatibility
export { toPascalCase, toCamelCase };

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

// CLI-only function - commented out due to migration dependency
// export const finalizeByAttributeMap = async (
//   appwriteFolderPath: string,
//   collection: ConfigCollection,
//   item: CollectionImportData["data"][number]
// ) => {
//   const schemaFolderPath = path.join(appwriteFolderPath, "schemas");
//   const zodSchema = await import(
//     `${schemaFolderPath}/${toCamelCase(collection.name)}.ts`
//   );
//   return zodSchema.parse({
//     ...item.context,
//     ...item.finalData,
//   });
// };

export let numTimesFailedTotal = 0;

/**
 * Tries to execute the given createFunction and retries up to 5 times if it fails.
 * Only retries on transient errors (network failures, 5xx errors). Does NOT retry validation errors (4xx).
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
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    const errorCode = (error as any).code;

    // Check if this is a validation error that should NOT be retried
    const isValidationError =
      errorCode === 400 || errorCode === 409 || errorCode === 422 ||
      errorMessage.includes("already exists") ||
      errorMessage.includes("attribute with the same key") ||
      errorMessage.includes("invalid") && !errorMessage.includes("fetch failed") ||
      errorMessage.includes("conflict") ||
      errorMessage.includes("bad request");

    // Check if this is a transient error that SHOULD be retried
    const isTransientError =
      errorCode === 522 || errorCode === "522" ||  // Cloudflare error
      errorCode >= 500 && errorCode < 600 ||        // 5xx server errors
      errorMessage.includes("fetch failed") ||      // Network failures
      errorMessage.includes("timeout") ||
      errorMessage.includes("econnrefused") ||
      errorMessage.includes("network error");

    // Only retry if it's a transient error AND not a validation error
    if (isTransientError && !isValidationError) {
      if (errorCode === 522 || errorCode === "522") {
        console.log("Cloudflare error. Retrying...");
      } else {
        console.log(`Fetch failed on attempt ${attemptNum}. Retrying...`);
      }
      numTimesFailedTotal++;
      if (attemptNum > 5) {
        throw error;
      }
      await delay(2500);
      return tryAwaitWithRetry(createFunction, attemptNum + 1);
    }

    // Non-transient errors (validation, permission, malformed request, etc.)
    // always propagate. Previously this branch swallowed the error and
    // returned `Promise.resolve()` when `throwError` was false (the default),
    // which forced every caller into defensive null-checking and masked real
    // failures (401s, permission denied) as "successful undefined results".
    // The `throwError` parameter is retained for API stability but is now a
    // no-op — errors always throw.
    throw error;
  }
};

export const getAppwriteClient = (
  endpoint: string,
  projectId: string,
  apiKey: string
) => {
  return getClientWithAuth(endpoint, projectId, apiKey);
};

export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calculates exponential backoff delay with configurable base and maximum
 *
 * @param retryCount - Current retry attempt number (0-indexed)
 * @param baseDelay - Base delay in milliseconds (default: 2000)
 * @param maxDelay - Maximum delay cap in milliseconds (default: 30000)
 * @returns Calculated delay in milliseconds
 *
 * @example
 * calculateExponentialBackoff(0) // Returns 2000
 * calculateExponentialBackoff(1) // Returns 4000
 * calculateExponentialBackoff(5) // Returns 30000 (capped)
 */
export const calculateExponentialBackoff = (
  retryCount: number,
  baseDelay: number = 2000,
  maxDelay: number = 30000
): number => {
  return Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
};
