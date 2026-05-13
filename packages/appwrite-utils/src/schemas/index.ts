import { z } from "zod";

export const indexSchema = z.object({
  key: z.string(),
  type: z.enum(["key", "unique", "fulltext"]).optional().default("key"),
  status: z.string().optional(),
  error: z.string().optional(),
  attributes: z.array(z.string()),
  orders: z.array(z.string()).optional(),
});

export const indexesSchema = z.array(indexSchema);

export type Index = z.infer<typeof indexSchema>;
export type Indexes = z.infer<typeof indexesSchema>;

// Re-exports for the new official + utils-extension config schemas.
// These are grouped here so consumers can `import { ... } from
// "appwrite-utils/schemas"` (or the package barrel) without having to know
// the exact filenames.
export * from "./officialConfig.js";
export * from "./utilsExtensionConfig.js";
