import type { Attribute } from "appwrite-utils";
import { mapToCreateAttributeParams, mapToUpdateAttributeParams } from "../index.js";
import { Decimal } from "decimal.js";
const EXTREME_BOUND = new Decimal('1e12');

// Enhanced change detection interfaces
interface ColumnPropertyChange {
  property: string;
  oldValue: any;
  newValue: any;
  requiresRecreate: boolean;
}

interface ColumnChangeAnalysis {
  columnKey: string;
  columnType: string;
  hasChanges: boolean;
  requiresRecreate: boolean;
  changes: ColumnPropertyChange[];
  mutableChanges: Record<string, { old: any; new: any }>;
  immutableChanges: Record<string, { old: any; new: any }>;
}

interface ColumnOperationPlan {
  toCreate: Attribute[];
  toUpdate: Array<{ attribute: Attribute; changes: ColumnPropertyChange[] }>;
  toRecreate: Array<{ oldAttribute: any; newAttribute: Attribute }>;
  toDelete: Array<{ attribute: any }>;
  unchanged: string[];
}

// Property configuration for different column types
const MUTABLE_PROPERTIES = {
  string: ["required", "default", "size", "array"],
  integer: ["required", "default", "min", "max", "array"],
  float: ["required", "default", "min", "max", "array"],
  double: ["required", "default", "min", "max", "array"],
  boolean: ["required", "default", "array"],
  datetime: ["required", "default", "array"],
  email: ["required", "default", "array"],
  ip: ["required", "default", "array"],
  url: ["required", "default", "array"],
  enum: ["required", "default", "elements", "array"],
  relationship: ["required", "default"],
} as const;

const IMMUTABLE_PROPERTIES = {
  string: ["encrypt", "key"],
  integer: ["encrypt", "key"],
  float: ["encrypt", "key"],
  double: ["encrypt", "key"],
  boolean: ["key"],
  datetime: ["key"],
  email: ["key"],
  ip: ["key"],
  url: ["key"],
  enum: ["key"],
  relationship: ["key", "relatedCollection", "relationType", "twoWay", "twoWayKey", "onDelete"],
} as const;

const TYPE_CHANGE_REQUIRES_RECREATE = [
  "string",
  "integer",
  "float",
  "double",
  "boolean",
  "datetime",
  "email",
  "ip",
  "url",
  "enum",
  "relationship",
];

type ComparableColumn = {
  key: string;
  type: string;
  required?: boolean;
  array?: boolean;
  default?: any;
  size?: number;
  min?: number;
  max?: number;
  elements?: string[];
  encrypt?: boolean;
  // Relationship
  relatedCollection?: string;
  relationType?: string;
  twoWay?: boolean;
  twoWayKey?: string;
  onDelete?: string;
  side?: string;
};

function normDefault(val: any): any {
  // Treat undefined and null as equal unset default
  return val === undefined ? null : val;
}

function toNumber(n: any): number | undefined {
  if (n === null || n === undefined) return undefined;
  const num = Number(n);
  return Number.isFinite(num) ? num : undefined;
}

export function normalizeAttributeToComparable(attr: Attribute): ComparableColumn {
  const t = String((attr as any).type || '').toLowerCase();
  const base: ComparableColumn = {
    key: (attr as any).key,
    type: t,
    required: !!(attr as any).required,
    array: !!(attr as any).array,
    default: normDefault((attr as any).xdefault),
  };

  if (t === 'string') {
    base.size = (attr as any).size ?? 255;
    base.encrypt = !!((attr as any).encrypt);
  }
  if (t === 'integer' || t === 'float' || t === 'double') {
    const min = toNumber((attr as any).min);
    const max = toNumber((attr as any).max);
    if (min !== undefined && max !== undefined) {
      base.min = Math.min(min, max);
      base.max = Math.max(min, max);
    } else {
      base.min = min;
      base.max = max;
    }
  }
  if (t === 'enum') {
    base.elements = Array.isArray((attr as any).elements) ? (attr as any).elements.slice().sort() : [];
  }
  if (t === 'relationship') {
    base.relatedCollection = (attr as any).relatedCollection;
    base.relationType = (attr as any).relationType;
    base.twoWay = !!(attr as any).twoWay;
    base.twoWayKey = (attr as any).twoWayKey;
    base.onDelete = (attr as any).onDelete;
    base.side = (attr as any).side;
  }
  return base;
}

