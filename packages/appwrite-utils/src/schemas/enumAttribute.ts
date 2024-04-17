import { z } from "zod";

export const enumAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  type: z.literal("enum").describe("The type of the attribute").default("enum"),
  error: z
    .string()
    .describe("The error message if the attribute is invalid")
    .default("Invalid Enum Attribute Schema"),
  required: z
    .boolean()
    .describe("Whether the attribute is required or not")
    .default(false),
  array: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether the attribute is an array or not"),
  elements: z
    .array(z.string())
    .describe("The elements of the enum attribute")
    .default([]),
  xdefault: z.string().nullish().describe("The default value of the attribute"),
});

export type EnumAttribute = z.infer<typeof enumAttributeSchema>;
