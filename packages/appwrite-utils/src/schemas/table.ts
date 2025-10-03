import { z } from "zod";
import { importDefSchemas } from "./importDef.js";
import { attributeSchema } from "./attribute.js";
import { indexSchema } from "./index.js";

/**
 * Table Schema with Dual Terminology Support
 *
 * This schema supports both 'attributes' (legacy) and 'columns' (TablesDB) terminology:
 *
 * Legacy API Mode (Collections):
 * - Use 'attributes' field
 * - Backward compatible with existing implementations
 *
 * TablesDB API Mode (Tables):
 * - Use 'columns' field (preferred for new implementations)
 * - More intuitive naming for database tables
 *
 * Key Features:
 * - Validation ensures only one terminology is used per table
 * - Internal transformation normalizes both to 'attributes'
 * - Type-safe access to both input and output formats
 * - Full backward compatibility maintained
 *
 * Usage Examples:
 * ```typescript
 * // Using attributes (legacy)
 * const tableWithAttributes = { name: "Users", attributes: [...] }
 *
 * // Using columns (TablesDB)
 * const tableWithColumns = { name: "Users", columns: [...] }
 * ```
 */

// Base table object schema without the optional fields that need validation
const BaseTableSchemaCore = z.object({
  name: z.string().describe("The name of the table"),
  tableId: z
    .string()
    .optional()
    .describe("The ID of the table - auto-generated from name or $id if not provided"),
  enabled: z
    .boolean()
    .default(true)
    .optional()
    .describe("Whether the table is enabled or not"),
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
    .describe("The permissions of the table"),
  indexes: z
    .array(indexSchema)
    .optional()
    .default([])
    .describe("The indexes of the table"),
  importDefs: importDefSchemas.optional().default([]),
  databaseId: z
    .string()
    .optional()
    .describe("The ID of the database the table belongs to - optional for interactive CLI association"),
  // Allow $id for backward compatibility with collections
  $id: z
    .string()
    .optional()
    .describe("Collection ID for backward compatibility"),
});

// Extended schema with dual terminology support and validation
const BaseTableSchema = BaseTableSchemaCore.extend({
  attributes: z
    .array(attributeSchema)
    .optional()
    .describe("The attributes of the table (legacy terminology)"),
  columns: z
    .array(attributeSchema)
    .optional()
    .describe("The columns of the table (TablesDB terminology)"),
})
.refine((data) => {
  // Validation: prevent both attributes and columns from being provided simultaneously
  const attributesProvided = data.attributes !== undefined;
  const columnsProvided = data.columns !== undefined;

  return !(attributesProvided && columnsProvided);
}, {
  message: "Cannot specify both 'attributes' and 'columns' fields - use either legacy 'attributes' or TablesDB 'columns'",
  path: ["attributes", "columns"],
})
.refine((data) => {
  // Validation: require at least one array with content
  const hasAttributeContent = data.attributes && data.attributes.length > 0;
  const hasColumnsContent = data.columns && data.columns.length > 0;

  return hasAttributeContent || hasColumnsContent;
}, {
  message: "Table must have either 'attributes' (legacy) or 'columns' (TablesDB) with at least one field defined",
  path: ["attributes", "columns"],
});

// Full table schema with transforms
export const TableSchema = BaseTableSchema.transform((data) => {
  // Transform columns to attributes for internal consistency
  // Tables use 'attributes' internally, but accept 'columns' as an alias
  const normalizedAttributes = data.columns || data.attributes || [];

  // Transform indexes to filter out null orders
  const transformedIndexes = data.indexes?.map((index) => {
    if (index.orders) {
      return {
        ...index,
        orders: index.orders.filter((order) => order !== null),
      };
    }
    return index;
  }) || [];

  return {
    ...data,
    attributes: normalizedAttributes,
    // Remove columns from output to maintain internal consistency
    columns: undefined,
    indexes: transformedIndexes,
  };
});

// Create schema for tables without timestamp fields but with the same validation
const TableCreateBaseSchema = BaseTableSchemaCore.omit({
  $createdAt: true,
  $updatedAt: true,
}).extend({
  attributes: z
    .array(attributeSchema)
    .optional()
    .describe("The attributes of the table (legacy terminology)"),
  columns: z
    .array(attributeSchema)
    .optional()
    .describe("The columns of the table (TablesDB terminology)"),
})
.refine((data) => {
  // Validation: prevent both attributes and columns from being provided simultaneously
  const attributesProvided = data.attributes !== undefined;
  const columnsProvided = data.columns !== undefined;

  return !(attributesProvided && columnsProvided);
}, {
  message: "Cannot specify both 'attributes' and 'columns' fields - use either legacy 'attributes' or TablesDB 'columns'",
  path: ["attributes", "columns"],
})
.refine((data) => {
  // Validation: require at least one array with content
  const hasAttributeContent = data.attributes && data.attributes.length > 0;
  const hasColumnsContent = data.columns && data.columns.length > 0;

  return hasAttributeContent || hasColumnsContent;
}, {
  message: "Table must have either 'attributes' (legacy) or 'columns' (TablesDB) with at least one field defined",
  path: ["attributes", "columns"],
});

export const TableCreateSchema = TableCreateBaseSchema.transform((data) => {
  // Auto-generate tableId if not provided
  if (!data.tableId) {
    data.tableId = data.$id || data.name.toLowerCase().replace(/\s+/g, '_');
  }

  // Transform columns to attributes for internal consistency
  // Tables use 'attributes' internally, but accept 'columns' as an alias
  // Note: validation ensures exactly one is provided
  const normalizedAttributes = data.columns || data.attributes!; // Safe to use ! due to validation

  // Transform indexes to filter out null orders
  const transformedIndexes = data.indexes?.map((index) => {
    if (index.orders) {
      return {
        ...index,
        orders: index.orders.filter((order) => order !== null),
      };
    }
    return index;
  }) || [];

  return {
    ...data,
    attributes: normalizedAttributes,
    // Remove columns from output to maintain internal consistency
    columns: undefined,
    indexes: transformedIndexes,
  };
});

export const TablesSchema = z
  .array(TableCreateSchema)
  .describe("An array of tables to create");

// Types for both terminologies
export type Table = z.infer<typeof TableSchema>;
export type Tables = z.infer<typeof TablesSchema>;
export type TableCreate = z.infer<typeof TableCreateSchema>;

// Input types that support both terminologies (before transformation)
export type TableInput = z.input<typeof TableSchema>;
export type TableCreateInput = z.input<typeof TableCreateSchema>;

// Helper types for dual terminology support
export type TableWithAttributes = Omit<TableCreate, 'columns'> & {
  attributes: NonNullable<TableCreate['attributes']>;
};

export type TableWithColumns = Omit<TableCreate, 'attributes'> & {
  columns: NonNullable<TableCreate['attributes']>;
};

// Union type for either terminology
export type TableDefinition = TableWithAttributes | TableWithColumns;