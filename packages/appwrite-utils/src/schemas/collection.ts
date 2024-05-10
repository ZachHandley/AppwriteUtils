import { z } from "zod";
import { ulid } from "ulid";
import { importDefSchemas } from "./importDef.js";
import { attributeSchema } from "./attribute.js";
import { indexSchema } from "./index.js";

export const CollectionSchema = z.object({
  name: z.string().describe("The name of the collection"),
  $id: z
    .string()
    .optional()
    .default(() => ulid())
    .describe("The ID of the collection, auto generated if not provided"),
  enabled: z
    .boolean()
    .default(true)
    .optional()
    .describe("Whether the collection is enabled or not"),
  documentSecurity: z
    .boolean()
    .default(false)
    .optional()
    .describe("Whether document security is enabled or not"),
  description: z
    .string()
    .optional()
    .describe(
      "The description of the collection, if any, used to generate OpenAPI documentation"
    ),
  $createdAt: z.string(),
  $updatedAt: z.string(),
  $permissions: z
    .array(
      z.object({
        permission: z.string(),
        target: z.string(),
      })
    )
    .optional()
    .default([])
    .describe("The permissions of the collection"),
  attributes: z
    .array(attributeSchema)
    .default([])
    .describe("The attributes of the collection"),
  indexes: z
    .array(indexSchema)
    .optional()
    .default([])
    .describe("The indexes of the collection")
    .transform((value) => {
      return value.map((index) => {
        if (index.orders) {
          return {
            ...index,
            orders: index.orders.filter((order) => order !== null),
          };
        }
        return index;
      });
    }),
  importDefs: importDefSchemas.optional().default([]),
  databaseId: z
    .string()
    .optional()
    .describe("The ID of the database the collection belongs to"),
});

export const CollectionCreateSchema = CollectionSchema.omit({
  $createdAt: true,
  $updatedAt: true,
});

export const CollectionsSchema = z
  .array(CollectionCreateSchema)
  .describe("An array of collections to create");

export type Collection = z.infer<typeof CollectionSchema>;
export type Collections = z.infer<typeof CollectionsSchema>;
export type CollectionCreate = z.infer<typeof CollectionCreateSchema>;
