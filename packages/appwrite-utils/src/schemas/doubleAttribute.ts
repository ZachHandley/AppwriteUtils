import { z } from "zod";

// Base schema for shared properties between double and float
const baseFloatDoubleSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  error: z
    .string()
    .default("Invalid Numeric Attribute Schema")
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
  min: z.number().optional().describe("The minimum value of the attribute"),
  max: z.number().optional().describe("The maximum value of the attribute"),
  xdefault: z.number().nullish().describe("The default value of the attribute"),
  description: z
    .string()
    .or(z.record(z.string()))
    .nullish()
    .describe(
      "The description of the attribute, also used for OpenApi Generation"
    ),
});

// Double attribute schema (preferred)
export const doubleAttributeSchema = baseFloatDoubleSchema.extend({
  type: z
    .literal("double")
    .describe("The type of the attribute")
    .default("double"),
});

// Float attribute schema (backwards compatibility)
export const floatAttributeSchema = baseFloatDoubleSchema.extend({
  type: z
    .literal("float")
    .describe("The type of the attribute (backwards compatibility)")
    .default("float"),
});

export type DoubleAttribute = z.infer<typeof doubleAttributeSchema>;
export type FloatAttribute = z.infer<typeof floatAttributeSchema>;