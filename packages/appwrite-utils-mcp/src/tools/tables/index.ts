/**
 * Tables tools for MCP (Appwrite TablesDB v18+)
 *
 * Exposes the full DatabaseAdapter surface (rows, tables, indexes, columns)
 * using TablesDB terminology. Replaces the deprecated databases/documents/collections
 * tool group. All handlers obtain a runtime-resolved DatabaseAdapter via
 * `context.clientRegistry.getOrCreate(...)`, so v18+ instances transparently use
 * the TablesDBAdapter while legacy v17 instances continue to work via LegacyAdapter.
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import { Query } from 'node-appwrite';
import type { ToolContext, ToolDefinition, ToolGroupDefinition } from '../ToolGroup.js';
import type { DatabaseAdapter } from 'appwrite-utils-helpers';
import { normalizeQueries } from '../../utils/queryNormalizer.js';

const QUERY_DESCRIPTION_SUFFIX =
  'Accepts SDK syntax like Query.limit(10) or limit(10), or JSON wire form. Call query_help for the full reference.';

// ──────────────────────────────────────────────────
// SHARED HELPERS
// ──────────────────────────────────────────────────

/**
 * Resolve credentials and obtain an authenticated DatabaseAdapter.
 *
 * The adapter is selected at runtime by AdapterFactory based on the connected
 * Appwrite instance's API version (TablesDBAdapter for v18+, LegacyAdapter for v17).
 * Tool handlers should NEVER instantiate node-appwrite's `Databases` class directly.
 */
async function getAdapter(context: ToolContext): Promise<DatabaseAdapter> {
  const authResult = await context.authResolver.resolve();
  const { adapter } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });
  return adapter;
}

/**
 * Normalize an adapter list response into a slim `{ total, rows }` shape.
 * Tolerates both legacy (`documents`) and TablesDB (`rows`) response keys.
 */
function slimRowList(response: any): { total: number; rows: any[] } {
  const rows = Array.isArray(response)
    ? response
    : response?.rows ?? response?.documents ?? response?.data ?? [];
  const total = typeof response?.total === 'number' ? response.total : rows.length;
  return { total, rows };
}

/**
 * Normalize an adapter table list response into `{ total, tables }`.
 * Tolerates both legacy (`collections`) and TablesDB (`tables`) response keys.
 */
function slimTableList(response: any): { total: number; tables: any[] } {
  const tables = Array.isArray(response)
    ? response
    : response?.tables ?? response?.collections ?? response?.data ?? [];
  const total = typeof response?.total === 'number' ? response.total : tables.length;
  return { total, tables };
}

/**
 * Normalize an adapter index list response into `{ total, indexes }`.
 */
function slimIndexList(response: any): { total: number; indexes: any[] } {
  const indexes = Array.isArray(response)
    ? response
    : response?.indexes ?? response?.data ?? [];
  const total = typeof response?.total === 'number' ? response.total : indexes.length;
  return { total, indexes };
}

/**
 * Normalize an adapter column list response into `{ total, columns }`.
 * Tolerates both legacy (`attributes`) and TablesDB (`columns`) response keys.
 */
function slimColumnList(response: any): { total: number; columns: any[] } {
  const columns = Array.isArray(response)
    ? response
    : response?.columns ?? response?.attributes ?? response?.data ?? [];
  const total = typeof response?.total === 'number' ? response.total : columns.length;
  return { total, columns };
}

// ──────────────────────────────────────────────────
// INPUT SCHEMAS
// ──────────────────────────────────────────────────

const databaseIdSchema = z.string().min(1, 'databaseId is required');
const tableIdSchema = z.string().min(1, 'tableId is required');
const rowIdSchema = z.string().min(1, 'rowId is required');
const keySchema = z.string().min(1, 'key is required');

// Rows
const listRowsSchema = z.object({
  databaseId: databaseIdSchema,
  tableId: tableIdSchema,
  queries: z
    .array(z.string())
    .optional()
    .describe(`Optional Appwrite Query strings. ${QUERY_DESCRIPTION_SUFFIX}`),
});

