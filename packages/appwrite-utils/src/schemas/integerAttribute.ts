import { z } from "zod";

export const integerAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  type: z
    .literal("integer")
    .describe("The type of the attribute")
    .default("integer"),
  error: z
    .string()
    .describe("The error message if the attribute is invalid")
    .default("Invalid Integer Attribute Schema"),
  required: z
    .boolean()
    .describe("Whether the attribute is required or not")
    .default(false),
  array: z
    .boolean()
    .optional()
    .default(false)
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
});

export type IntegerAttribute = z.infer<typeof integerAttributeSchema>;
