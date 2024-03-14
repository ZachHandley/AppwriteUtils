import { z } from "zod";
import { generateMock } from "@anatine/zod-mock";
import { MembersSchema } from "./members";


export const WordpressMembersSchema = z.object({
  $id: z.string(),
  $createdAt: z.date().or(z.string()),
  $updatedAt: z.date().or(z.string()),
  email: z.string().max(320, "Maximum length of 320 characters exceeded").nullish(),
  member: z.lazy(() => MembersSchema.nullish()),
});

export type WordpressMembers = z.infer<typeof WordpressMembersSchema>;

export const WordpressMembersCreateSchema = WordpressMembersSchema.omit({
  $id: true,
  $createdAt: true,
  $updatedAt: true,
});

export const getWordpressMembersMockData = (numMocks: number = 1) => {
  const mocksGenerated: WordpressMembersCreate[] = [];
  for (let i = 0; i < numMocks; i++) {
    mocksGenerated.push(generateMock(WordpressMembersCreateSchema, { seed: i }));
  }
  return mocksGenerated;
};

export type WordpressMembersCreate = z.infer<typeof WordpressMembersCreateSchema>;

