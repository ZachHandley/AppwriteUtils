import { z } from "zod";

export const enumAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  type: z.literal("enum").describe("The type of the attribute").default("enum"),
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
  elements: z
    .array(z.string())
    .describe("The elements of the enum attribute")
    .default([]),
  xdefault: z.string().nullish().describe("The default value of the attribute"),
  description: z
    .string()
    .or(z.record(z.string()))
    .nullish()
    .describe(
      "The description of the attribute, also used for OpenApi Generation"
    ),
});

export type EnumAttribute = z.infer<typeof enumAttributeSchema>;
