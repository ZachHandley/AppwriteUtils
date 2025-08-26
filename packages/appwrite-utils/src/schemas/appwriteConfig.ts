import { z } from "zod";
import {
  CollectionCreateSchema,
  type Collections,
  type Collection,
} from "./collection.js";
import { BucketSchema } from "./bucket.js";
import { AppwriteFunctionSchema } from "./functions.js";

export const AppwriteConfigSchema = z.object({
  appwriteEndpoint: z.string().default("https://cloud.appwrite.io/v1"),
  appwriteProject: z.string(),
  appwriteKey: z.string(),
  appwriteClient: z.any().or(z.null()).default(null),
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
  useMigrations: z
    .boolean()
    .optional()
    .default(true)
    .describe("Enable migrations database for tracking operations and progress"),
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
      "Collections to create, $id is the id of the collection, it'll always check by collection name and $id for existing before creating another"
    ),
  functions: z
    .array(AppwriteFunctionSchema)
    .optional()
    .describe("Functions to create"),
  apiMode: z
    .enum(["auto", "legacy", "tablesdb"])
    .default("auto")
    .describe("API mode selection: auto-detect, force legacy Databases API, or force new TablesDB API"),
  schemaConfig: z
    .object({
      outputDirectory: z.string().default("schemas"),
      yamlSchemaDirectory: z.string().default(".yaml_schemas"),
      importDirectory: z.string().default("importData"),
      collectionsDirectory: z.string().default("collections").describe("Directory name for collections/tables definitions"),
    })
    .optional()
    .describe("Schema and data directory configuration"),
}).transform((data) => {
  // Add migrations database if useMigrations is true
  if (data.useMigrations && data.databases) {
    const hasMigrationsDb = data.databases.some(db => db.$id === "migrations");
    if (!hasMigrationsDb) {
      return {
        ...data,
        databases: [...data.databases, { $id: "migrations", name: "Migrations" }]
      };
    }
  }
  return data;
});

export type AppwriteConfig = z.infer<typeof AppwriteConfigSchema>;
export type ConfigCollections = Collections;
export type ConfigCollection = Collection;
export type ConfigDatabases = AppwriteConfig["databases"];
export type ConfigDatabase = ConfigDatabases[number];