export function normalizeColumnToComparable(col: any): ComparableColumn {
  // Detect enum surfaced as string+elements or string+format:enum from server and normalize to enum for comparison
  let t = String((col?.type ?? col?.columnType ?? '')).toLowerCase();
  const hasElements = Array.isArray(col?.elements) && (col.elements as any[]).length > 0;
  const hasEnumFormat = (col?.format === 'enum');
  if (t === 'string' && (hasElements || hasEnumFormat)) {
    t = 'enum';
  }
  const base: ComparableColumn = {
    key: col?.key,
    type: t,
    required: !!col?.required,
    array: !!col?.array,
    default: normDefault(col?.default ?? col?.xdefault),
  };

  if (t === 'string') {
    base.size = typeof col?.size === 'number' ? col.size : undefined;
    base.encrypt = !!col?.encrypt;
  }
  if (t === 'integer' || t === 'float' || t === 'double') {
    // Preserve raw min/max without forcing extremes; compare with Decimal in shallowEqual
    const rawMin = (col as any)?.min;
    const rawMax = (col as any)?.max;
    base.min = rawMin as any;
    base.max = rawMax as any;
  }
  if (t === 'enum') {
    base.elements = Array.isArray(col?.elements) ? col.elements.slice().sort() : [];
  }
  if (t === 'relationship') {
    base.relatedCollection = col?.relatedTableId || col?.relatedCollection;
    base.relationType = col?.relationType || col?.typeName;
    base.twoWay = !!col?.twoWay;
    base.twoWayKey = col?.twoWayKey;
    base.onDelete = col?.onDelete;
    base.side = col?.side;
  }
  return base;
}

function shallowEqual(a: ComparableColumn, b: ComparableColumn): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const va: any = (a as any)[k];
    const vb: any = (b as any)[k];
    if (Array.isArray(va) && Array.isArray(vb)) {
      if (va.length !== vb.length) return false;
      for (let i = 0; i < va.length; i++) if (va[i] !== vb[i]) return false;
    } else if (k === 'min' || k === 'max') {
      // Compare numeric bounds with Decimal to avoid precision issues
      if (va == null && vb == null) continue;
      if (va == null || vb == null) {
        // Treat extreme bounds on one side as equivalent to undefined (unbounded)
        const present = va == null ? vb : va;
        try {
          const dp = new Decimal(String(present));
          if (dp.abs().greaterThanOrEqualTo(EXTREME_BOUND)) continue; // equal
        } catch {}
        return false;
      }
      try {
        const da = new Decimal(String(va));
        const db = new Decimal(String(vb));
        if (!da.equals(db)) return false;
      } catch {
        if (va !== vb) return false;
      }
    } else if (va !== vb) {
      // Treat null and undefined as equal for defaults
      if (!(va == null && vb == null)) return false;
    }
  }
  return true;
}

export function isColumnEqualToColumn(a: any, b: any): boolean {
  const na = normalizeColumnToComparable(a);
  const nb = normalizeColumnToComparable(b);
  return shallowEqual(na, nb);
}

export function isIndexEqualToIndex(a: any, b: any): boolean {
  if (!a || !b) return false;
  if (a.key !== b.key) return false;
  if (String(a.type).toLowerCase() !== String(b.type).toLowerCase()) return false;

  // Compare attributes as sets (order-insensitive)
  // Support TablesDB which returns 'columns' instead of 'attributes'
  const attrsAraw = Array.isArray(a.attributes)
    ? a.attributes
    : (Array.isArray((a as any).columns) ? (a as any).columns : []);
  const attrsA = [...attrsAraw].sort();
  const attrsB = Array.isArray(b.attributes)
    ? [...b.attributes].sort()
    : (Array.isArray((b as any).columns) ? [...(b as any).columns].sort() : []);
  if (attrsA.length !== attrsB.length) return false;
  for (let i = 0; i < attrsA.length; i++) if (attrsA[i] !== attrsB[i]) return false;

  // Orders are only considered if CONFIG (b) has orders defined
  // This prevents false positives when Appwrite returns orders but user didn't specify them
  const hasConfigOrders = Array.isArray(b.orders) && b.orders.length > 0;
  if (hasConfigOrders) {
    // Some APIs may expose 'directions' instead of 'orders'
    const ordersA = Array.isArray(a.orders)
      ? [...a.orders].sort()
      : (Array.isArray((a as any).directions) ? [...(a as any).directions].sort() : []);
    const ordersB = [...b.orders].sort();
    if (ordersA.length !== ordersB.length) return false;
    for (let i = 0; i < ordersA.length; i++) if (ordersA[i] !== ordersB[i]) return false;
  }
  return true;
}

