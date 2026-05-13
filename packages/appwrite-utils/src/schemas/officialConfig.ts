/**
 * @fileoverview Strict Zod schema mirroring the official Appwrite CLI's
 * `appwrite.config.json` format (CLI v20+).
 *
 * The schemas here are intentionally a faithful, STRICT mirror of the source
 * of truth at `lib/commands/config.ts` in `appwrite-cli`. Unknown keys are
 * rejected on every object (`.strict()`), so that AppwriteUtils-specific
 * extensions cannot leak into a file that the official CLI is expected to
 * consume.
 *
 * Where AppwriteUtils already defines a richer schema for the same resource
 * (e.g. `BucketSchema`, `AppwriteFunctionSchema`), we intentionally define a
 * fresh, minimal schema here rather than `.omit()`-ing the extras. The two
 * shapes diverge in non-trivial ways (e.g. `permissions` vs `$permissions`,
 * `dirPath` vs `path`), and reusing them via omit would require many small
 * adjustments that obscure the parity with the official source. Keeping
 * these definitions inline makes the official contract easy to audit.
 *
 * If you need to extend a resource shape with AppwriteUtils-specific fields,
 * do that in `./utilsExtensionConfig.ts` instead.
 */

import { z } from "zod";

// ============================================================================
// Internal Helpers
// ============================================================================

const INT64_MIN = BigInt("-9223372036854775808");
const INT64_MAX = BigInt("9223372036854775807");

/**
 * Reproduces the official CLI's tolerant int64 parser. Accepts bigint,
 * number, numeric string, or objects with a `valueOf`. Bounded to the
 * 64-bit signed integer range.
 */
const int64Schema = z.preprocess(
  (val) => {
    if (typeof val === "bigint") {
      return val;
    }

    if (typeof val === "object" && val !== null) {
      if (typeof (val as { valueOf?: () => unknown }).valueOf === "function") {
        try {
          const valueOfResult = (val as { valueOf: () => unknown }).valueOf();
          const bigIntVal = BigInt(valueOfResult as string | number | bigint);
          return bigIntVal;
        } catch (_e) {
          return undefined;
        }
      }

      const num = Number(val);
      return !isNaN(num) ? BigInt(Math.trunc(num)) : undefined;
    }

    if (typeof val === "string") {
      try {
        return BigInt(val);
      } catch (_e) {
        return undefined;
      }
    }

    if (typeof val === "number") {
      return BigInt(Math.trunc(val));
    }

    return val;
  },
  z
    .bigint()
    .nullable()
    .optional()
    .superRefine((val, ctx) => {
      if (val === undefined || val === null) return;

      if (val < INT64_MIN || val > INT64_MAX) {
        ctx.addIssue({
          code: "custom",
          message: `Value must be between ${INT64_MIN} and ${INT64_MAX} (64-bit signed integer range)`,
        });
      }
    }),
);

const MockNumberSchema = z
  .object({
    phone: z.string(),
    otp: z.string(),
  })
  .strict();

// ============================================================================
// Project Settings
// ============================================================================

