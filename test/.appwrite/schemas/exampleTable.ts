import { z } from "zod";

export const ExampleTableSchema = z.object({
  $id: z.string(),
  $createdAt: z.string(),
  $updatedAt: z.string(),
  $permissions: z.array(z.string()),
});

export type ExampleTable = z.infer<typeof ExampleTableSchema>;