/**
 * Compare individual properties between old and new columns
 */
function compareColumnProperties(
  oldColumn: any,
  newAttribute: Attribute,
  columnType: string
): ColumnPropertyChange[] {
  const changes: ColumnPropertyChange[] = [];
  const t = String(columnType || (newAttribute as any).type || '').toLowerCase();
  const key = newAttribute?.key || 'unknown';

  const mutableProps = (MUTABLE_PROPERTIES as any)[t] || [];
  const immutableProps = (IMMUTABLE_PROPERTIES as any)[t] || [];

  const getNewVal = (prop: string) => {
    const na = newAttribute as any;
    if (prop === 'default') return na.xdefault;
    if (prop === 'encrypt') return na.encrypt;
    return na[prop];
  };
  const getOldVal = (prop: string) => {
    if (prop === 'default') return oldColumn?.default ?? oldColumn?.xdefault;
    return oldColumn?.[prop];
  };

  for (const prop of mutableProps) {
    const oldValue = getOldVal(prop);
    let newValue = getNewVal(prop);
    // Special-case: enum elements empty/missing should not trigger updates
    if (t === 'enum' && prop === 'elements') {
      if (!Array.isArray(newValue) || newValue.length === 0) {
        newValue = oldValue;
      }
    }
    if (Array.isArray(oldValue) && Array.isArray(newValue)) {
      if (oldValue.length !== newValue.length || oldValue.some((v: any, i: number) => v !== newValue[i])) {
        changes.push({ property: prop, oldValue, newValue, requiresRecreate: false });
      }
    } else if (oldValue !== newValue) {
      changes.push({ property: prop, oldValue, newValue, requiresRecreate: false });
    }
  }

  for (const prop of immutableProps) {
    const oldValue = getOldVal(prop);
    const newValue = getNewVal(prop);
    if (Array.isArray(oldValue) && Array.isArray(newValue)) {
      if (oldValue.length !== newValue.length || oldValue.some((v: any, i: number) => v !== newValue[i])) {
        changes.push({ property: prop, oldValue, newValue, requiresRecreate: true });
      }
    } else if (oldValue !== newValue) {
      changes.push({ property: prop, oldValue, newValue, requiresRecreate: true });
    }
  }

  // Type change requires recreate (normalize string+elements to enum on old side)
  const oldTypeRaw = String(oldColumn?.type || oldColumn?.columnType || '').toLowerCase();
  const oldHasElements = Array.isArray(oldColumn?.elements) && (oldColumn.elements as any[]).length > 0;
  const oldHasEnumFormat = (oldColumn?.format === 'enum');
  const oldType = oldTypeRaw === 'string' && (oldHasElements || oldHasEnumFormat) ? 'enum' : oldTypeRaw;
  if (oldType && t && oldType !== t && TYPE_CHANGE_REQUIRES_RECREATE.includes(oldType)) {
    changes.push({ property: 'type', oldValue: oldType, newValue: t, requiresRecreate: true });
  }
  return changes;
}

/**
 * Analyze what changes are needed for a specific column
 */