const getRowSchema = z.object({
  databaseId: databaseIdSchema,
  tableId: tableIdSchema,
  rowId: rowIdSchema,
});

const createRowSchema = z.object({
  databaseId: databaseIdSchema,
  tableId: tableIdSchema,
  rowId: z
    .string()
    .min(1)
    .optional()
    .describe('Optional row ID. If omitted, Appwrite generates a unique ID.'),
  data: z.record(z.string(), z.unknown()).describe('Row payload (column key → value).'),
  permissions: z.array(z.string()).optional().describe('Optional row-level permissions.'),
});

const updateRowSchema = z.object({
  databaseId: databaseIdSchema,
  tableId: tableIdSchema,
  rowId: rowIdSchema,
  data: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Partial row payload (omit columns to leave unchanged).'),
  permissions: z.array(z.string()).optional().describe('Optional row-level permissions.'),
});

const deleteRowSchema = z.object({
  databaseId: databaseIdSchema,
  tableId: tableIdSchema,
  rowId: rowIdSchema,
});

// Bulk rows
const bulkCreateRowsSchema = z.object({
  databaseId: databaseIdSchema,
  tableId: tableIdSchema,
  rows: z.array(z.record(z.string(), z.unknown())).min(1, 'At least one row is required'),
});

const bulkUpsertRowsSchema = z.object({
  databaseId: databaseIdSchema,
  tableId: tableIdSchema,
  rows: z.array(z.record(z.string(), z.unknown())).min(1, 'At least one row is required'),
});

const bulkDeleteRowsSchema = z.object({
  databaseId: databaseIdSchema,
  tableId: tableIdSchema,
  rowIds: z
    .array(z.string())
    .optional()
    .describe(
      'Optional list of row IDs to delete. When omitted/empty, the adapter performs a wipe over the whole table.'
    ),
  batchSize: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional batch size for wipe mode (default 250).'),
});

// Tables
const listTablesSchema = z.object({
  databaseId: databaseIdSchema,
  queries: z
    .array(z.string())
    .optional()
    .describe(`Optional Appwrite Query strings. ${QUERY_DESCRIPTION_SUFFIX}`),
  search: z
    .string()
    .max(256)
    .optional()
    .describe('Optional free-text search term (encoded as Query.search).'),
  summary: z
    .boolean()
    .default(true)
    .describe(
      'When true (default), returns a slim projection per table: { $id, name, enabled, columnCount, indexCount, $createdAt, $updatedAt }. ' +
        'Set false to return full column + index schemas inline — large projects can exceed the tool result cap, so prefer Query.limit() if you opt out.'
    ),
});

const getTableSchema = z.object({
  databaseId: databaseIdSchema,
  tableId: tableIdSchema,
});

const createTableSchema = z.object({
  databaseId: databaseIdSchema,
  tableId: tableIdSchema,
  name: z.string().min(1, 'name is required'),
  permissions: z.array(z.string()).optional(),
  rowSecurity: z.boolean().optional().describe('Enable row-level permissions on the table.'),
  enabled: z.boolean().optional(),
});

