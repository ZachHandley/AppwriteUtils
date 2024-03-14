import { z } from "zod";
import { generateMock } from "@anatine/zod-mock";

export const MembersSchema = z.object({
  $id: z.string(),
  $createdAt: z.date().or(z.string()),
  $updatedAt: z.date().or(z.string()),
  billingAddress: z.string().max(200, "Maximum length of 200 characters exceeded").nullish(),
  member: z.lazy(() => 65f347a1974de66e8989Schema.nullish()),
});

export type Members = z.infer<typeof MembersSchema>;

export const MembersCreateSchema = MembersSchema.omit({
  $id: true,
  $createdAt: true,
  $updatedAt: true,
});

export const getMembersMockData = (numMocks: number = 1) => {
  const mocksGenerated: MembersCreate[] = [];
  for (let i = 0; i < numMocks; i++) {
    mocksGenerated.push(generateMock(MembersCreateSchema, { seed: i }));
  }
  return mocksGenerated;
};

export type MembersCreate = z.infer<typeof MembersCreateSchema>;