function analyzeColumnChanges(
  oldColumn: any,
  newAttribute: Attribute
): ColumnChangeAnalysis {
  const columnType = String((newAttribute as any).type || 'string').toLowerCase();
  const columnKey = (newAttribute as any).key;


  // Use normalized comparison to reduce false positives then property-wise details
  const normalizedOld = normalizeColumnToComparable(oldColumn);
  const normalizedNew = normalizeAttributeToComparable(newAttribute);
  const hasAnyDiff = !shallowEqual(normalizedOld, normalizedNew);

  const changes = hasAnyDiff ? compareColumnProperties(oldColumn, newAttribute, columnType) : [];
  const requiresRecreate = changes.some((c) => c.requiresRecreate);

  const mutableChanges: Record<string, { old: any; new: any }> = {};
  const immutableChanges: Record<string, { old: any; new: any }> = {};
  for (const c of changes) {
    if (c.requiresRecreate) immutableChanges[c.property] = { old: c.oldValue, new: c.newValue };
    else mutableChanges[c.property] = { old: c.oldValue, new: c.newValue };
  }

  return {
    columnKey,
    columnType,
    hasChanges: changes.length > 0,
    requiresRecreate,
    changes,
    mutableChanges,
    immutableChanges,
  };
}

/**
 * Enhanced version of columns diff with detailed change analysis
 * Order: desired first, then existing (matches internal usage here)
 * Handles case-insensitive key matches as renames (recreates)
 */
export function diffColumnsDetailed(
  desiredAttributes: Attribute[],
  existingColumns: any[]
): ColumnOperationPlan {
  // Exact key lookup (case-sensitive)
  const byKey = new Map((existingColumns || []).map((col: any) => [col?.key, col] as const));
  // Case-insensitive key lookup for detecting renames
  const byKeyLower = new Map((existingColumns || []).map((col: any) => [col?.key?.toLowerCase(), col] as const));

  const toCreate: Attribute[] = [];
  const toUpdate: Array<{ attribute: Attribute; changes: ColumnPropertyChange[] }> = [];
  const toRecreate: Array<{ oldAttribute: any; newAttribute: Attribute }> = [];
  const unchanged: string[] = [];
  const handledExistingKeys = new Set<string>(); // Track which existing columns we've handled

  for (const attr of desiredAttributes || []) {
    const key = (attr as any)?.key;
    if (!key) continue;

    // First try exact match
    const exactMatch = byKey.get(key);
    if (exactMatch) {
      handledExistingKeys.add(key);
      const analysis = analyzeColumnChanges(exactMatch, attr);
      if (!analysis.hasChanges) unchanged.push(analysis.columnKey);
      else if (analysis.requiresRecreate) toRecreate.push({ oldAttribute: exactMatch, newAttribute: attr });
      else toUpdate.push({ attribute: attr, changes: analysis.changes });
      continue;
    }

    // Check for case-insensitive match (rename scenario like oAuthAccounts -> oauthAccounts)
    const caseInsensitiveMatch = byKeyLower.get(key.toLowerCase());
    if (caseInsensitiveMatch && caseInsensitiveMatch.key !== key) {
      // This is a rename - treat as recreate (delete old, create new)
      handledExistingKeys.add(caseInsensitiveMatch.key);
      toRecreate.push({ oldAttribute: caseInsensitiveMatch, newAttribute: attr });
      continue;
    }

    // No match - it's a new attribute
    toCreate.push(attr);
  }

  // Note: we keep toDelete empty for now (conservative behavior)
  // Deletions are handled separately in methods.ts
  return { toCreate, toUpdate, toRecreate, toDelete: [], unchanged };
}

/**
 * Returns true if there is any difference between existing columns and desired attributes
 */
export function areTableColumnsDiff(existingColumns: any[], desired: Attribute[]): boolean {
  const byKey = new Map<string, any>();
  for (const c of existingColumns || []) {
    if (c?.key) byKey.set(c.key, c);
  }
  for (const attr of desired || []) {
    const desiredNorm = normalizeAttributeToComparable(attr);
    const existing = byKey.get(desiredNorm.key);
    if (!existing) return true;
    const existingNorm = normalizeColumnToComparable(existing);
    if (!shallowEqual(desiredNorm, existingNorm)) return true;
  }
  // Extra columns on remote also constitute a diff
  const desiredKeys = new Set((desired || []).map((a: any) => a.key));
  for (const k of byKey.keys()) if (!desiredKeys.has(k)) return true;
  return false;
}

