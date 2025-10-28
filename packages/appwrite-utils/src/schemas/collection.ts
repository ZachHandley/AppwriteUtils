import { z } from "zod";
import { importDefSchemas } from "./importDef.js";
import { attributeSchema } from "./attribute.js";
import { indexSchema } from "./index.js";

/**
 * Collection Schema for Legacy Databases API
 *
 * Collections use the traditional Appwrite terminology:
 * - Container: `collections`
 * - Items: `documents`
 * - Fields: `attributes`
 *
 * This schema is designed for the legacy Databases API and maintains full backward compatibility.
 * For new projects or enhanced performance, consider using the Table schema which supports both
 * legacy and TablesDB terminology.
 *
 * @example
 * ```typescript
 * import { CollectionCreateSchema } from "appwrite-utils";
 *
 * const collection = CollectionCreateSchema.parse({
 *   name: "Users",
 *   attributes: [
 *     { key: "email", type: "string", required: true },
 *     { key: "name", type: "string", required: true }
 *   ],
 *   indexes: [
 *     { key: "email_idx", type: "unique", attributes: ["email"] }
 *   ]
 * });
 * ```
 *
 * Key differences from Tables:
 * - Collections: Always use 'attributes' (legacy Databases API)
 * - Tables: Support both 'attributes' and 'columns' (TablesDB API)
 * - Collections: Standard performance characteristics
 * - Tables: Enhanced performance with bulk operations
 */
export const CollectionSchema = z.object({
  name: z.string().describe("The name of the collection"),
  $id: z
    .string()
    .optional()
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
  databaseIds: z
    .array(z.string())
    .optional()
    .describe("Optional list of database IDs this collection should be applied to (multi-environment support)"),
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
export type CollectionInput = z.input<typeof CollectionSchema>;
export type CollectionCreateInput = z.input<typeof CollectionCreateSchema>;
