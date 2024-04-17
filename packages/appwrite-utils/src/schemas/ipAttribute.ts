import { z } from "zod";

export const ipAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  type: z.literal("ip").describe("The type of the attribute"),
  error: z
    .string()
    .describe("The error message if the attribute is invalid")
    .default("Invalid IP Attribute Schema"),
  required: z
    .boolean()
    .describe("Whether the attribute is required or not")
    .default(false),
  array: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether the attribute is an array or not"),
  xdefault: z.string().nullish().describe("The default value of the attribute"),
});

export type IpAttribute = z.infer<typeof ipAttributeSchema>;
