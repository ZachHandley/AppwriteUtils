import { z } from "zod";
import { generateMock } from "@anatine/zod-mock";


export const DogsSchemaBase = z.object({
  $id: z.string().optional(),
  $createdAt: z.date().or(z.string()).optional(),
  $updatedAt: z.date().or(z.string()).optional(),
  name: z.string().max(255, "Maximum length of 255 characters exceeded"),
  breed: z.string().max(255, "Maximum length of 255 characters exceeded").nullish(),
  age: z.number().int().min(0, "Minimum value of 0 not met").max(100, "Maximum value of 100 exceeded").nullish(),
  ownerIdOrig: z.string().max(255, "Maximum length of 255 characters exceeded").nullish(),
});

export type DogsBase = z.infer<typeof DogsSchemaBase>;

export const DogsSchema: z.ZodType<DogsBase> = DogsSchemaBase;
export type Dogs = z.infer<typeof DogsSchema>;

export const getDogsMockData = (numMocks: number = 1) => {
  const mocksGenerated: Dogs[] = [];
  for (let i = 0; i < numMocks; i++) {
    mocksGenerated.push(generateMock(DogsSchema, { seed: i }));
  }
  return mocksGenerated;
};

