import { z } from "zod";

export const requestSchema = z.object({
  databaseId: z.string(),
  collectionId: z.string(),
  queries: z.array(z.string()).optional(),
});

export type Request = z.infer<typeof requestSchema>;