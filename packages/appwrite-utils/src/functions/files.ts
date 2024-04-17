import type { Models } from "appwrite";

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
