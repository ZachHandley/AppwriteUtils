import { z } from "zod";

export const relationshipAttributeSchema = z
  .object({
  key: z.string().describe("The key of the attribute"),
  type: z
    .literal("relationship")
    .describe("The type of the attribute")
    .default("relationship"),
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
  relatedCollection: z
    .string()
    .describe("The collection ID of the related collection"),
  relationType: z
    .enum(["oneToMany", "manyToOne", "oneToOne", "manyToMany"])
    .describe("The relation type of the relationship attribute"),
  twoWay: z.boolean().describe("Whether the relationship is two way or not"),
  twoWayKey: z
    .string()
    .optional()
    .describe("The ID of the foreign key in the other collection (required when twoWay is true)"),
  onDelete: z
    .enum(["setNull", "cascade", "restrict"])
    .describe("The action to take when the related document is deleted")
    .default("setNull"),
  side: z
    .enum(["parent", "child"]) 
    .optional()
    .describe("The side of the relationship (required when twoWay is true)"),
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
  })
  .superRefine((val, ctx) => {
    if (val.twoWay) {
      if (!val.twoWayKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["twoWayKey"],
          message: "twoWayKey is required when twoWay is true",
        });
      }
      if (!val.side) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["side"],
          message: "side is required when twoWay is true",
        });
      }
    }
  });

export type RelationshipAttribute = z.infer<typeof relationshipAttributeSchema>;
