import { z } from "zod";
import { Models } from "appwrite";

export const AuthUserSchema = z.object<Models.User<Models.Preferences>>();

export type AuthUser = z.infer<typeof AuthUserSchema>;

export const AuthUserCreateSchema = AuthUserSchema.pick({
  email: true,
  password: true,
  name: true,
  phone: true,
  prefs: true,
  labels: true,
});

export type AuthUserCreate = z.infer<typeof AuthUserCreateSchema>;
