import { z } from "zod";
export const relationshipAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  type: z
    .literal("relationship")
    .describe("The type of the attribute")
    .default("relationship"),
  error: z
    .string()
    .describe("The error message if the attribute is invalid")
    .default("Invalid Relationship Attribute Schema"),
  required: z
    .boolean()
    .describe("Whether the attribute is required or not")
    .default(false),
  array: z
    .boolean()
    .optional()
    .describe("Whether the attribute is an array or not"),
  relatedCollection: z
    .string()
    .describe("The collection ID of the related collection"),
  relationType: z
    .enum(["oneToMany", "manyToOne", "oneToOne", "manyToMany"])
    .describe("The relation type of the relationship attribute"),
  twoWay: z.boolean().describe("Whether the relationship is two way or not"),
  twoWayKey: z
    .string()
    .describe("The ID of the foreign key in the other collection"),
  onDelete: z
    .enum(["setNull", "cascade", "restrict"])
    .describe("The action to take when the related document is deleted")
    .default("setNull"),
  side: z.enum(["parent", "child"]).describe("The side of the relationship"),
  importMapping: z
    .object({
      originalIdField: z
        .string()
        .describe(
          "The field in the import data representing the original ID to match"
        ),
      targetField: z
        .string()
        .optional()
        .describe(
          "The field in the target collection that matches the original ID. Optional, defaults to the same as originalIdField if not provided"
        ),
    })
    .optional()
    .describe(
      "Configuration for mapping and resolving relationships during data import"
    ),
});

export type RelationshipAttribute = z.infer<typeof relationshipAttributeSchema>;
