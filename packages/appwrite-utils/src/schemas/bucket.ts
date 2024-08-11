import { type Models, Compression } from "node-appwrite";
import { z } from "zod";
import { permissionsSchema } from "./permissions.js";

export const BucketSchema = z.object({
  $id: z.string(),
  name: z.string(),
  permissions: permissionsSchema.optional(),
  fileSecurity: z.boolean().optional(),
  enabled: z.boolean().optional(),
  maximumFileSize: z.number().optional(),
  allowedFileExtensions: z.array(z.string()).optional(),
  compression: z.enum(["none", "gzip", "zstd"]).optional(),
  encryption: z.boolean().optional(),
  antivirus: z.boolean().optional(),
});

export type Bucket = z.infer<typeof BucketSchema>;
