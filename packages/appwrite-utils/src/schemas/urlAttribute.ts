import { z } from "zod";

export const urlAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  type: z.literal("url").describe("The type of the attribute").default("url"),
  error: z
    .string()
    .describe("The error message if the attribute is invalid")
    .default("Invalid URL Attribute Schema"),
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

export type UrlAttribute = z.infer<typeof urlAttributeSchema>;
