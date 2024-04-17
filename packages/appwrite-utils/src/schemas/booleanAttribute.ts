import { z } from "zod";

export const booleanAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  type: z
    .literal("boolean")
    .describe("The type of the attribute")
    .default("boolean"),
  error: z
    .string()
    .describe("The error message if the attribute is invalid")
    .default("Invalid Boolean Attribute Schema"),
  required: z
    .boolean()
    .describe("Whether the attribute is required or not")
    .default(false),
  array: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether the attribute is an array or not"),
  xdefault: z
    .boolean()
    .nullish()
    .describe("The default value of the attribute"),
});

export type BooleanAttribute = z.infer<typeof booleanAttributeSchema>;
