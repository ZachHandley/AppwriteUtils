import type { AppwriteResponse } from "../context.js";

/**
 * Convert Hono Response to Appwrite response format
 */
export async function convertWebResponseToAppwrite(
  honoResponse: Response,
  appwriteRes: AppwriteResponse
): Promise<void> {
  const status = honoResponse.status;
  const headers: Record<string, string> = {};

  // Extract headers from Hono response
  honoResponse.headers.forEach((value, key) => {
    headers[key] = value;
  });

  // Get content type to determine response handling
  const contentType = honoResponse.headers.get("content-type") || "";

  try {
    // Handle different response types based on content-type
    if (contentType.includes("application/json")) {
      const data = await honoResponse.json();
      return appwriteRes.json(data, status, headers);
    } else if (contentType.includes("text/")) {
      const text = await honoResponse.text();
      return appwriteRes.text(text, status, headers);
    } else if (contentType.includes("application/octet-stream") || contentType.includes("image/") || contentType.includes("video/")) {
      const arrayBuffer = await honoResponse.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      return appwriteRes.binary(bytes);
    } else {
      // Default to text for unknown content types
      const text = await honoResponse.text();
      return appwriteRes.text(text, status, headers);
    }
  } catch (error) {
    // If response body parsing fails, return empty response
    console.error("Error converting Hono response:", error);
    return appwriteRes.empty();
  }
}

/**
 * Helper function to create common response types for Hono handlers
 */
export class AppwriteResponseHelpers {
  /**
   * Create a JSON response helper
   */
  static json(data: any, status: number = 200, headers?: Record<string, string>) {
    const responseHeaders = new Headers(headers);
    responseHeaders.set("content-type", "application/json");

    return new Response(JSON.stringify(data), {
      status,
      headers: responseHeaders,
    });
  }

  /**
   * Create a text response helper
   */
  static text(text: string, status: number = 200, headers?: Record<string, string>) {
    const responseHeaders = new Headers(headers);
    responseHeaders.set("content-type", "text/plain");

    return new Response(text, {
      status,
      headers: responseHeaders,
    });
  }

  /**
   * Create an HTML response helper
   */
  static html(html: string, status: number = 200, headers?: Record<string, string>) {
    const responseHeaders = new Headers(headers);
    responseHeaders.set("content-type", "text/html");

    return new Response(html, {
      status,
      headers: responseHeaders,
    });
  }

  /**
   * Create a redirect response helper
   */
  static redirect(url: string, status: number = 302) {
    return new Response(null, {
      status,
      headers: {
        location: url,
      },
    });
  }

  /**
   * Create an empty response helper
   */
  static empty(status: number = 204) {
    return new Response(null, { status });
  }
}