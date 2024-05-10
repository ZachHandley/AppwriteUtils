import { z } from "zod";

export const integerAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  type: z
    .literal("integer")
    .describe("The type of the attribute")
    .default("integer"),
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
  min: z
    .number()
    .int()
    .optional()
    .describe("The minimum value of the attribute"),
  max: z
    .number()
    .int()
    .optional()
    .describe("The maximum value of the attribute"),
  xdefault: z
    .number()
    .int()
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

export type IntegerAttribute = z.infer<typeof integerAttributeSchema>;
