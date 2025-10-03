import type { AppwriteRequest } from "../context.js";

/**
 * Convert Appwrite request to Web API Request for Hono
 */
export function convertAppwriteToWebRequest(appwriteReq: AppwriteRequest): Request {
  // Construct the URL
  const protocol = appwriteReq.scheme || "https";
  const host = appwriteReq.host || "localhost";
  const port = appwriteReq.port ? `:${appwriteReq.port}` : "";
  const path = appwriteReq.path || "/";
  const queryString = appwriteReq.queryString ? `?${appwriteReq.queryString}` : "";

  const url = `${protocol}://${host}${port}${path}${queryString}`;

  // Prepare headers
  const headers = new Headers();
  if (appwriteReq.headers) {
    Object.entries(appwriteReq.headers).forEach(([key, value]) => {
      if (value) {
        headers.set(key, value);
      }
    });
  }

  // Prepare body for POST/PUT/PATCH requests
  let body: string | undefined;
  if (appwriteReq.method !== "GET" && appwriteReq.method !== "HEAD") {
    if (appwriteReq.bodyText) {
      body = appwriteReq.bodyText;
    } else if (appwriteReq.bodyJson) {
      body = typeof appwriteReq.bodyJson === "string"
        ? appwriteReq.bodyJson
        : JSON.stringify(appwriteReq.bodyJson);
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
    } else if (appwriteReq.body) {
      body = typeof appwriteReq.body === "string"
        ? appwriteReq.body
        : JSON.stringify(appwriteReq.body);
    }
  }

  // Create Web API Request
  const request = new Request(url, {
    method: appwriteReq.method,
    headers,
    body,
  });

  return request;
}

/**
 * Extract path parameters from Hono context for Appwrite compatibility
 */
export function extractPathParams(honoParams: Record<string, string>): Record<string, string> {
  return honoParams;
}

/**
 * Extract query parameters from URL for Appwrite compatibility
 */
export function extractQueryParams(url: string): Record<string, string> {
  const urlObj = new URL(url);
  const params: Record<string, string> = {};

  urlObj.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  return params;
}