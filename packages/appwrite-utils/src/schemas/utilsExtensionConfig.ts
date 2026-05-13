/**
 * @fileoverview AppwriteUtils sidecar (extension) configuration schema.
 *
 * This schema is a STRICT SUPERSET of the official Appwrite CLI config. It
 * exists so that AppwriteUtils can hold its own per-resource extensions
 * (importDefs, attributeDisplayOrder, deployDir, predeployCommands, etc.)
 * WITHOUT mutating the user's `appwrite.config.json` — the file the official
 * CLI consumes.
 *
 * Two source-of-truth modes for the underlying Appwrite resources:
 *   - referenced: `appwriteConfig` points at an external
 *     `appwrite.config.json` file owned by the official CLI.
 *   - owned: `appwrite` embeds the full official config inline.
 *
 * If both are provided, the inline `appwrite` block wins — see the
 * `appwriteConfig`/`appwrite` descriptions below.
 *
 * The root object intentionally uses `.passthrough()` (NOT `.strict()`) so
 * that users can stuff forward-compatible fields without parser errors. The
 * per-resource extension sub-schemas also default to `passthrough` because
 * we have not yet enumerated all extension fields.
 */

import { z } from "zod";
import { AppwriteOfficialConfigSchema } from "./officialConfig.js";
import { FunctionSchema, SiteSchema } from "./officialConfig.js";
import { importDefSchemas } from "./importDef.js";

// ============================================================================
// Per-resource extension sub-schemas
// ============================================================================
//
// These are intentionally minimal for now. As the AppwriteUtils-specific
// extensions are identified per resource (e.g. `deployDir`,
// `predeployCommands`, `ignore` for functions/sites; `importDefs`,
// `attributeDisplayOrder` for collections/tables), they should be added to
// the appropriate schema below. The `.passthrough()` call ensures that
// users can already put arbitrary fields here today without the parser
// rejecting them.

/**
 * Function-specific extensions (predeployCommands, deployDir, ignore, etc.
 * still to be formalised). Currently passthrough.
 */
export const FunctionExtensionSchema = z
  .object({})
  .passthrough()
  .describe(
    "AppwriteUtils-specific extension fields for an Appwrite function. Currently accepts any keys; will be formalised over time.",
  );

/**
 * Site-specific extensions (predeployCommands, deployDir, ignore, etc.
 * still to be formalised). Currently passthrough.
 */
export const SiteExtensionSchema = z
  .object({})
  .passthrough()
  .describe(
    "AppwriteUtils-specific extension fields for an Appwrite site. Currently accepts any keys; will be formalised over time.",
  );

/**
 * Bucket-specific extensions (currently passthrough).
 */
export const BucketExtensionSchema = z
  .object({})
  .passthrough()
  .describe(
    "AppwriteUtils-specific extension fields for an Appwrite bucket. Currently accepts any keys; will be formalised over time.",
  );

/**
 * Collection-specific extensions. Recognises `importDefs` (typed against the
 * existing `importDefSchemas`) and `attributeDisplayOrder`. Other fields are
 * passed through.
 */
export const CollectionExtensionSchema = z
  .object({
    importDefs: importDefSchemas
      .optional()
      .describe(
        "Import definitions for this collection (existing AppwriteUtils feature).",
      ),
    attributeDisplayOrder: z
      .array(z.string())
      .optional()
      .describe(
        "Preferred display ordering for this collection's attributes (existing AppwriteUtils feature).",
      ),
  })
  .passthrough()
  .describe(
    "AppwriteUtils-specific extension fields for a collection. Known: importDefs, attributeDisplayOrder.",
  );

/**
 * Table-specific extensions. Same shape as `CollectionExtensionSchema`,
 * defined separately so that they can evolve independently.
 */
export const TableExtensionSchema = z
  .object({
    importDefs: importDefSchemas
      .optional()
      .describe(
        "Import definitions for this table (existing AppwriteUtils feature).",
      ),
    attributeDisplayOrder: z
      .array(z.string())
      .optional()
      .describe(
        "Preferred display ordering for this table's attributes/columns (existing AppwriteUtils feature).",
      ),
  })
  .passthrough()
  .describe(
    "AppwriteUtils-specific extension fields for a table. Known: importDefs, attributeDisplayOrder.",
  );

/**
 * Per-function YAML file at `functions/<id>/appwrite-utils.yaml`. Combines
 * the official function shape with our extension fields in one document.
 * Unknown keys pass through (FunctionExtensionSchema is itself passthrough).
 */
export const PerFunctionConfigSchema = z
  .object({
    ...FunctionSchema.shape,
    ...FunctionExtensionSchema.shape,
  })
  .passthrough()
  .describe(
    "Per-function YAML config. Official function fields + AppwriteUtils extensions in one document, keyed by $id.",
  );

/**
 * Per-site YAML file at `sites/<id>/appwrite-utils.yaml`. Same pattern as
 * PerFunctionConfigSchema.
 */
export const PerSiteConfigSchema = z
  .object({
    ...SiteSchema.shape,
    ...SiteExtensionSchema.shape,
  })
  .passthrough()
  .describe(
    "Per-site YAML config. Official site fields + AppwriteUtils extensions in one document, keyed by $id.",
  );

// ============================================================================
// Extension container per resource type
// ============================================================================
//
// Each entry is EITHER:
//   - a string: a relative path to a separate YAML file holding the
//     extensions for that resource type (mirrors the official `includes`
//     semantics, but for our sidecar fields); OR
//   - a record keyed by the resource `$id`, mapping to the per-resource
//     extension shape above.

