import { z } from "zod";

export const AttributeMappingSchema = z.object({
  oldKey: z
    .string()
    .optional()
    .describe("The key of the attribute in the old document"),
  oldKeys: z
    .array(z.string())
    .optional()
    .describe(
      "The keys of the attribute in the old document, if there are more than one"
    ),
  targetKey: z
    .string()
    .describe("The key of the attribute in the new document"),
  valueToSet: z
    .any()
    .optional()
    .describe(
      "The value to set for the attribute in the new document, if not mapped to oldKey"
    ),
  fileData: z
    .object({
      name: z
        .string()
        .describe("The name of the file, can use template strings"),
      path: z
        .string()
        .describe("The path of the file, relative to the appwrite folder"),
    })
    .optional()
    .describe(
      "The file data to use for the import, if defined it will upload and replace with ID"
    ),
  converters: z
    .array(z.string())
    .describe("The converters to use for the import")
    .default([])
    .optional(),
  validationActions: z
    .array(
      z.object({
        action: z.string(),
        params: z.array(z.string().startsWith("{").endsWith("}")),
      })
    )
    .describe(
      "The after import actions and parameter placeholders (they'll be replaced with the actual data) to use for the import"
    )
    .default([])
    .optional(),
  postImportActions: z
    .array(
      z.object({
        action: z.string(),
        params: z.array(z.string().or(z.record(z.string(), z.any()))),
      })
    )
    .describe(
      "The after import actions and parameter placeholders (they'll be replaced with the actual data) to use for the import"
    )
    .default([])
    .optional(),
});

export const AttributeMappingsSchema = z
  .array(AttributeMappingSchema)
  .describe("An array of attribute mapping objects");

export type AttributeMapping = z.infer<typeof AttributeMappingSchema>;
export type AttributeMappings = z.infer<typeof AttributeMappingsSchema>;
