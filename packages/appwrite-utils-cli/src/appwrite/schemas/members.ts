import { z } from "zod";
import { DogsSchema, type Dogs } from "./dogs";


export const MembersSchemaBase = z.object({
  $id: z.string().optional(),
  $createdAt: z.date().or(z.string()).optional(),
  $updatedAt: z.date().or(z.string()).optional(),
  idOrig: z.string().max(255, "Maximum length of 255 characters exceeded").nullish(),
  dogIds: z.array(z.string().max(255, "Maximum length of 255 characters exceeded")).nullish(),
  profilePhoto: z.string().max(255, "Maximum length of 255 characters exceeded").nullish(),
  profilePhotoTest: z.string().max(255, "Maximum length of 255 characters exceeded").nullish(),
});

export type MembersBase = z.infer<typeof MembersSchemaBase> & {
  dogs?: Dogs[];
};

export const MembersSchema: z.ZodType<MembersBase> = MembersSchemaBase.extend({
  dogs: z.lazy(() => DogsSchema.array().nullish()),
});

export type Members = z.infer<typeof MembersSchema>;