const updateTableSchema = z.object({
  databaseId: databaseIdSchema,
  tableId: tableIdSchema,
  name: z.string().min(1, 'name is required'),
  permissions: z.array(z.string()).optional(),
  rowSecurity: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

const deleteTableSchema = z.object({
  databaseId: databaseIdSchema,
  tableId: tableIdSchema,
});

// Indexes
const listIndexesSchema = z.object({
  databaseId: databaseIdSchema,
  tableId: tableIdSchema,
  queries: z
    .array(z.string())
    .optional()
    .describe(`Optional Appwrite Query strings. ${QUERY_DESCRIPTION_SUFFIX}`),
});

const createIndexSchema = z.object({
  databaseId: databaseIdSchema,
  tableId: tableIdSchema,
  key: keySchema,
  type: z
    .enum(['key', 'unique', 'fulltext'])
    .describe('Index type: key | unique | fulltext.'),
  attributes: z
    .array(z.string().min(1))
    .min(1, 'At least one column key is required')
    .describe(
      'List of column keys (the SDK parameter is still named `attributes` for compatibility, but this is the set of column keys the index covers).'
    ),
  orders: z
    .array(z.enum(['ASC', 'DESC']))
    .optional()
    .describe('Optional sort orders, one per column.'),
});

const deleteIndexSchema = z.object({
  databaseId: databaseIdSchema,
  tableId: tableIdSchema,
  key: keySchema,
});

// Columns
// All TablesDB v18+ column types per node-appwrite v23 typed creator methods.
const columnTypeEnum = z.enum([
  'boolean',
  'string',
  'text',
  'integer',
  'float',
  'datetime',
  'email',
  'url',
  'ip',
  'enum',
  'relationship',
  'longtext',
  'mediumtext',
  'varchar',
  'point',
  'line',
  'polygon',
]);

const listColumnsSchema = z.object({
  databaseId: databaseIdSchema,
  tableId: tableIdSchema,
  queries: z
    .array(z.string())
    .optional()
    .describe(`Optional Appwrite Query strings. ${QUERY_DESCRIPTION_SUFFIX}`),
});

const getColumnSchema = z.object({
  databaseId: databaseIdSchema,
  tableId: tableIdSchema,
  key: keySchema,
});

const createColumnSchema = z.object({
  databaseId: databaseIdSchema,
  tableId: tableIdSchema,
  key: keySchema,
  type: columnTypeEnum.describe('TablesDB column type.'),
  size: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Required for `string` and `varchar` (defaults to 255 for string).'),
  required: z.boolean().optional(),
  default: z.unknown().optional().describe('Default value (xdefault) for the column.'),
  array: z.boolean().optional(),
  encrypt: z
    .boolean()
    .optional()
    .describe('Enable at-rest encryption (string/longtext/mediumtext/varchar).'),
  // Numeric
  min: z.number().optional().describe('Required minimum bound for integer/float columns.'),
  max: z.number().optional().describe('Required maximum bound for integer/float columns.'),
  // Enum
  elements: z
    .array(z.string())
    .optional()
    .describe('Allowed enum values. Required when `type` is `enum`.'),
  // Relationship
  relatedCollection: z
    .string()
    .optional()
    .describe('Related table ID for `relationship` type (legacy name retained on the SDK).'),
  relationType: z
    .enum(['oneToOne', 'manyToOne', 'oneToMany', 'manyToMany'])
    .optional()
    .describe('Relationship cardinality. Required when `type` is `relationship`.'),
  twoWay: z.boolean().optional(),
  twoWayKey: z.string().optional(),
  onDelete: z
    .enum(['setNull', 'cascade', 'restrict'])
    .optional()
    .describe('On-delete strategy for relationship columns.'),
  side: z.enum(['parent', 'child']).optional(),
});

const updateColumnSchema = z.object({
  databaseId: databaseIdSchema,
  tableId: tableIdSchema,
  key: keySchema,
  type: columnTypeEnum.optional().describe('Optional type hint (only used by some adapters).'),
  required: z.boolean().optional(),
  default: z.unknown().optional(),
  size: z.number().int().positive().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  array: z.boolean().optional(),
  encrypt: z.boolean().optional(),
  elements: z.array(z.string()).optional(),
  relatedCollection: z.string().optional(),
  relationType: z.string().optional(),
  twoWay: z.boolean().optional(),
  twoWayKey: z.string().optional(),
  onDelete: z.string().optional(),
});

const deleteColumnSchema = z.object({
  databaseId: databaseIdSchema,
  tableId: tableIdSchema,
  key: keySchema,
});

// ──────────────────────────────────────────────────
// HANDLERS — ROWS
// ──────────────────────────────────────────────────

async function handleListRows(input: unknown, context: ToolContext) {
  const validated = listRowsSchema.parse(input);
  const adapter = await getAdapter(context);
  const response = await adapter.listRows({
    databaseId: validated.databaseId,
    tableId: validated.tableId,
    queries: normalizeQueries(validated.queries),
  });
  return slimRowList(response);
}

async function handleGetRow(input: unknown, context: ToolContext) {
  const validated = getRowSchema.parse(input);
  const adapter = await getAdapter(context);
  const response = await adapter.getRow({
    databaseId: validated.databaseId,
    tableId: validated.tableId,
    id: validated.rowId,
  });
  return { row: (response as any)?.data ?? response };
}

async function handleCreateRow(input: unknown, context: ToolContext) {
  const validated = createRowSchema.parse(input);
  const adapter = await getAdapter(context);
  const response = await adapter.createRow({
    databaseId: validated.databaseId,
    tableId: validated.tableId,
    id: validated.rowId ?? 'unique()',
    data: validated.data,
    permissions: validated.permissions,
  });
  return { row: (response as any)?.data ?? response };
}

async function handleUpdateRow(input: unknown, context: ToolContext) {
  const validated = updateRowSchema.parse(input);
  const adapter = await getAdapter(context);
  const response = await adapter.updateRow({
    databaseId: validated.databaseId,
    tableId: validated.tableId,
    id: validated.rowId,
    data: validated.data,
    permissions: validated.permissions,
  });
  return { row: (response as any)?.data ?? response };
}

async function handleDeleteRow(input: unknown, context: ToolContext) {
  const validated = deleteRowSchema.parse(input);
  const adapter = await getAdapter(context);
  await adapter.deleteRow({
    databaseId: validated.databaseId,
    tableId: validated.tableId,
    id: validated.rowId,
  });
  return { success: true, rowId: validated.rowId };
}

// ──────────────────────────────────────────────────
// HANDLERS — BULK ROWS
// ──────────────────────────────────────────────────

function ensureBulkSupported(adapter: DatabaseAdapter, op: string): void {
  if (!adapter.supportsBulkOperations()) {
    throw new Error(
      `Bulk operation '${op}' is not supported by the active adapter (apiMode=${adapter.getApiMode()}). ` +
        `Bulk operations require Appwrite v18+ with TablesDB.`
    );
  }
}

async function handleBulkCreateRows(input: unknown, context: ToolContext) {
  const validated = bulkCreateRowsSchema.parse(input);
  const adapter = await getAdapter(context);
  ensureBulkSupported(adapter, 'bulk_create_rows');
  const response = await adapter.bulkCreateRows!({
    databaseId: validated.databaseId,
    tableId: validated.tableId,
    rows: validated.rows,
  });
  return slimRowList(response);
}

async function handleBulkUpsertRows(input: unknown, context: ToolContext) {
  const validated = bulkUpsertRowsSchema.parse(input);
  const adapter = await getAdapter(context);
  ensureBulkSupported(adapter, 'bulk_upsert_rows');
  const response = await adapter.bulkUpsertRows!({
    databaseId: validated.databaseId,
    tableId: validated.tableId,
    rows: validated.rows,
  });
  return slimRowList(response);
}

async function handleBulkDeleteRows(input: unknown, context: ToolContext) {
  const validated = bulkDeleteRowsSchema.parse(input);
  const adapter = await getAdapter(context);
  ensureBulkSupported(adapter, 'bulk_delete_rows');
  if (typeof adapter.bulkDeleteRows !== 'function') {
    throw new Error(
      `Bulk delete is not implemented on the active adapter (apiMode=${adapter.getApiMode()}).`
    );
  }
  const response = await adapter.bulkDeleteRows({
    databaseId: validated.databaseId,
    tableId: validated.tableId,
    rowIds: validated.rowIds ?? [],
    batchSize: validated.batchSize,
  });
  return {
    total: (response as any)?.total ?? 0,
    deleted: (response as any)?.data ?? response,
    errors: (response as any)?.errors ?? [],
  };
}

// ──────────────────────────────────────────────────
// HANDLERS — TABLES
// ──────────────────────────────────────────────────

async function handleListTables(input: unknown, context: ToolContext) {
  const validated = listTablesSchema.parse(input);
  const adapter = await getAdapter(context);

  // Build the queries array: user-supplied entries + optional Query.search.
  // Inject a default Query.limit(25) when the caller didn't set one — full
  // table schemas are large enough that the default response can overflow
  // the tool result cap.
  const rawQueries: string[] = [...(validated.queries ?? [])];
  if (validated.search) {
    rawQueries.push(Query.search('name', validated.search));
  }
  if (!hasLimitQuery(rawQueries)) {
    rawQueries.push(Query.limit(25));
  }

  const response = await adapter.listTables({
    databaseId: validated.databaseId,
    queries: normalizeQueries(rawQueries),
  });
  const slim = slimTableList(response);

  // Cache the tables in state manager for downstream tools
  context.stateManager.cacheTables(
    validated.databaseId,
    slim.tables.map((table: any) => ({
      $id: table.$id,
      name: table.name,
      databaseId: validated.databaseId,
    }))
  );

  if (validated.summary) {
    return {
      total: slim.total,
      tables: slim.tables.map(projectTableSummary),
      note:
        'Returned slim summary. Pass summary:false on this tool for the full schema ' +
        '(may overflow tool result cap on large projects — use Query.limit() when opting out).',
    };
  }

  return slim;
}

/**
 * Detect whether the caller already supplied a Query.limit(...) entry, in any
 * of the three accepted forms — JSON wire (`{"method":"limit",...}`), SDK
 * (`Query.limit(...)`), or bare (`limit(...)`).
 */
function hasLimitQuery(entries: string[]): boolean {
  return entries.some((entry) => {
    const trimmed = entry.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as { method?: unknown };
        return parsed?.method === 'limit';
      } catch {
        return false;
      }
    }
    return /^(?:Query\.)?limit\s*\(/.test(trimmed);
  });
}

/**
 * Project a full Appwrite table object down to the small shape we return in
 * summary mode. Tolerates both TablesDB (`columns`/`indexes`) and legacy
 * (`attributes`/`indexes`) field names.
 */
function projectTableSummary(table: any) {
  const columns = Array.isArray(table?.columns)
    ? table.columns
    : Array.isArray(table?.attributes)
      ? table.attributes
      : [];
  const indexes = Array.isArray(table?.indexes) ? table.indexes : [];
  return {
    $id: table?.$id,
    name: table?.name,
    enabled: table?.enabled,
    rowSecurity: table?.rowSecurity ?? table?.documentSecurity,
    columnCount: columns.length,
    indexCount: indexes.length,
    $createdAt: table?.$createdAt,
    $updatedAt: table?.$updatedAt,
  };
}

async function handleGetTable(input: unknown, context: ToolContext) {
  const validated = getTableSchema.parse(input);
  const adapter = await getAdapter(context);
  const response = await adapter.getTable({
    databaseId: validated.databaseId,
    tableId: validated.tableId,
  });
  return { table: (response as any)?.data ?? response };
}

async function handleCreateTable(input: unknown, context: ToolContext) {
  const validated = createTableSchema.parse(input);
  const adapter = await getAdapter(context);
  const response = await adapter.createTable({
    databaseId: validated.databaseId,
    id: validated.tableId,
    name: validated.name,
    permissions: validated.permissions,
    rowSecurity: validated.rowSecurity,
    enabled: validated.enabled,
  });
  return { table: (response as any)?.data ?? response };
}

async function handleUpdateTable(input: unknown, context: ToolContext) {
  const validated = updateTableSchema.parse(input);
  const adapter = await getAdapter(context);
  const response = await adapter.updateTable({
    databaseId: validated.databaseId,
    id: validated.tableId,
    name: validated.name,
    permissions: validated.permissions,
    rowSecurity: validated.rowSecurity,
    enabled: validated.enabled,
  });
  return { table: (response as any)?.data ?? response };
}

async function handleDeleteTable(input: unknown, context: ToolContext) {
  const validated = deleteTableSchema.parse(input);
  const adapter = await getAdapter(context);
  await adapter.deleteTable({
    databaseId: validated.databaseId,
    tableId: validated.tableId,
  });
  return { success: true, tableId: validated.tableId };
}

// ──────────────────────────────────────────────────
// HANDLERS — INDEXES
// ──────────────────────────────────────────────────

async function handleListIndexes(input: unknown, context: ToolContext) {
  const validated = listIndexesSchema.parse(input);
  const adapter = await getAdapter(context);
  const response = await adapter.listIndexes({
    databaseId: validated.databaseId,
    tableId: validated.tableId,
    queries: normalizeQueries(validated.queries),
  });
  return slimIndexList(response);
}

async function handleCreateIndex(input: unknown, context: ToolContext) {
  const validated = createIndexSchema.parse(input);
  const adapter = await getAdapter(context);
  const response = await adapter.createIndex({
    databaseId: validated.databaseId,
    tableId: validated.tableId,
    key: validated.key,
    type: validated.type,
    attributes: validated.attributes,
    orders: validated.orders,
  });
  return { index: (response as any)?.data ?? response };
}

async function handleDeleteIndex(input: unknown, context: ToolContext) {
  const validated = deleteIndexSchema.parse(input);
  const adapter = await getAdapter(context);
  await adapter.deleteIndex({
    databaseId: validated.databaseId,
    tableId: validated.tableId,
    key: validated.key,
  });
  return { success: true, key: validated.key };
}

// ──────────────────────────────────────────────────
// HANDLERS — COLUMNS
// ──────────────────────────────────────────────────

async function handleListColumns(input: unknown, context: ToolContext) {
  const validated = listColumnsSchema.parse(input);
  const adapter = await getAdapter(context);
  const response = await adapter.listColumns({
    databaseId: validated.databaseId,
    tableId: validated.tableId,
    queries: normalizeQueries(validated.queries),
  });
  return slimColumnList(response);
}

async function handleGetColumn(input: unknown, context: ToolContext) {
  const validated = getColumnSchema.parse(input);
  const adapter = await getAdapter(context);
  const response = await adapter.getColumn({
    databaseId: validated.databaseId,
    tableId: validated.tableId,
    key: validated.key,
  });
  return { column: (response as any)?.data ?? response };
}

async function handleCreateColumn(input: unknown, context: ToolContext) {
  const validated = createColumnSchema.parse(input);
  const adapter = await getAdapter(context);
  // The adapter's createAttribute method is polymorphic across TablesDB columns
  // (v18+) and legacy attributes (v17). It dispatches on `type` internally.
  const response = await adapter.createAttribute({
    databaseId: validated.databaseId,
    tableId: validated.tableId,
    key: validated.key,
    type: validated.type,
    size: validated.size,
    required: validated.required,
    default: validated.default,
    array: validated.array,
    encrypt: validated.encrypt,
    min: validated.min,
    max: validated.max,
    elements: validated.elements,
    relatedCollection: validated.relatedCollection,
    relationType: validated.relationType,
    twoWay: validated.twoWay,
    twoWayKey: validated.twoWayKey,
    onDelete: validated.onDelete,
    side: validated.side,
  });
  return { column: (response as any)?.data ?? response };
}

async function handleUpdateColumn(input: unknown, context: ToolContext) {
  const validated = updateColumnSchema.parse(input);
  const adapter = await getAdapter(context);
  const response = await adapter.updateAttribute({
    databaseId: validated.databaseId,
    tableId: validated.tableId,
    key: validated.key,
    type: validated.type,
    required: validated.required,
    default: validated.default,
    size: validated.size,
    min: validated.min,
    max: validated.max,
    array: validated.array,
    encrypt: validated.encrypt,
    elements: validated.elements,
    relatedCollection: validated.relatedCollection,
    relationType: validated.relationType,
    twoWay: validated.twoWay,
    twoWayKey: validated.twoWayKey,
    onDelete: validated.onDelete,
  });
  return { column: (response as any)?.data ?? response };
}

async function handleDeleteColumn(input: unknown, context: ToolContext) {
  const validated = deleteColumnSchema.parse(input);
  const adapter = await getAdapter(context);
  await adapter.deleteAttribute({
    databaseId: validated.databaseId,
    tableId: validated.tableId,
    key: validated.key,
  });
  return { success: true, key: validated.key };
}

// ──────────────────────────────────────────────────
// TOOL DEFINITIONS
// ──────────────────────────────────────────────────

const listRowsTool: ToolDefinition = {
  name: 'list_rows',
  description: 'List rows in an Appwrite TablesDB table (with optional Query filters).',
  inputSchema: listRowsSchema,
  handler: handleListRows,
  requiresAuth: true,
};

const getRowTool: ToolDefinition = {
  name: 'get_row',
  description: 'Get a single row by ID from an Appwrite TablesDB table.',
  inputSchema: getRowSchema,
  handler: handleGetRow,
  requiresAuth: true,
};

const createRowTool: ToolDefinition = {
  name: 'create_row',
  description: 'Create a new row in an Appwrite TablesDB table.',
  inputSchema: createRowSchema,
  handler: handleCreateRow,
  requiresAuth: true,
};

const updateRowTool: ToolDefinition = {
  name: 'update_row',
  description: 'Update an existing row in an Appwrite TablesDB table.',
  inputSchema: updateRowSchema,
  handler: handleUpdateRow,
  requiresAuth: true,
};

const deleteRowTool: ToolDefinition = {
  name: 'delete_row',
  description: 'Delete a row by ID from an Appwrite TablesDB table.',
  inputSchema: deleteRowSchema,
  handler: handleDeleteRow,
  requiresAuth: true,
};

const bulkCreateRowsTool: ToolDefinition = {
  name: 'bulk_create_rows',
  description:
    'Bulk-create multiple rows in a TablesDB table. Requires Appwrite v18+ (TablesDB adapter).',
  inputSchema: bulkCreateRowsSchema,
  handler: handleBulkCreateRows,
  requiresAuth: true,
};

const bulkUpsertRowsTool: ToolDefinition = {
  name: 'bulk_upsert_rows',
  description:
    'Bulk-upsert (create-or-replace) multiple rows in a TablesDB table. Requires Appwrite v18+.',
  inputSchema: bulkUpsertRowsSchema,
  handler: handleBulkUpsertRows,
  requiresAuth: true,
};

const bulkDeleteRowsTool: ToolDefinition = {
  name: 'bulk_delete_rows',
  description:
    'Bulk-delete rows from a TablesDB table. Pass `rowIds` to delete specific rows; omit/empty to wipe the entire table. Requires Appwrite v18+.',
  inputSchema: bulkDeleteRowsSchema,
  handler: handleBulkDeleteRows,
  requiresAuth: true,
};

const listTablesTool: ToolDefinition = {
  name: 'list_tables',
  description: 'List tables in an Appwrite database (TablesDB v18+ terminology).',
  inputSchema: listTablesSchema,
  handler: handleListTables,
  requiresAuth: true,
};

const getTableTool: ToolDefinition = {
  name: 'get_table',
  description: 'Get a single table (schema, columns, indexes) by ID.',
  inputSchema: getTableSchema,
  handler: handleGetTable,
  requiresAuth: true,
};

const createTableTool: ToolDefinition = {
  name: 'create_table',
  description: 'Create a new TablesDB table inside a database.',
  inputSchema: createTableSchema,
  handler: handleCreateTable,
  requiresAuth: true,
};

const updateTableTool: ToolDefinition = {
  name: 'update_table',
  description: 'Update a TablesDB table (name, permissions, row-security, enabled).',
  inputSchema: updateTableSchema,
  handler: handleUpdateTable,
  requiresAuth: true,
};

const deleteTableTool: ToolDefinition = {
  name: 'delete_table',
  description: 'Delete a TablesDB table by ID.',
  inputSchema: deleteTableSchema,
  handler: handleDeleteTable,
  requiresAuth: true,
};

const listIndexesTool: ToolDefinition = {
  name: 'list_indexes',
  description: 'List indexes defined on a TablesDB table.',
  inputSchema: listIndexesSchema,
  handler: handleListIndexes,
  requiresAuth: true,
};

const createIndexTool: ToolDefinition = {
  name: 'create_index',
  description:
    'Create an index on a TablesDB table. Type is one of `key`, `unique`, or `fulltext`. The `attributes` parameter is the list of column keys this index covers (SDK retains the legacy name).',
  inputSchema: createIndexSchema,
  handler: handleCreateIndex,
  requiresAuth: true,
};

const deleteIndexTool: ToolDefinition = {
  name: 'delete_index',
  description: 'Delete an index from a TablesDB table by key.',
  inputSchema: deleteIndexSchema,
  handler: handleDeleteIndex,
  requiresAuth: true,
};

const listColumnsTool: ToolDefinition = {
  name: 'list_columns',
  description:
    'List columns defined on a TablesDB table (with optional Query filters). On legacy v17 instances this returns attributes, presented under the unified TablesDB column shape.',
  inputSchema: listColumnsSchema,
  handler: handleListColumns,
  requiresAuth: true,
};

const getColumnTool: ToolDefinition = {
  name: 'get_column',
  description:
    'Get a single column definition by key from a TablesDB table. On legacy v17 instances this maps to a single attribute.',
  inputSchema: getColumnSchema,
  handler: handleGetColumn,
  requiresAuth: true,
};

const createColumnTool: ToolDefinition = {
  name: 'create_column',
  description:
    'Create a column on a TablesDB table. Supports boolean | string | text | integer | float | datetime | email | url | ip | enum | relationship | longtext | mediumtext | varchar | point | line | polygon.',
  inputSchema: createColumnSchema,
  handler: handleCreateColumn,
  requiresAuth: true,
};

const updateColumnTool: ToolDefinition = {
  name: 'update_column',
  description:
    'Update an existing column on a TablesDB table. Pass only the fields to change; the adapter dispatches to the correct type-specific updater.',
  inputSchema: updateColumnSchema,
  handler: handleUpdateColumn,
  requiresAuth: true,
};

const deleteColumnTool: ToolDefinition = {
  name: 'delete_column',
  description: 'Delete a column from a TablesDB table by key.',
  inputSchema: deleteColumnSchema,
  handler: handleDeleteColumn,
  requiresAuth: true,
};

// ──────────────────────────────────────────────────
// TOOL GROUP EXPORT
// ──────────────────────────────────────────────────

/**
 * Tables tools group for MCP. Exposes the full DatabaseAdapter surface using
 * TablesDB (v18+) terminology — rows, columns, tables, indexes. The
 * orchestrator's deprecated `--databases` flag routes to this group via
 * flag-mapping (FlagParser); there is no separate `databasesToolGroup` export.
 */
export const tablesToolGroup: ToolGroupDefinition = {
  name: 'Tables',
  flag: 'tables',
  description:
    'Tools for managing Appwrite TablesDB (v18+) — rows, columns, tables, indexes. (Replaces the deprecated databases/documents/collections API surface.)',
  tools: [
    // Rows
    listRowsTool,
    getRowTool,
    createRowTool,
    updateRowTool,
    deleteRowTool,
    // Bulk rows (require v18+ TablesDB adapter at runtime)
    bulkCreateRowsTool,
    bulkUpsertRowsTool,
    bulkDeleteRowsTool,
    // Tables
    listTablesTool,
    getTableTool,
    createTableTool,
    updateTableTool,
    deleteTableTool,
    // Indexes
    listIndexesTool,
    createIndexTool,
    deleteIndexTool,
    // Columns
    listColumnsTool,
    getColumnTool,
    createColumnTool,
    updateColumnTool,
    deleteColumnTool,
  ],
};
