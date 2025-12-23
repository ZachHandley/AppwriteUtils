import type { CreateAttributeParams, UpdateAttributeParams } from "../adapters/DatabaseAdapter.js";
import type { Attribute } from "appwrite-utils";

function ensureNumber(n: any): number | undefined {
  if (n === null || n === undefined) return undefined;
  const num = Number(n);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * Map a schema Attribute into DatabaseAdapter CreateAttributeParams
 * Only includes fields valid for the specific type to satisfy TS unions.
 * Also normalizes min/max ordering for numeric types to avoid server errors.
 */
export function mapToCreateAttributeParams(
  attr: Attribute,
  base: { databaseId: string; tableId: string }
): CreateAttributeParams {
  const type = String((attr as any).type || "").toLowerCase();
  const required = !!(attr as any).required;
  const array = !!(attr as any).array;
  const xdefault = (attr as any).xdefault;
  const encrypt = (attr as any).encrypt;

  // Numeric helpers
  const rawMin = ensureNumber((attr as any).min);
  const rawMax = ensureNumber((attr as any).max);
  let min = rawMin;
  let max = rawMax;
  if (min !== undefined && max !== undefined && min >= max) {
    // Swap to satisfy server-side validation
    const tmp = min;
    min = Math.min(min, max);
    max = Math.max(tmp, max);
    if (min === max) {
      // If still equal, unset max to avoid error
      max = undefined;
    }
  }

  switch (type) {
    case "string":
      return {
        databaseId: base.databaseId,
        tableId: base.tableId,
        key: attr.key,
        type,
        size: (attr as any).size ?? 255,
        required,
        default: xdefault,
        array,
        encrypt: !!encrypt,
      };

    case "integer":
      return {
        databaseId: base.databaseId,
        tableId: base.tableId,
        key: attr.key,
        type,
        required,
        default: xdefault,
        array,
        min,
        max,
      };

    case "double":
    case "float":
      return {
        databaseId: base.databaseId,
        tableId: base.tableId,
        key: attr.key,
        type,
        required,
        default: xdefault,
        array,
        min,
        max,
      };

    case "boolean":
      return {
        databaseId: base.databaseId,
        tableId: base.tableId,
        key: attr.key,
        type,
        required,
        default: xdefault,
        array,
      };

    case "datetime":
    case "email":
    case "ip":
    case "url":
      return {
        databaseId: base.databaseId,
        tableId: base.tableId,
        key: attr.key,
        type,
        required,
        default: xdefault,
        array,
      };

    case "enum":
      {
        const elements = (attr as any).elements;
        if (!Array.isArray(elements) || elements.length === 0) {
          // Creating an enum without elements is invalid – fail fast with clear messaging
          throw new Error(
            `Enum attribute '${(attr as any).key}' requires a non-empty 'elements' array for creation`
          );
        }
      }
      return {
        databaseId: base.databaseId,
        tableId: base.tableId,
        key: attr.key,
        type,
        required,
        default: xdefault,
        array,
        elements: (attr as any).elements,
      };

    case "relationship": {
      // Relationship attributes require related collection and metadata
      return {
        databaseId: base.databaseId,
        tableId: base.tableId,
        key: attr.key,
        type,
        relatedCollection: (attr as any).relatedCollection,
        relationType: (attr as any).relationType,
        twoWay: (attr as any).twoWay,
        twoWayKey: (attr as any).twoWayKey,
        onDelete: (attr as any).onDelete,
        side: (attr as any).side,
      } as unknown as CreateAttributeParams;
    }

    default:
      return {
        databaseId: base.databaseId,
        tableId: base.tableId,
        key: attr.key,
        type,
        required,
      } as CreateAttributeParams;
  }
}

/**
 * Map a schema Attribute into DatabaseAdapter UpdateAttributeParams
 * Omits fields that are not explicitly provided, and guards enum updates
 * so we never send an empty elements array (preserve existing on server).
 */
export function mapToUpdateAttributeParams(
  attr: Attribute,
  base: { databaseId: string; tableId: string }
): UpdateAttributeParams {
  const type = String((attr.type == 'string' && attr.format !== 'enum') || attr.type !== 'string' ? (attr as any).type : 'enum').toLowerCase();
  const params: UpdateAttributeParams = {
    databaseId: base.databaseId,
    tableId: base.tableId,
    key: (attr as any).key,
  };

  const setIfDefined = <K extends keyof UpdateAttributeParams>(
    key: K,
    value: UpdateAttributeParams[K]
  ) => {
    if (value !== undefined) (params as any)[key] = value;
  };

  // Common fields
  setIfDefined("type", type);
  setIfDefined("required", (attr as any).required);
  // Only send default if explicitly provided and not on required
  if (!(attr as any).required && (attr as any).xdefault !== undefined) {
    setIfDefined("default", (attr as any).xdefault as any);
  }
  setIfDefined("array", (attr as any).array);
  // encrypt only applies to string types
  if (type === "string") setIfDefined("encrypt", (attr as any).encrypt);

  // Numeric normalization
  const toNum = (n: any) => (n === null || n === undefined ? undefined : (Number(n)));
  let min = toNum((attr as any).min);
  let max = toNum((attr as any).max);
  if (min !== undefined && max !== undefined && min >= max) {
    const tmp = min;
    min = Math.min(min, max);
    max = Math.max(tmp, max);
    if (min === max) max = undefined;
  }

  switch (type) {
    case "string":
      setIfDefined("size", (attr as any).size);
      break;
    case "integer":
    case "float":
    case "double":
      setIfDefined("min", min);
      setIfDefined("max", max);
      break;
    case "enum": {
      const elements = (attr as any).elements;
      if (Array.isArray(elements) && elements.length > 0) {
        // Only include when non-empty; otherwise preserve existing on server
        setIfDefined("elements", elements as string[]);
      }
      break;
    }
    case "relationship": {
      setIfDefined("relatedCollection", (attr as any).relatedCollection);
      setIfDefined("relationType", (attr as any).relationType);
      setIfDefined("twoWay", (attr as any).twoWay);
      setIfDefined("twoWayKey", (attr as any).twoWayKey);
      setIfDefined("onDelete", (attr as any).onDelete);
      break;
    }
  }

  return params;
}