export const SettingsSchema = z
  .object({
    services: z
      .object({
        account: z.boolean().optional(),
        avatars: z.boolean().optional(),
        databases: z.boolean().optional(),
        locale: z.boolean().optional(),
        health: z.boolean().optional(),
        storage: z.boolean().optional(),
        teams: z.boolean().optional(),
        users: z.boolean().optional(),
        sites: z.boolean().optional(),
        functions: z.boolean().optional(),
        graphql: z.boolean().optional(),
        messaging: z.boolean().optional(),
      })
      .strict()
      .optional(),
    protocols: z
      .object({
        rest: z.boolean().optional(),
        graphql: z.boolean().optional(),
        websocket: z.boolean().optional(),
      })
      .strict()
      .optional(),
    auth: z
      .object({
        methods: z
          .object({
            jwt: z.boolean().optional(),
            phone: z.boolean().optional(),
            invites: z.boolean().optional(),
            anonymous: z.boolean().optional(),
            "email-otp": z.boolean().optional(),
            "magic-url": z.boolean().optional(),
            "email-password": z.boolean().optional(),
          })
          .strict()
          .optional(),
        security: z
          .object({
            duration: z.union([z.number(), z.bigint()]).optional(),
            limit: z.union([z.number(), z.bigint()]).optional(),
            sessionsLimit: z.union([z.number(), z.bigint()]).optional(),
            passwordHistory: z.union([z.number(), z.bigint()]).optional(),
            passwordDictionary: z.boolean().optional(),
            personalDataCheck: z.boolean().optional(),
            sessionAlerts: z.boolean().optional(),
            mockNumbers: z.array(MockNumberSchema).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

// ============================================================================
// Functions and Sites
// ============================================================================

export const SiteSchema = z
  .object({
    path: z.string().optional(),
    $id: z.string(),
    name: z.string(),
    logging: z.boolean().optional(),
    timeout: z.union([z.number(), z.bigint()]).optional(),
    framework: z.string().optional(),
    buildRuntime: z.string().optional(),
    adapter: z.string().optional(),
    installCommand: z.string().optional(),
    buildCommand: z.string().optional(),
    outputDirectory: z.string().optional(),
    fallbackFile: z.string().optional(),
    buildSpecification: z.string().optional(),
    runtimeSpecification: z.string().optional(),
    deploymentRetention: z.number().optional(),
    startCommand: z.string().optional(),
    vars: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export const FunctionSchema = z
  .object({
    path: z.string().optional(),
    $id: z.string(),
    execute: z.array(z.string()).optional(),
    name: z.string(),
    enabled: z.boolean().optional(),
    logging: z.boolean().optional(),
    runtime: z.string(),
    buildSpecification: z.string().optional(),
    runtimeSpecification: z.string().optional(),
    deploymentRetention: z.number().optional(),
    scopes: z.array(z.string()).optional(),
    events: z.array(z.string()).optional(),
    schedule: z.string().optional(),
    timeout: z.union([z.number(), z.bigint()]).optional(),
    entrypoint: z.string().optional(),
    commands: z.string().optional(),
    vars: z.record(z.string(), z.string()).optional(),
    ignore: z.string().optional(),
  })
  .strict();

// ============================================================================
// Databases (also used for tablesDB)
// ============================================================================

export const DatabaseSchema = z
  .object({
    $id: z.string(),
    name: z.string(),
    enabled: z.boolean().optional(),
  })
  .strict();

// ============================================================================
// Collections (legacy Databases API)
// ============================================================================

export const AttributeSchema = z
  .object({
    key: z.string(),
    type: z.enum([
      "string",
      "text",
      "varchar",
      "mediumtext",
      "longtext",
      "integer",
      "bigint",
      "double",
      "boolean",
      "datetime",
      "relationship",
      "linestring",
      "point",
      "polygon",
    ]),
    required: z.boolean().optional(),
    array: z.boolean().optional(),
    size: z.number().optional(),
    default: z.any().optional(),
    min: int64Schema,
    max: int64Schema,
    format: z
      .union([
        z.enum(["email", "enum", "url", "ip", "datetime"]),
        z.literal(""),
      ])
      .optional(),
    elements: z.array(z.string()).optional(),
    relatedCollection: z.string().optional(),
    relatedTable: z.string().optional(),
    relationType: z.string().optional(),
    twoWay: z.boolean().optional(),
    twoWayKey: z.string().optional(),
    onDelete: z.string().optional(),
    side: z.string().optional(),
    attributes: z.array(z.string()).optional(),
    orders: z.array(z.string()).optional(),
    encrypt: z.boolean().optional(),
  })
  .strict();

export const IndexSchema = z
  .object({
    key: z.string(),
    type: z.string(),
    status: z.string().optional(),
    attributes: z.array(z.string()),
    orders: z.array(z.string()).optional(),
  })
  .strict();

export const CollectionSchema = z
  .object({
    $id: z.string(),
    $permissions: z.array(z.string()).optional(),
    databaseId: z.string(),
    name: z.string(),
    enabled: z.boolean().optional(),
    documentSecurity: z.boolean().default(true),
    attributes: z.array(AttributeSchema).optional(),
    indexes: z.array(IndexSchema).optional(),
  })
  .strict();

// ============================================================================
// Tables (TablesDB)
// ============================================================================

export const ColumnSchema = z
  .object({
    key: z.string(),
    type: z.enum([
      "string",
      "text",
      "varchar",
      "mediumtext",
      "longtext",
      "integer",
      "bigint",
      "double",
      "boolean",
      "datetime",
      "relationship",
      "linestring",
      "point",
      "polygon",
    ]),
    required: z.boolean().optional(),
    array: z.boolean().optional(),
    size: z.number().optional(),
    default: z.any().optional(),
    min: int64Schema,
    max: int64Schema,
    format: z
      .union([
        z.enum(["email", "enum", "url", "ip", "datetime"]),
        z.literal(""),
      ])
      .optional(),
    elements: z.array(z.string()).optional(),
    relatedTable: z.string().optional(),
    relationType: z.string().optional(),
    twoWay: z.boolean().optional(),
    twoWayKey: z.string().optional(),
    onDelete: z.string().optional(),
    side: z.string().optional(),
    columns: z.array(z.string()).optional(),
    orders: z.array(z.string()).optional(),
    encrypt: z.boolean().optional(),
  })
  .strict();

export const IndexTableSchema = z
  .object({
    key: z.string(),
    type: z.string(),
    status: z.string().optional(),
    columns: z.array(z.string()),
    orders: z.array(z.string()).optional(),
  })
  .strict();

export const TableSchema = z
  .object({
    $id: z.string(),
    $permissions: z.array(z.string()).optional(),
    databaseId: z.string(),
    name: z.string(),
    enabled: z.boolean().optional(),
    rowSecurity: z.boolean().default(true),
    columns: z.array(ColumnSchema).optional(),
    indexes: z.array(IndexTableSchema).optional(),
  })
  .strict();

// ============================================================================
// Buckets
// ============================================================================

export const BucketSchema = z
  .object({
    $id: z.string(),
    $permissions: z.array(z.string()).optional(),
    fileSecurity: z.boolean().optional(),
    name: z.string(),
    enabled: z.boolean().optional(),
    maximumFileSize: z.number().optional(),
    allowedFileExtensions: z.array(z.string()).optional(),
    compression: z.string().optional(),
    encryption: z.boolean().optional(),
    antivirus: z.boolean().optional(),
  })
  .strict();

// ============================================================================
// Teams
// ============================================================================

export const TeamSchema = z
  .object({
    $id: z.string(),
    name: z.string(),
  })
  .strict();

// ============================================================================
// Webhooks
// ============================================================================

export const WebhookSchema = z
  .object({
    $id: z.string(),
    name: z.string(),
    url: z.string(),
    events: z.array(z.string()),
    enabled: z.boolean().optional(),
    tls: z.boolean().optional(),
  })
  .strict();

// ============================================================================
// Topics
// ============================================================================

export const TopicSchema = z
  .object({
    $id: z.string(),
    name: z.string(),
    subscribe: z.array(z.string()).optional(),
  })
  .strict();

// ============================================================================
// Messages
// ============================================================================

export const MessageSchema = z
  .object({
    $id: z.string(),
    name: z.string(),
    emailTotal: z.number().optional(),
    smsTotal: z.number().optional(),
    pushTotal: z.number().optional(),
    subscribe: z.array(z.string()).optional(),
  })
  .strict();

// ============================================================================
// Includes (path overrides — same shape as official ConfigIncludesSchema, but
// kept permissive: a free-form record so consumers can list whichever resource
// keys they need without hard-coding the official key list. The official CLI
// enforces additional constraints (path must be relative, etc.) which are
// applied by the CLI itself when it reads the file.)
// ============================================================================

const IncludesSchema = z
  .record(z.string(), z.string())
  .describe(
    "Maps a resource key (e.g. 'collections', 'functions') to a path of a JSON file containing that resource's array. Mirrors the official CLI's `includes` block.",
  );

// ============================================================================
// Top-level Official Config
// ============================================================================

export const AppwriteOfficialConfigSchema = z
  .object({
    projectId: z.string(),
    projectName: z.string().optional(),
    endpoint: z.string().optional(),
    settings: SettingsSchema.optional(),
    includes: IncludesSchema.optional(),
    functions: z.array(FunctionSchema).optional(),
    sites: z.array(SiteSchema).optional(),
    databases: z.array(DatabaseSchema).optional(),
    collections: z.array(CollectionSchema).optional(),
    tablesDB: z.array(DatabaseSchema).optional(),
    tables: z.array(TableSchema).optional(),
    buckets: z.array(BucketSchema).optional(),
    teams: z.array(TeamSchema).optional(),
    webhooks: z.array(WebhookSchema).optional(),
    topics: z.array(TopicSchema).optional(),
    messages: z.array(MessageSchema).optional(),
  })
  .strict();

// ============================================================================
// Type Exports
// ============================================================================

export type AppwriteOfficialConfig = z.infer<typeof AppwriteOfficialConfigSchema>;
export type OfficialSettings = z.infer<typeof SettingsSchema>;
export type OfficialSite = z.infer<typeof SiteSchema>;
export type OfficialFunction = z.infer<typeof FunctionSchema>;
export type OfficialDatabase = z.infer<typeof DatabaseSchema>;
export type OfficialCollection = z.infer<typeof CollectionSchema>;
export type OfficialAttribute = z.infer<typeof AttributeSchema>;
export type OfficialIndex = z.infer<typeof IndexSchema>;
export type OfficialTable = z.infer<typeof TableSchema>;
export type OfficialColumn = z.infer<typeof ColumnSchema>;
export type OfficialTableIndex = z.infer<typeof IndexTableSchema>;
export type OfficialBucket = z.infer<typeof BucketSchema>;
export type OfficialTeam = z.infer<typeof TeamSchema>;
export type OfficialWebhook = z.infer<typeof WebhookSchema>;
export type OfficialTopic = z.infer<typeof TopicSchema>;
export type OfficialMessage = z.infer<typeof MessageSchema>;
