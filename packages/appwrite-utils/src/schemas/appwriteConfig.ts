import { z } from "zod";
import { CollectionCreateSchema, Collections } from "./collection";

export const AppwriteConfigSchema = z.object({
  appwriteEndpoint: z.string().default("https://cloud.appwrite.io/v1"),
  appwriteProject: z.string(),
  appwriteKey: z.string(),
  appwriteClient: z.any().or(z.null()).default(null),
  enableDevDatabase: z
    .boolean()
    .optional()
    .default(true)
    .describe("Enable development database alongside production database"),
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
  enableWipeOtherDatabases: z
    .boolean()
    .optional()
    .default(true)
    .describe("Enable wiping other databases"),
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
      })
    )
    .optional()
    .default([
      { $id: "dev", name: "Development" },
      { $id: "main", name: "Main" },
      { $id: "staging", name: "Staging" },
      { $id: "migrations", name: "Migrations" },
    ])
    .describe("Databases to create, $id is the id of the database"),
  collections: z
    .array(CollectionCreateSchema)
    .default([])
    .optional()
    .describe(
      "Collections to create, $id is the id of the collection, it'll always check by collection name and $id for existing before creating another"
    ),
});

export type AppwriteConfig = z.infer<typeof AppwriteConfigSchema>;
export type ConfigCollections = AppwriteConfig["collections"];
export type ConfigCollection = Collections;
export type ConfigDatabases = AppwriteConfig["databases"];
export type ConfigDatabase = ConfigDatabases[number];
