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