export function diffTableColumns(existingColumns: any[], desired: Attribute[]): {
  toCreate: Attribute[];
  toUpdate: Attribute[];
  unchanged: string[];
} {
  // Use detailed plan but return legacy structure for compatibility
  const plan = diffColumnsDetailed(desired, existingColumns);
  const toUpdate: Attribute[] = [
    ...plan.toUpdate.map((u) => u.attribute),
    ...plan.toRecreate.map((r) => r.newAttribute),
  ];
  return { toCreate: plan.toCreate, toUpdate, unchanged: plan.unchanged };
}

/**
 * Execute the column operation plan using the adapter
 */
export async function executeColumnOperations(
  adapter: any,
  databaseId: string,
  tableId: string,
  plan: ColumnOperationPlan
): Promise<{ success: string[]; errors: Array<{ column: string; error: string }> }> {
  if (!databaseId || !tableId) throw new Error('Database ID and Table ID are required for column operations');
  if (!adapter || typeof adapter.createAttribute !== 'function') throw new Error('Valid adapter is required for column operations');

  const results: { success: string[]; errors: Array<{ column: string; error: string }> } = { success: [], errors: [] };

  const exec = async (fn: () => Promise<any>, key: string, op: string) => {
    try {
      await fn();
      results.success.push(`${op}: ${key}`);
    } catch (e: any) {
      results.errors.push({ column: key, error: `${op} failed: ${e?.message || String(e)}` });
    }
  };

  for (const attr of plan.toCreate) {
    const params = mapToCreateAttributeParams(attr as any, { databaseId, tableId });
    await exec(() => adapter.createAttribute(params), (attr as any).key, 'CREATE');
  }

  for (const { attribute } of plan.toUpdate) {
    const params = mapToUpdateAttributeParams(attribute as any, { databaseId, tableId });
    await exec(() => adapter.updateAttribute(params), (attribute as any).key, 'UPDATE');
  }

  for (const { oldAttribute, newAttribute } of plan.toRecreate) {
    await exec(() => adapter.deleteAttribute({ databaseId, tableId, key: oldAttribute.key }), oldAttribute.key, 'DELETE (for recreate)');
    // Wait until the attribute is actually removed (or no longer 'deleting') before recreating
    try {
      const start = Date.now();
      const maxWaitMs = 60000; // 60s
      while (Date.now() - start < maxWaitMs) {
        try {
          const tableRes = await adapter.getTable({ databaseId, tableId });
          const cols = (tableRes?.data?.columns || tableRes?.data?.attributes || []) as any[];
          const found = cols.find((c: any) => c.key === oldAttribute.key);
          if (!found) break; // fully removed
          if (found.status && found.status !== 'deleting') break; // no longer deleting (failed/stuck) -> stop waiting
        } catch {}
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch {}
    const params = mapToCreateAttributeParams(newAttribute as any, { databaseId, tableId });
    await exec(() => adapter.createAttribute(params), (newAttribute as any).key, 'CREATE (after recreate)');
  }

  return results;
}

/**
 * Integration function for methods.ts - processes columns using enhanced logic
 */
export async function processTableColumns(
  adapter: any,
  databaseId: string,
  tableId: string,
  desiredAttributes: Attribute[],
  existingColumns: any[] = []
): Promise<{
  totalProcessed: number;
  success: string[];
  errors: Array<{ column: string; error: string }>;
  summary: { created: number; updated: number; recreated: number; unchanged: number };
}> {
  if (!existingColumns || existingColumns.length === 0) {
    const tableInfo = await adapter.getTable({ databaseId, tableId });
    existingColumns = (tableInfo?.data?.columns || tableInfo?.data?.attributes || []) as any[];
  }

  const plan = diffColumnsDetailed(desiredAttributes, existingColumns);
  const results = await executeColumnOperations(adapter, databaseId, tableId, plan);

  return {
    totalProcessed: plan.toCreate.length + plan.toUpdate.length + plan.toRecreate.length,
    success: results.success,
    errors: results.errors,
    summary: {
      created: plan.toCreate.length,
      updated: plan.toUpdate.length,
      recreated: plan.toRecreate.length,
      unchanged: plan.unchanged.length,
    },
  };
}
