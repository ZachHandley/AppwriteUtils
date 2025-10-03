import { z } from "zod";

/**
 * Appwrite Request Headers Schema
 */
export const AppwriteHeadersSchema = z.object({
    "x-appwrite-trigger": z.enum(["http", "schedule", "event"]).optional(),
    "x-appwrite-event": z.string().optional(),
    "x-appwrite-key": z.string().optional(),
    "x-appwrite-user-id": z.string().optional(),
    "x-appwrite-user-jwt": z.string().optional(),
    "x-appwrite-country-code": z.string().optional(),
    "x-appwrite-continent-code": z.string().optional(),
    "x-appwrite-continent-eu": z.string().optional(),
}).catchall(z.string()); // Allow additional headers

/**
 * Appwrite Environment Variables Schema
 */
export const AppwriteEnvSchema = z.object({
    APPWRITE_FUNCTION_API_ENDPOINT: z.string(),
    APPWRITE_VERSION: z.string(),
    APPWRITE_REGION: z.string(),
    APPWRITE_FUNCTION_API_KEY: z.string().optional(),
    APPWRITE_FUNCTION_ID: z.string(),
    APPWRITE_FUNCTION_NAME: z.string(),
    APPWRITE_FUNCTION_DEPLOYMENT: z.string(),
    APPWRITE_FUNCTION_PROJECT_ID: z.string(),
    APPWRITE_FUNCTION_RUNTIME_NAME: z.string(),
    APPWRITE_FUNCTION_RUNTIME_VERSION: z.string(),
});

/**
 * Appwrite Request Schema (full version from docs)
 */
export const AppwriteRequestSchema = z.object({
    bodyText: z.string().optional(),
    bodyJson: z.union([z.any(), z.string()]).transform((t) => {
        if (typeof t === "string") {
            try {
                return JSON.parse(t);
            } catch {
                return null;
            }
        }
        return t;
    }).optional(),
    body: z.any().optional(),
    headers: AppwriteHeadersSchema,
    scheme: z.enum(["http", "https"]).optional(),
    method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]),
    url: z.string().optional(),
    host: z.string().optional(),
    port: z.number().or(z.string()).optional(),
    path: z.string().optional(),
    queryString: z.string().optional(),
    query: z.record(z.string(), z.any()).optional(),
    variables: z.record(z.string(), z.any()).optional(),
    text: z.any().optional(),
    payload: z.string().optional(),
});

/**
 * Appwrite Response Schema
 */
export const AppwriteResponseSchema = z.object({
    json: z.any(),
    text: z.any(),
    empty: z.any().optional(),
    binary: z.any().optional(),
    redirect: z.any().optional(),
});

/**
 * Log Function Schema - Simple function type
 */
export const AppwriteLogSchema = z.any();

/**
 * Error Function Schema - Simple function type
 */
export const AppwriteErrorSchema = z.any();

/**
 * Complete Appwrite Context Schema
 */
export const AppwriteContextSchema = z.object({
    req: AppwriteRequestSchema,
    res: AppwriteResponseSchema,
    log: AppwriteLogSchema,
    error: AppwriteErrorSchema,
});

/**
 * Type inference helpers
 */
export type AppwriteHeaders = z.infer<typeof AppwriteHeadersSchema>;
export type AppwriteEnv = z.infer<typeof AppwriteEnvSchema>;
export type AppwriteRequest = z.infer<typeof AppwriteRequestSchema>;
export type AppwriteResponse = z.infer<typeof AppwriteResponseSchema>;
export type AppwriteLog = z.infer<typeof AppwriteLogSchema>;
export type AppwriteError = z.infer<typeof AppwriteErrorSchema>;
export type AppwriteContext = z.infer<typeof AppwriteContextSchema>;