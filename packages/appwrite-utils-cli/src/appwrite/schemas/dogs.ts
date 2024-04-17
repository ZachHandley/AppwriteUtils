import { z } from "zod";
import { MembersSchema, type Members } from "./members";


export const DogsSchemaBase = z.object({
  $id: z.string().optional(),
  $createdAt: z.date().or(z.string()).optional(),
  $updatedAt: z.date().or(z.string()).optional(),
  name: z.string().max(255, "Maximum length of 255 characters exceeded"),
  breed: z.string().max(255, "Maximum length of 255 characters exceeded").nullish(),
  age: z.number().int().min(0, "Minimum value of 0 not met").max(100, "Maximum value of 100 exceeded").nullish(),
  idOrig: z.string().max(20, "Maximum length of 20 characters exceeded").nullish(),
  ownerIdOrig: z.string().max(255, "Maximum length of 255 characters exceeded").nullish(),
  vetRecords: z.string().max(255, "Maximum length of 255 characters exceeded").nullish(),
  vetRecordIds: z.array(z.string().max(255, "Maximum length of 255 characters exceeded")).nullish(),
});

export type DogsBase = z.infer<typeof DogsSchemaBase> & {
  owner?: Members;
};

export const DogsSchema: z.ZodType<DogsBase> = DogsSchemaBase.extend({
  owner: z.lazy(() => MembersSchema.optional()),
});

export type Dogs = z.infer<typeof DogsSchema>;

