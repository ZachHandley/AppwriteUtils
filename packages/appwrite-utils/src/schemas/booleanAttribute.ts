import { z } from "zod";

export const booleanAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  type: z
    .literal("boolean")
    .describe("The type of the attribute")
    .default("boolean"),
  error: z
    .string()
    .default("Invalid String Attribute Schema")
    .optional()
    .describe("The error message if the attribute is invalid"),
  required: z
    .boolean()
    .default(false)
    .optional()
    .describe("Whether the attribute is required or not"),
  array: z
    .boolean()
    .default(false)
    .optional()
    .describe("Whether the attribute is an array or not"),
  xdefault: z
    .boolean()
    .nullish()
    .describe("The default value of the attribute"),
  description: z
    .string()
    .or(z.record(z.string()))
    .nullish()
    .describe(
      "The description of the attribute, also used for OpenApi Generation"
    ),
});

export type BooleanAttribute = z.infer<typeof booleanAttributeSchema>;
