import { z } from "zod";

export const idMappingSchema = z.object({
  sourceField: z
    .string()
    .describe(
      "The key of the data in the import data to match in the current data"
    ),
  fieldToSet: z
    .string()
    .optional()
    .describe(
      "The field to set in the target collection, if different from sourceField"
    ),
  targetField: z
    .string()
    .describe(
      "The field in the target collection to match with sourceField that will then be updated"
    ),
  targetCollection: z.string().describe("The collection to search"),
});

export const idMappingsSchema = z
  .array(idMappingSchema)
  .describe("An array of id mapping objects");

export type IdMappings = z.infer<typeof idMappingsSchema>;
export type IdMapping = z.infer<typeof idMappingSchema>;
