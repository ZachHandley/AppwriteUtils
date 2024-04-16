import { z } from "zod";

export const AuthUserSchema = z.object({
  $id: z.string(),
  $createdAt: z.string().optional(),
  $updatedAt: z.string().optional(),
  name: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  prefs: z.record(z.string()).optional().default({}),
  labels: z.array(z.string()).optional().default([]),
});

export type AuthUser = z.infer<typeof AuthUserSchema>;

export const AuthUserCreateSchema = AuthUserSchema.omit({
  $id: true,
}).extend({
  userId: z.string().optional(),
  password: z.string().optional(),
});

export type AuthUserCreate = z.infer<typeof AuthUserCreateSchema>;
