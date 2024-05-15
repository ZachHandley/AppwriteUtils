import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
extendZodWithOpenApi(z);

export const AuthUserSchema = z
  .object({
    $id: z
      .string()
      .openapi({ description: "The unique identifier for the user" }),
    $createdAt: z
      .string()
      .optional()
      .openapi({ description: "Creation timestamp" }),
    $updatedAt: z
      .string()
      .optional()
      .openapi({ description: "Update timestamp" }),
    name: z.string().nullish().openapi({ description: "The user's name" }),
    email: z
      .string()
      .nullish()
      .openapi({ description: "The user's email address" }),
    phone: z
      .string()
      .nullish()
      .openapi({ description: "The user's phone number" }),
    prefs: z.record(z.string()).optional().default({}).openapi({
      description: "User preferences, key-value pairs up to 16KB in size",
    }),
    labels: z
      .array(z.string())
      .optional()
      .default([])
      .openapi({ description: "User labels" }),
    password: z.string().optional().openapi({
      description:
        "Optional password, also used for the user to update their own account",
    }),
  })
  .openapi("AuthUser");

export type AuthUser = z.infer<typeof AuthUserSchema>;

export const AuthUserCreateSchema = AuthUserSchema.omit({
  $id: true,
})
  .extend({
    userId: z.string().optional().openapi({
      description: "Optional user ID, auto generated if not provided",
    }),
    password: z.string().optional().openapi({
      description: "Optional password",
    }),
  })
  .openapi("AuthUserCreate");

export type AuthUserCreate = z.infer<typeof AuthUserCreateSchema>;
