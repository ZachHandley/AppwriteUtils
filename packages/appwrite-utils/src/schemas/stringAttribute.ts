import { z } from "zod";

export const stringAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  type: z
    .literal("string")
    .describe("The type of the attribute")
    .default("string"),
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
  format: z.string().nullish().describe("The format of the attribute"),
  description: z
    .string()
    .or(z.record(z.string()))
    .optional()
    .describe(
      "The description of the attribute, also used for OpenApi Generation"
    ),
});

export type StringAttribute = z.infer<typeof stringAttributeSchema>;
