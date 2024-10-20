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

/**
 * Generates a preview URL for a file based on the provided endpoint, project ID, bucket ID, file ID, and optional JWT.
 * Only works on Image Files with a max of 10 MB file size.
 *
 * @param {string} endpoint - The base URL endpoint.
 * @param {string} projectId - The ID of the project.
 * @param {string} bucketId - The ID of the bucket.
 * @param {string} fileId - The ID of the file.
 * @param {Models.Jwt} [jwt] - Optional JWT object for authentication with Appwrite.
 * @param {Object} [options] - Optional options for the preview
 * @param {number} [options.width] - The width of the preview
 * @param {number} [options.height] - The height of the preview
 * @param {string} [options.gravity] - The gravity of the preview
 * @param {number} [options.quality] - The quality of the preview
 * @param {number} [options.borderWidth] - The border width of the preview
 * @param {string} [options.borderColor] - The border color of the preview
 * @param {number} [options.borderRadius] - The border radius of the preview
 * @param {number} [options.opacity] - The opacity of the preview
 * @param {number} [options.rotation] - The rotation of the preview
 * @param {string} [options.background] - The background of the preview
 * @param {string} [options.output] - The output format of the preview
 * @return {string} The complete preview URL for the file.
 */
export const getFilePreviewUrl = (
  endpoint: string,
  projectId: string,
  bucketId: string,
  fileId: string,
  jwt?: Models.Jwt,
  options?: {
    width?: number;
    height?: number;
    gravity?: string;
    quality?: number;
    borderWidth?: number;
    borderColor?: string;
    borderRadius?: number;
    opacity?: number;
    rotation?: number;
    background?: string;
    output?: string;
  },
) => {
  const queryParams = new URLSearchParams();
  if (options) {
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined && value !== null)
        queryParams.set(key, value.toString());
    });
  }
  return `${endpoint}/storage/buckets/${bucketId}/files/${fileId}/preview?project=${projectId}${
    jwt ? `&jwt=${jwt.jwt}` : ""
  }${queryParams.toString()}`;
};
