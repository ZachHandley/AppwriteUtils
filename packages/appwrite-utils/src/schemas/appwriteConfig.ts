/**
 * @fileoverview Appwrite Configuration Schema with Dual API Support
 *
 * This module provides comprehensive configuration schemas that support both:
 * - Collections API (legacy Databases service): Uses `collections`, `documents`, `attributes`
 * - TablesDB API (new TablesDB service): Uses `tables`, `rows`, `columns`
 *
 * The schema automatically detects API mode and provides helper functions for
 * directory resolution and dual terminology support.
 *
 * @example
 * ```typescript
 * // Collections API Configuration
 * const collectionsConfig = {
 *   appwriteEndpoint: "https://cloud.appwrite.io/v1",
 *   appwriteProject: "project-id",
 *   appwriteKey: "api-key",
 *   collections: [
 *     { name: "Users", attributes: [...] }
 *   ]
 * };
 *
 * // TablesDB API Configuration
 * const tablesConfig = {
 *   appwriteEndpoint: "https://cloud.appwrite.io/v1",
 *   appwriteProject: "project-id",
 *   appwriteKey: "api-key",
 *   tables: [
 *     { name: "Users", attributes: [...] }
 *   ]
 * };
 * ```
 */

import { z } from "zod";
import {
  CollectionCreateSchema,
  type Collections,
  type Collection,
} from "./collection.js";
import {
  TableCreateSchema,
  type Tables,
  type Table,
} from "./table.js";
import { BucketSchema } from "./bucket.js";
import { AppwriteFunctionSchema } from "./functions.js";
import { AppwriteSiteSchema } from "./sites.js";

export const AppwriteConfigSchema = z.object({
  appwriteEndpoint: z.string().default("https://cloud.appwrite.io/v1"),
  appwriteProject: z.string(),
  appwriteKey: z.string().optional(),
  /**
   * Appwrite client instance (supports both browser and Node.js clients)
   * @deprecated Will be properly typed in future versions
   */
  appwriteClient: z.any().or(z.null()).default(null),

  /** Session cookie for session-based authentication */
  sessionCookie: z.string().optional().describe("Session cookie for authentication (alternative to API key)"),

  /** Authentication method preference */
  authMethod: z.enum(["session", "apikey", "auto"])
    .optional()
    .default("auto")
    .describe("Authentication method: 'session' for session auth, 'apikey' for API key, 'auto' for automatic detection"),

  /** Session metadata for context and validation */
  sessionMetadata: z.object({
    email: z.string().optional().describe("Email associated with the session"),
    expiresAt: z.string().optional().describe("Session expiration timestamp (ISO string)"),
  }).optional().describe("Metadata about the current session"),

  /**
   * Project ID key in ~/.appwrite/prefs.json for session lookup
   *
   * When a user's config project ID doesn't exist in prefs.json but there are
   * sessions for other projects on the same endpoint, we test those sessions
   * and cache the working one's project ID key here. On subsequent runs, we use
   * this saved key to look up the session directly from prefs.json.
   */
  sessionProjectId: z.string().optional().describe("Project ID key in prefs.json for session lookup"),
  logging: z
    .object({
      enabled: z.boolean().default(false).describe("Enable file logging"),
      level: z
        .enum(["error", "warn", "info", "debug"])
        .default("info")
        .describe("Logging level"),
      logDirectory: z
        .string()
        .optional()
        .describe("Custom log directory path (default: ./zlogs)"),
      console: z.boolean().default(false).describe("Enable console logging"),
    })
    .optional()
    .default({
      enabled: false,
      level: "info",
      console: false,
    })
    .describe("Logging configuration"),
  enableBackups: z.boolean().default(true).describe("Enable backups"),
  backupInterval: z
    .number()
    .optional()
    .default(3600)
    .describe("Backup interval in seconds"),
  backupRetention: z.number().default(30).describe("Backup retention in days"),
  enableBackupCleanup: z
    .boolean()
    .optional()
    .default(true)
    .describe("Enable backup cleanup"),
  enableMockData: z.boolean().default(false).describe("Enable mock data"),
  documentBucketId: z
    .string()
    .optional()
    .default("documents")
    .describe("Documents bucket id for imported documents"),
  usersCollectionName: z
    .string()
    .optional()
    .default("Members")
    .describe(
      "Users collection name for any overflowing data associated with users, will try to match one of the collections by name"
    ),
  databases: z
    .array(
      z.object({
        $id: z.string(),
        name: z.string(),
        bucket: BucketSchema.optional(),
      })
    )
    .optional()
    .default([
      { $id: "dev", name: "Development" },
      { $id: "main", name: "Main" },
      { $id: "staging", name: "Staging" },
    ])
    .describe("Databases to create, $id is the id of the database"),

  buckets: z
    .array(BucketSchema)
    .optional()
    .default([])
    .describe("Global buckets to create across all databases"),
  collections: z
    .array(CollectionCreateSchema)
    .default([])
    .optional()
    .describe(
      "Collections to create using the legacy Databases API. Uses 'collections', 'documents', 'attributes' terminology. Cannot be used simultaneously with 'tables' field."
    ),
  tables: z
    .array(TableCreateSchema)
    .default([])
    .optional()
    .describe(
      "Tables to create using the new TablesDB API. Uses 'tables', 'rows', 'columns' terminology. Cannot be used simultaneously with 'collections' field."
    ),
  functions: z
    .array(AppwriteFunctionSchema)
    .optional()
    .describe("Functions to create"),
  sites: z
    .array(AppwriteSiteSchema)
    .optional()
    .describe("Sites to create"),
  apiMode: z
    .enum(["auto", "legacy", "tablesdb"])
    .default("auto")
    .describe("API mode selection: auto-detect, force legacy Databases API, or force new TablesDB API"),
  schemaConfig: z
    .object({
      outputDirectory: z.string().default("schemas"),
      yamlSchemaDirectory: z.string().default(".yaml_schemas"),
      importDirectory: z.string().default("importData"),
      collectionsDirectory: z.string().default("collections").describe("Directory name for legacy collections definitions"),
      tablesDirectory: z.string().default("tables").describe("Directory name for TablesDB table definitions"),
    })
    .optional()
    .describe("Schema and data directory configuration"),
}).transform((data) => {
  // Auto-detect authentication method if set to 'auto'
  if (data.authMethod === 'auto') {
    if (data.sessionCookie) {
      // Session cookie provided, prefer session auth
      data.authMethod = 'session';
    } else if (data.appwriteKey) {
      // API key provided, use API key auth
      data.authMethod = 'apikey';
    }
    // If neither provided, leave as 'auto' for runtime detection
  }

  // Validate authentication consistency
  if (data.authMethod === 'session' && !data.sessionCookie) {
    throw new Error("Session authentication method selected but no sessionCookie provided");
  }

  if (data.authMethod === 'apikey' && !data.appwriteKey) {
    throw new Error("API key authentication method selected but no appwriteKey provided");
  }

  return data;
});

export type AppwriteConfig = z.infer<typeof AppwriteConfigSchema>;
export type ConfigCollections = Collections;
export type ConfigCollection = Collection;
export type ConfigTables = Tables;
export type ConfigTable = Table;
export type ConfigDatabases = AppwriteConfig["databases"];
export type ConfigDatabase = ConfigDatabases[number];
