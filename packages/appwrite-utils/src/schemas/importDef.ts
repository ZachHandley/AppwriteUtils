import { z } from "zod";
import { idMappingsSchema } from "./idMapping.js";
import { AttributeMappingsSchema } from "./attributeMappings.js";

export const importDefSchema = z
  .object({
    type: z
      .enum(["create", "update"])
      .default("create")
      .optional()
      .describe(
        "The type of import action, if update you should set an object for the originalIdField and targetField"
      ),
    filePath: z.string().describe("The file path of the data to import"),
    basePath: z
      .string()
      .optional()
      .describe(
        "The base path of the import e.g. if you have JSON, and the array is in the RECORDS object, then this would be RECORDS, if nothing then leave it gone"
      ),
    primaryKeyField: z
      .string()
      .default("id")
      .describe(
        "The field in the import data representing the primary key for this import data (if any)"
      ),
    idMappings: idMappingsSchema
      .optional()
      .describe("The id mappings for the attribute to map ID's to"),
    createUsers: z
      .boolean()
      .default(false)
      .nullish()
      .describe("Whether to create users"),
    updateMapping: z
      .object({
        originalIdField: z
          .string()
          .describe(
            "The field in the import data representing the original ID to match"
          ),
        targetField: z
          .string()
          .describe(
            "The field in the target collection that matches the original ID. Optional, defaults to the same as originalIdField if not provided"
          ),
      })
      .optional()
      .describe(
        "Configuration for mapping and resolving the update during data import"
      ),
    attributeMappings: AttributeMappingsSchema.describe(
      "The attribute mappings to use for the import"
    ),
  })
  .describe("An individual import definition for the database");

export const importDefSchemas = z
  .array(importDefSchema)
  .describe("The import definitions for the database");

export type ImportDef = z.infer<typeof importDefSchema>;
export type ImportDefs = z.infer<typeof importDefSchemas>;
