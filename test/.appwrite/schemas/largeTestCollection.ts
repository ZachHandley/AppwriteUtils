import { z } from "zod";

export const LargeTestCollectionSchema = z.object({
  $id: z.string(),
  $createdAt: z.string(),
  $updatedAt: z.string(),
  $permissions: z.array(z.string()),
  title: z.string().max(255, "Maximum length of 255 characters exceeded"),
  content: z.string().max(10000, "Maximum length of 10000 characters exceeded").nullish(),
  category: z.string().max(100, "Maximum length of 100 characters exceeded"),
  tags: z.string().max(1000, "Maximum length of 1000 characters exceeded").nullish(),
  isPublished: z.boolean().default(false).nullish(),
  publishedAt: z.date().nullish(),
  viewCount: z.number().int().default(0).nullish(),
  rating: z.number().nullish(),
});

export type LargeTestCollection = z.infer<typeof LargeTestCollectionSchema>;

