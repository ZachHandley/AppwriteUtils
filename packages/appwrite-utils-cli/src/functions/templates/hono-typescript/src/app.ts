import { Hono } from "hono";
import { Client, Databases, Storage, Users } from "node-appwrite";
import { appwriteMiddleware, requestLogger, errorHandler, appwriteHeaders } from "./middleware/appwrite.js";

// Create the Hono app
export const app = new Hono();

// Global middleware - Applied to all routes
app.use("*", errorHandler());
app.use("*", requestLogger());
app.use("*", appwriteHeaders());

// Helper function to get initialized Appwrite client
function getAppwriteClient(c: any) {
  const appwriteContext = c.get("appwriteContext");

  const client = new Client()
    .setEndpoint(process.env["APPWRITE_FUNCTION_ENDPOINT"]!)
    .setProject(process.env["APPWRITE_FUNCTION_PROJECT_ID"]!)
    .setKey(appwriteContext.req.headers["x-appwrite-key"] || process.env["APPWRITE_FUNCTION_API_KEY"]!);

  return {
    client,
    databases: new Databases(client),
    storage: new Storage(client),
    users: new Users(client),
  };
}

// Routes

// Health check endpoint
app.get("/", (c) => {
  c.log("Health check requested");
  return c.json({
    message: "Hello from {{functionName}} with Hono!",
    functionName: "{{functionName}}",
    timestamp: new Date().toISOString(),
    method: c.req.method,
    path: c.req.path,
    appwriteTrigger: c.appwrite.trigger,
    isAuthenticated: c.appwrite.isUserAuthenticated(),
  });
});

// API health endpoint
app.get("/health", (c) => {
  return c.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    environment: {
      nodeVersion: process.version,
      appwriteEndpoint: process.env["APPWRITE_FUNCTION_ENDPOINT"],
      appwriteProject: process.env["APPWRITE_FUNCTION_PROJECT_ID"],
      appwriteRuntime: process.env["APPWRITE_FUNCTION_RUNTIME_NAME"],
    },
  });
});

// Example API endpoints

// GET /api/user - Get current user info
app.get("/api/user", async (c) => {
  if (!c.appwrite.isUserAuthenticated()) {
    return c.json({ error: "User not authenticated" }, 401);
  }

  try {
    const { users } = getAppwriteClient(c);
    const user = await users.get(c.appwrite.userId!);

    c.log(`Retrieved user info for ${user.email}`);
    return c.json({ user });
  } catch (error) {
    c.error(`Failed to get user: ${error}`);
    return c.json({ error: "Failed to retrieve user" }, 500);
  }
});

// POST /api/webhook - Generic webhook handler
app.post("/api/webhook", async (c) => {
  const data = await c.req.json();

  c.log(`Webhook received: ${JSON.stringify(data)}`);

  // Process webhook data here
  // Example: Save to database, send notifications, etc.

  return c.json({
    message: "Webhook processed successfully",
    received: data,
    timestamp: new Date().toISOString(),
    event: c.appwrite.event,
  });
});

// GET /api/databases - List databases (requires API key)
app.get("/api/databases", async (c) => {
  if (!c.appwrite.isApiKeyRequest()) {
    return c.json({ error: "API key required" }, 401);
  }

  try {
    const { databases } = getAppwriteClient(c);
    const databasesList = await databases.list();

    c.log(`Listed ${databasesList.databases.length} databases`);
    return c.json({ databases: databasesList.databases });
  } catch (error) {
    c.error(`Failed to list databases: ${error}`);
    return c.json({ error: "Failed to list databases" }, 500);
  }
});

// POST /api/data/:databaseId/:collectionId - Create document
app.post("/api/data/:databaseId/:collectionId", async (c) => {
  const databaseId = c.req.param("databaseId");
  const collectionId = c.req.param("collectionId");
  const data = await c.req.json();

  try {
    const { databases } = getAppwriteClient(c);
    const document = await databases.createDocument(
      databaseId,
      collectionId,
      "unique()",
      data
    );

    c.log(`Created document in ${databaseId}/${collectionId}`);
    return c.json({ document }, 201);
  } catch (error) {
    c.error(`Failed to create document: ${error}`);
    return c.json({ error: "Failed to create document" }, 500);
  }
});

// GET /api/data/:databaseId/:collectionId - List documents
app.get("/api/data/:databaseId/:collectionId", async (c) => {
  const databaseId = c.req.param("databaseId");
  const collectionId = c.req.param("collectionId");
  const limit = parseInt(c.req.query("limit") || "25");
  const offset = parseInt(c.req.query("offset") || "0");

  try {
    const { databases } = getAppwriteClient(c);
    const documents = await databases.listDocuments(
      databaseId,
      collectionId,
      undefined,
      limit,
      offset
    );

    c.log(`Listed ${documents.documents.length} documents from ${databaseId}/${collectionId}`);
    return c.json({ documents: documents.documents, total: documents.total });
  } catch (error) {
    c.error(`Failed to list documents: ${error}`);
    return c.json({ error: "Failed to list documents" }, 500);
  }
});

// Handle 404s
app.notFound((c) => {
  c.log(`Route not found: ${c.req.method} ${c.req.path}`);
  return c.json({
    error: "Not Found",
    message: `Route ${c.req.method} ${c.req.path} not found`,
    availableRoutes: [
      "GET /",
      "GET /health",
      "GET /api/user",
      "POST /api/webhook",
      "GET /api/databases",
      "POST /api/data/:databaseId/:collectionId",
      "GET /api/data/:databaseId/:collectionId",
    ],
  }, 404);
});