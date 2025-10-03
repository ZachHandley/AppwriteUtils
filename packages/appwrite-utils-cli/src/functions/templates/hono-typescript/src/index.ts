import { app } from "./app.js";
import { AppwriteContext, AppwriteContextSchema } from "./context.js";
import { convertAppwriteToWebRequest } from "./adapters/request.js";
import { convertWebResponseToAppwrite } from "./adapters/response.js";
import { appwriteMiddleware } from "./middleware/appwrite.js";

/**
 * Main Appwrite function entry point
 * This function receives the Appwrite context and routes it through Hono
 */
export default async function (context: AppwriteContext) {
  const { req, res, log, error } = context;

  try {
    // Optional: Validate the context using Zod schema
    AppwriteContextSchema.parse(context);
    log("Context validation successful");

    // Add Appwrite context middleware to the Hono app
    app.use("*", appwriteMiddleware(context));

    // Convert Appwrite request to Web API Request for Hono
    const webRequest = convertAppwriteToWebRequest(req);

    log(`Processing ${req.method} request to ${req.path || "/"}`);

    // Create execution environment for Hono
    const env = {
      // Add any environment variables or context needed by Hono
      APPWRITE_FUNCTION_ENDPOINT: process.env["APPWRITE_FUNCTION_ENDPOINT"],
      APPWRITE_FUNCTION_PROJECT_ID: process.env["APPWRITE_FUNCTION_PROJECT_ID"],
      APPWRITE_FUNCTION_API_KEY: process.env["APPWRITE_FUNCTION_API_KEY"],
    };

    // Process request through Hono app
    const honoResponse = await app.fetch(webRequest, env);

    // Convert Hono response back to Appwrite response format
    await convertWebResponseToAppwrite(honoResponse, res);

    log(`Request completed with status ${honoResponse.status}`);

  } catch (validationError) {
    error(`Function execution failed: ${validationError}`);

    // Return error response
    return res.json({
      error: "Function execution failed",
      message: validationError instanceof Error ? validationError.message : String(validationError),
      functionName: "{{functionName}}",
      timestamp: new Date().toISOString(),
    }, 500);
  }
}