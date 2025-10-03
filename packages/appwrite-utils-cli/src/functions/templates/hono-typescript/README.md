# {{functionName}} - Hono + Appwrite Function

This is an Appwrite TypeScript function built with the [Hono](https://hono.dev) web framework. Hono provides a fast, lightweight, and modern way to build web APIs with excellent TypeScript support.

## Features

- 🚀 **Ultra-fast routing** with Hono framework
- 🔒 **Built-in Appwrite integration** with context injection
- 📝 **Full TypeScript support** with type safety
- 🛠️ **Comprehensive middleware** for logging, error handling, and Appwrite context
- 🔧 **Request/Response adapters** for seamless integration
- 📊 **Example API endpoints** with database operations

## Project Structure

```
src/
├── index.ts              # Main Appwrite function entry point
├── app.ts                # Hono application with routes
├── context.ts            # Appwrite context type definitions
├── adapters/
│   ├── request.ts        # Appwrite → Hono request conversion
│   └── response.ts       # Hono → Appwrite response conversion
└── middleware/
    └── appwrite.ts       # Appwrite context middleware
```

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Available Routes

- `GET /` - Welcome message with function info
- `GET /health` - Health check endpoint
- `GET /api/user` - Get current authenticated user (requires user session)
- `POST /api/webhook` - Generic webhook handler
- `GET /api/databases` - List databases (requires API key)
- `POST /api/data/:databaseId/:collectionId` - Create document
- `GET /api/data/:databaseId/:collectionId` - List documents

### 3. Development

```bash
npm run dev
```

### 4. Build

```bash
npm run build
```

## Adding New Routes

You can easily add new routes to your Hono app in `src/app.ts`:

```typescript
// GET endpoint
app.get("/api/hello/:name", (c) => {
  const name = c.req.param("name");
  c.log(`Hello endpoint called for ${name}`);

  return c.json({
    message: `Hello, ${name}!`,
    timestamp: new Date().toISOString(),
  });
});

// POST endpoint with JSON body
app.post("/api/items", async (c) => {
  const data = await c.req.json();

  // Access Appwrite context
  const { databases } = getAppwriteClient(c);

  try {
    const document = await databases.createDocument(
      "database-id",
      "collection-id",
      "unique()",
      data
    );

    c.log("Item created successfully");
    return c.json({ item: document }, 201);
  } catch (error) {
    c.error(`Failed to create item: ${error}`);
    return c.json({ error: "Failed to create item" }, 500);
  }
});
```

## Middleware

The template includes several built-in middleware:

### Appwrite Context Middleware
Automatically injects Appwrite context into every Hono request:

```typescript
// Access Appwrite context in any route handler
app.get("/api/example", (c) => {
  const appwriteContext = c.get("appwriteContext");

  // Use Appwrite logging
  c.log("This will appear in Appwrite function logs");
  c.error("This will appear as an error in Appwrite logs");

  // Access Appwrite headers
  const userId = c.appwrite.userId;
  const isAuthenticated = c.appwrite.isUserAuthenticated();

  return c.json({ userId, isAuthenticated });
});
```

### Request Logging
Automatically logs incoming requests and responses with timing:

```
→ GET /api/user
← GET /api/user 200 (45ms)
```

### Error Handling
Catches and properly formats errors:

```typescript
app.get("/api/error-example", (c) => {
  throw new Error("Something went wrong");
  // This will be automatically caught and returned as:
  // { error: "Internal Server Error", message: "Something went wrong", ... }
});
```

## Appwrite Integration

### Authentication

Check if a user is authenticated:

```typescript
app.get("/api/protected", (c) => {
  if (!c.appwrite.isUserAuthenticated()) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const userId = c.appwrite.userId;
  return c.json({ message: `Hello user ${userId}` });
});
```

### API Key Access

Check if request has valid API key:

```typescript
app.get("/api/admin", (c) => {
  if (!c.appwrite.isApiKeyRequest()) {
    return c.json({ error: "API key required" }, 401);
  }

  // Admin operations here
  return c.json({ message: "Admin access granted" });
});
```

### Database Operations

```typescript
app.post("/api/posts", async (c) => {
  const data = await c.req.json();
  const { databases } = getAppwriteClient(c);

  try {
    const post = await databases.createDocument(
      "blog-db",
      "posts",
      "unique()",
      {
        title: data.title,
        content: data.content,
        authorId: c.appwrite.userId,
        createdAt: new Date().toISOString(),
      }
    );

    return c.json({ post }, 201);
  } catch (error) {
    c.error(`Failed to create post: ${error}`);
    return c.json({ error: "Failed to create post" }, 500);
  }
});
```

## Environment Variables

The following environment variables are automatically available:

- `APPWRITE_FUNCTION_ENDPOINT` - Appwrite server endpoint
- `APPWRITE_FUNCTION_PROJECT_ID` - Current project ID
- `APPWRITE_FUNCTION_API_KEY` - Function API key
- `APPWRITE_FUNCTION_ID` - Current function ID
- `APPWRITE_FUNCTION_NAME` - Function name

## Response Types

Hono provides several response helpers:

```typescript
// JSON response
return c.json({ data: "value" });

// Text response
return c.text("Hello World");

// HTML response
return c.html("<h1>Hello</h1>");

// Redirect
return c.redirect("/new-url");

// Custom status
return c.json({ error: "Not found" }, 404);

// Custom headers
return c.json({ data: "value" }, 200, {
  "X-Custom-Header": "value"
});
```

## Advanced Usage

### Custom Middleware

```typescript
const authMiddleware = () => {
  return async (c, next) => {
    const token = c.req.header("Authorization");

    if (!token) {
      return c.json({ error: "Missing token" }, 401);
    }

    // Validate token logic here
    c.set("user", { id: "123", email: "user@example.com" });

    await next();
  };
};

// Apply to specific routes
app.use("/api/protected/*", authMiddleware());
```

### Path Parameters and Query Strings

```typescript
// Path parameters
app.get("/api/users/:id/posts/:postId", (c) => {
  const userId = c.req.param("id");
  const postId = c.req.param("postId");

  return c.json({ userId, postId });
});

// Query parameters
app.get("/api/search", (c) => {
  const query = c.req.query("q");
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "10");

  return c.json({ query, page, limit });
});
```

## Learn More

- [Hono Documentation](https://hono.dev/docs)
- [Appwrite Functions Documentation](https://appwrite.io/docs/functions)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)