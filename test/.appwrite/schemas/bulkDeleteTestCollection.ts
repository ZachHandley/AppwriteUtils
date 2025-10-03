import { z } from "zod";

export const BulkDeleteTestCollectionSchema = z.object({
  $id: z.string(),
  $createdAt: z.string(),
  $updatedAt: z.string(),
  $permissions: z.array(z.string()),
  batchId: z.string().max(50, "Maximum length of 50 characters exceeded"),
  recordNumber: z.number().int(),
  testData: z.string().max(500, "Maximum length of 500 characters exceeded").nullish(),
  createdBatch: z.date(),
});

export type BulkDeleteTestCollection = z.infer<typeof BulkDeleteTestCollectionSchema>;

