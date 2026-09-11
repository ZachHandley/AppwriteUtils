import { z } from "zod";

// Explicit shape (mirrors appwrite-utils-cli/src/schemas/authUser.ts). This used to be
// `z.object<Models.User<Models.Preferences>>()` — the generic only typed an EMPTY shape,
// so `.pick({ email: true, ... })` below picked keys that did not exist. zod < 4.6 let
// that through (and parsing stripped every field); zod 4.6 throws
// `Unrecognized key: "email"` at import, which broke every consumer of this package.
export const AuthUserSchema = z.object({
  $id: z.string(),
  $createdAt: z.string().optional(),
  $updatedAt: z.string().optional(),
  name: z.string().nullish(),
  email: z.string().email("Invalid Email Address").nullish(),
  phone: z.string().nullish(),
  password: z.string().optional(),
  prefs: z.record(z.string(), z.string()).optional().default({}),
  labels: z.array(z.string()).optional().default([]),
});

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
