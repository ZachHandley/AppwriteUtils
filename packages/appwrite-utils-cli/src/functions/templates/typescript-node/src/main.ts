import { Client } from "node-appwrite";
import { AppwriteContext, AppwriteContextSchema } from "./context.js";

export default async function (context: AppwriteContext) {
  const { req, res, log, error } = context;

  // Optional: Validate the context using Zod schema
  try {
    AppwriteContextSchema.parse(context);
    log("Context validation successful");
  } catch (validationError) {
    error(`Context validation failed: ${validationError}`);
  }

  const client = new Client()
    .setEndpoint(process.env["APPWRITE_FUNCTION_ENDPOINT"]!)
    .setProject(process.env["APPWRITE_FUNCTION_PROJECT_ID"]!)
    .setKey(req.headers["x-appwrite-key"] || "");

  log(`Processing ${req.method} request to ${req.path}`);

  return res.json({
    message: "Hello from TypeScript function!",
    functionName: "{{functionName}}",
    method: req.method,
    path: req.path,
    headers: req.headers,
  });
}
