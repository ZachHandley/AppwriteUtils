import type { MiddlewareHandler } from "hono";
import type { AppwriteContext } from "../context.js";

// Extend Hono's context to include Appwrite context
declare module "hono" {
  interface ContextVariableMap {
    appwriteContext: AppwriteContext;
  }
}

/**
 * Middleware to inject Appwrite context into Hono
 */
export const appwriteMiddleware = (appwriteContext: AppwriteContext): MiddlewareHandler => {
  return async (c, next) => {
    // Inject Appwrite context into Hono context
    c.set("appwriteContext", appwriteContext);

    // Add logging helper methods to Hono context
    c.log = (message: string) => {
      appwriteContext.log(`[${c.req.method} ${c.req.path}] ${message}`);
    };

    c.error = (message: string) => {
      appwriteContext.error(`[${c.req.method} ${c.req.path}] ${message}`);
    };

    await next();
  };
};

/**
 * Middleware for request logging
 */
export const requestLogger = (): MiddlewareHandler => {
  return async (c, next) => {
    const start = Date.now();
    const appwriteContext = c.get("appwriteContext");

    appwriteContext?.log(`→ ${c.req.method} ${c.req.path}`);

    await next();

    const duration = Date.now() - start;
    appwriteContext?.log(`← ${c.req.method} ${c.req.path} ${c.res.status} (${duration}ms)`);
  };
};

/**
 * Middleware for error handling
 */
export const errorHandler = (): MiddlewareHandler => {
  return async (c, next) => {
    try {
      await next();
    } catch (err) {
      const appwriteContext = c.get("appwriteContext");
      const error = err instanceof Error ? err : new Error(String(err));

      appwriteContext?.error(`Error in ${c.req.method} ${c.req.path}: ${error.message}`);

      return c.json(
        {
          error: "Internal Server Error",
          message: error.message,
          path: c.req.path,
          method: c.req.method,
        },
        500
      );
    }
  };
};

/**
 * Middleware to extract and validate Appwrite headers
 */
export const appwriteHeaders = (): MiddlewareHandler => {
  return async (c, next) => {
    const appwriteContext = c.get("appwriteContext");
    const headers = appwriteContext?.req.headers;

    // Add helpful getters for common Appwrite headers
    c.appwrite = {
      trigger: headers?.["x-appwrite-trigger"] as "http" | "schedule" | "event" | undefined,
      event: headers?.["x-appwrite-event"],
      key: headers?.["x-appwrite-key"],
      userId: headers?.["x-appwrite-user-id"],
      userJwt: headers?.["x-appwrite-user-jwt"],
      countryCode: headers?.["x-appwrite-country-code"],
      continentCode: headers?.["x-appwrite-continent-code"],
      continentEu: headers?.["x-appwrite-continent-eu"],
      isUserAuthenticated: () => !!headers?.["x-appwrite-user-id"],
      isApiKeyRequest: () => !!headers?.["x-appwrite-key"],
    };

    await next();
  };
};

// Extend Hono context to include Appwrite helpers
declare module "hono" {
  interface Context {
    log: (message: string) => void;
    error: (message: string) => void;
    appwrite: {
      trigger?: "http" | "schedule" | "event";
      event?: string;
      key?: string;
      userId?: string;
      userJwt?: string;
      countryCode?: string;
      continentCode?: string;
      continentEu?: string;
      isUserAuthenticated: () => boolean;
      isApiKeyRequest: () => boolean;
    };
  }
}