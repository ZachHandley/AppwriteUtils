import { z } from "zod";

export const floatAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  type: z
    .literal("float")
    .describe("The type of the attribute")
    .default("float"),
  error: z
    .string()
    .describe("The error message if the attribute is invalid")
    .default("Invalid Float Attribute Schema"),
  required: z
    .boolean()
    .describe("Whether the attribute is required or not")
    .default(false),
  array: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether the attribute is an array or not"),
  min: z.number().optional().describe("The minimum value of the attribute"),
  max: z.number().optional().describe("The maximum value of the attribute"),
  xdefault: z.number().nullish().describe("The default value of the attribute"),
});

export type FloatAttribute = z.infer<typeof floatAttributeSchema>;
