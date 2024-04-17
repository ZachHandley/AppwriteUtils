import { z } from "zod";

export const stringAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  type: z
    .literal("string")
    .describe("The type of the attribute")
    .default("string"),
  error: z
    .string()
    .describe("The error message if the attribute is invalid")
    .default("Invalid String Attribute Schema"),
  required: z
    .boolean()
    .describe("Whether the attribute is required or not")
    .default(false),
  array: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether the attribute is an array or not"),
  size: z
    .number()
    .describe("The max length or size of the attribute")
    .optional()
    .default(50),
  xdefault: z.string().nullish().describe("The default value of the attribute"),
  encrypted: z
    .boolean()
    .optional()
    .describe("Whether the attribute is encrypted or not"),
});

export type StringAttribute = z.infer<typeof stringAttributeSchema>;
