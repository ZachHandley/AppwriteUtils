import { z } from "zod";

export const ExampleCollectionSchema = z.object({
  $id: z.string(),
  $createdAt: z.string(),
  $updatedAt: z.string(),
  $permissions: z.array(z.string()),
  title: z.string().max(255, "Maximum length of 255 characters exceeded"),
  description: z.string().max(1000, "Maximum length of 1000 characters exceeded").nullish(),
  isActive: z.boolean().default(true).nullish(),
  someInt: z.number().int().min(0, "Minimum value of 0 not met").default(0).nullish(),
  someDouble: z.number().default(0).nullish(),
});

export type ExampleCollection = z.infer<typeof ExampleCollectionSchema>;

