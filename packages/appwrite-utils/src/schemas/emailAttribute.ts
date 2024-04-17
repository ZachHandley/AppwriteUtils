import { z } from "zod";

export const emailAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  type: z
    .literal("email")
    .describe("The type of the attribute")
    .default("email"),
  error: z
    .string()
    .describe("The error message if the attribute is invalid")
    .default("Invalid Email Attribute Schema"),
  required: z
    .boolean()
    .describe("Whether the attribute is required or not")
    .default(false),
  array: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether the attribute is an array or not"),
  xdefault: z.string().nullish().describe("The default value of the attribute"),
});

export type EmailAttribute = z.infer<typeof emailAttributeSchema>;