const recordOrPath = <S extends z.ZodTypeAny>(schema: S) =>
  z.union([z.string(), z.record(z.string(), schema)]);

export const ResourceExtensionsSchema = z
  .object({
    functions: recordOrPath(FunctionExtensionSchema).optional(),
    sites: recordOrPath(SiteExtensionSchema).optional(),
    buckets: recordOrPath(BucketExtensionSchema).optional(),
    collections: recordOrPath(CollectionExtensionSchema).optional(),
    tablesDB: recordOrPath(z.object({}).passthrough()).optional(),
    tables: recordOrPath(TableExtensionSchema).optional(),
    teams: recordOrPath(z.object({}).passthrough()).optional(),
    webhooks: recordOrPath(z.object({}).passthrough()).optional(),
    topics: recordOrPath(z.object({}).passthrough()).optional(),
    messages: recordOrPath(z.object({}).passthrough()).optional(),
  })
  .passthrough()
  .describe(
    "Per-resource extension fields keyed by resource $id (or a path to a YAML file containing them).",
  );

// ============================================================================
// Auth block
// ============================================================================

export const AuthBlockSchema = z
  .object({
    endpoint: z.string().optional(),
    projectId: z.string().optional(),
    apiKey: z.string().optional(),
    authMode: z
      .enum(["apiKey", "session", "auto"])
      .default("auto")
      .describe(
        "Authentication mode: apiKey (use apiKey field), session (use sessionCookie field), or auto (detect at runtime).",
      ),
    sessionCookie: z.string().optional(),
  })
  .passthrough();

// ============================================================================
// Logging block
// ============================================================================

export const LoggingBlockSchema = z
  .object({
    enabled: z.boolean().default(false),
    level: z.enum(["error", "warn", "info", "debug"]).default("info"),
    logDirectory: z.string().optional(),
    console: z.boolean().default(false),
  })
  .passthrough();

// ============================================================================
// Schema/data directory configuration
// ============================================================================

export const SchemaConfigSchema = z
  .object({
    outputDirectory: z.string().default("schemas"),
    yamlSchemaDirectory: z.string().default(".yaml_schemas"),
    importDirectory: z.string().default("importData"),
    collectionsDirectory: z.string().default("collections"),
    tablesDirectory: z.string().default("tables"),
  })
  .passthrough();

// ============================================================================
// Top-level AppwriteUtils Extension Config
// ============================================================================

export const AppwriteUtilsExtensionSchema = z
  .object({
    // ---- Appwrite source of truth ------------------------------------------
    appwriteConfig: z
      .string()
      .optional()
      .describe(
        "Path to an existing appwrite.config.json. Mutually exclusive with `appwrite`; if both are given, `appwrite` wins.",
      ),
    appwrite: AppwriteOfficialConfigSchema.optional().describe(
      "Inline appwrite.config.json. Mutually exclusive with `appwriteConfig`; if both are given, `appwrite` wins.",
    ),

    // ---- Auth ---------------------------------------------------------------
    auth: AuthBlockSchema.optional().describe(
      "Authentication configuration so users don't have to run `appwrite client` separately.",
    ),

    // ---- Per-resource extensions -------------------------------------------
    extensions: ResourceExtensionsSchema.optional().describe(
      "AppwriteUtils-specific extension fields per resource, keyed by $id.",
    ),

    // ---- Project-wide AppwriteUtils settings -------------------------------
    apiMode: z
      .enum(["auto", "legacy", "tablesdb"])
      .default("auto")
      .describe(
        "API mode selection: auto-detect, force legacy Databases API, or force new TablesDB API.",
      ),
    logging: LoggingBlockSchema.optional(),
    enableBackups: z.boolean().default(true),
    backupInterval: z.number().default(3600),
    backupRetention: z.number().default(30),
    enableBackupCleanup: z.boolean().default(true),
    enableMockData: z.boolean().default(false),
    documentBucketId: z.string().default("documents"),
    usersCollectionName: z.string().default("Members"),
    schemaConfig: SchemaConfigSchema.optional(),
  })
  .passthrough()
  .describe(
    "AppwriteUtils sidecar configuration. Holds AppwriteUtils-specific settings and per-resource extensions alongside (referenced) or embedded with (owned) the official Appwrite config.",
  );

// ============================================================================
// Type Exports
// ============================================================================

export type AppwriteUtilsExtension = z.infer<typeof AppwriteUtilsExtensionSchema>;
export type AppwriteUtilsExtensionInput = z.input<typeof AppwriteUtilsExtensionSchema>;
export type AuthBlock = z.infer<typeof AuthBlockSchema>;
export type LoggingBlock = z.infer<typeof LoggingBlockSchema>;
export type ResourceExtensions = z.infer<typeof ResourceExtensionsSchema>;
export type FunctionExtension = z.infer<typeof FunctionExtensionSchema>;
export type SiteExtension = z.infer<typeof SiteExtensionSchema>;
export type BucketExtension = z.infer<typeof BucketExtensionSchema>;
export type CollectionExtension = z.infer<typeof CollectionExtensionSchema>;
export type TableExtension = z.infer<typeof TableExtensionSchema>;
export type PerFunctionConfig = z.infer<typeof PerFunctionConfigSchema>;
export type PerFunctionConfigInput = z.input<typeof PerFunctionConfigSchema>;
export type PerSiteConfig = z.infer<typeof PerSiteConfigSchema>;
export type PerSiteConfigInput = z.input<typeof PerSiteConfigSchema>;
export type SchemaConfigBlock = z.infer<typeof SchemaConfigSchema>;
