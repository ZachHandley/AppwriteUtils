import { z } from "zod";
import { Decimal } from "decimal.js";

const MIN_MAX_THRESHOLD = 1_000_000_000_000;
const EXTREME_MIN_INTEGER = -9223372036854776000;
const EXTREME_MAX_INTEGER = 9223372036854776000;

const allowedStringFormats = new Set(["email", "ip", "url", "datetime"]);

const normalizeNumericBoundary = (
  value: number | undefined,
  extreme: number
): number | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  // Use Decimal.js for precise comparison with extreme values
  try {
    const valueDecimal = new Decimal(value.toString());
    const extremeDecimal = new Decimal(extreme.toString());
    const thresholdDecimal = new Decimal(MIN_MAX_THRESHOLD.toString());

    // Check if value equals extreme value or exceeds threshold
    if (valueDecimal.equals(extremeDecimal) || valueDecimal.abs().greaterThanOrEqualTo(thresholdDecimal)) {
      return undefined;
    }
  } catch (error) {
    // Fallback to original logic if Decimal.js fails
    console.warn(`Failed to compare numeric boundary with Decimal.js, falling back to Number comparison:`, error);
    if (Math.abs(value) >= MIN_MAX_THRESHOLD || value === extreme) {
      return undefined;
    }
  }

  return value;
};

/**
 * Shared schema across attribute types.
 * Includes keys that Appwrite returns on all attributes along with
 * optional metadata (attributes/orders) used when normalizing indexes.
 */
export const baseAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  status: z
    .string()
    .optional()
    .describe("The current lifecycle status returned by Appwrite"),
  attributes: z
    .array(z.string())
    .optional()
    .describe(
      "Optional list of dependent attribute keys (used by index metadata)"
    ),
  orders: z
    .array(z.string())
    .optional()
    .describe(
      "Optional list of sort directions aligned with the attributes array"
    ),
  error: z
    .string()
    .optional()
    .describe("The error message if the attribute is invalid"),
  required: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether the attribute is required or not"),
  array: z
    .boolean()
    .optional()
    .describe("Whether the attribute is an array or not"),
  $createdAt: z
    .string()
    .optional()
    .describe("ISO timestamp when the attribute or column was created"),
  $updatedAt: z
    .string()
    .optional()
    .describe("ISO timestamp when the attribute or column was last updated"),
  format: z
    .string()
    .optional()
    .describe("Original format hint supplied by Appwrite for string types"),
});

/**
 * Helper to build schemas based on the base attribute definition.
 * The base definition already includes common fields, so individual schemas
 * only need to add type-specific properties.
 */
const extendBase = <T extends z.ZodRawShape>(shape: T) =>
  baseAttributeSchema.omit({ error: true }).extend({
    // Keep `error` optional without a default so it doesn't
    // become required in the discriminated union's output type.
    error: z
      .string()
      .optional()
      .describe("The error message if the attribute is invalid"),
    ...shape,
  });

export const stringAttributeSchema = extendBase({
  type: z.literal("string").describe("The type of the attribute"),
  size: z
    .number()
    .optional()
    .default(50)
    .describe("The max length or size of the attribute"),
  xdefault: z.string().nullish().describe("The default value of the attribute"),
  encrypt: z
    .boolean()
    .optional()
    .describe("Whether the attribute is encrypted or not"),
});

export const integerAttributeSchema = extendBase({
  type: z.literal("integer").describe("The type of the attribute"),
  min: z
    .number()
    .optional()
    .describe("The minimum value of the attribute"),
  max: z
    .number()
    .optional()
    .describe("The maximum value of the attribute"),
  xdefault: z
    .number()
    .nullish()
    .describe("The default value of the attribute"),
}).overwrite((attribute) => {
  const { min, max, ...rest } = attribute;
  const normalizedMin = normalizeNumericBoundary(min, EXTREME_MIN_INTEGER);
  const normalizedMax = normalizeNumericBoundary(max, EXTREME_MAX_INTEGER);

  const normalized = { ...rest } as typeof attribute;

  if (normalizedMin !== undefined) {
    normalized.min = Math.trunc(normalizedMin);
  } else {
    delete normalized.min;
  }

  if (normalizedMax !== undefined) {
    normalized.max = Math.trunc(normalizedMax);
  } else {
    delete normalized.max;
  }

  return normalized;
});

export const doubleAttributeSchema = extendBase({
  type: z.literal("double").describe("The type of the attribute"),
  min: z.number().optional().describe("The minimum value of the attribute"),
  max: z.number().optional().describe("The maximum value of the attribute"),
  xdefault: z.number().nullish().describe("The default value of the attribute"),
});

export const floatAttributeSchema = extendBase({
  type: z
    .literal("float")
    .describe("The type of the attribute (backwards compatibility)"),
  min: z.number().optional().describe("The minimum value of the attribute"),
  max: z.number().optional().describe("The maximum value of the attribute"),
  xdefault: z.number().nullish().describe("The default value of the attribute"),
});

export const booleanAttributeSchema = extendBase({
  type: z.literal("boolean").describe("The type of the attribute"),
  xdefault: z
    .boolean()
    .nullish()
    .describe("The default value of the attribute"),
});

export const datetimeAttributeSchema = extendBase({
  type: z.literal("datetime").describe("The type of the attribute"),
  xdefault: z.string().nullish().describe("The default value of the attribute"),
});

export const emailAttributeSchema = extendBase({
  type: z.literal("email").describe("The type of the attribute"),
  xdefault: z.string().nullish().describe("The default value of the attribute"),
});

export const ipAttributeSchema = extendBase({
  type: z.literal("ip").describe("The type of the attribute"),
  xdefault: z.string().nullish().describe("The default value of the attribute"),
});

export const urlAttributeSchema = extendBase({
  type: z.literal("url").describe("The type of the attribute"),
  xdefault: z.string().nullish().describe("The default value of the attribute"),
});

export const enumAttributeSchema = extendBase({
  type: z.literal("enum").describe("The type of the attribute"),
  elements: z
    .array(z.string())
    .default([])
    .describe("The elements of the enum attribute"),
  xdefault: z.string().nullish().describe("The default value of the attribute"),
});

export const relationshipAttributeSchema = extendBase({
  type: z.literal("relationship").describe("The type of the attribute"),
  // Appwrite < 1.8 emits `relatedCollection`; >= 1.8 emits `relatedTable`.
  // Accept either, require at least one via superRefine, and mirror them
  // in the transform so downstream code can keep reading `relatedCollection`.
  relatedCollection: z
    .string()
    .optional()
    .describe(
      "The collection/table ID of the related collection. Appwrite < 1.8 emits this; provide either this or `relatedTable`."
    ),
  relatedTable: z
    .string()
    .optional()
    .describe(
      "The table ID of the related table. Appwrite >= 1.8 emits this; provide either this or `relatedCollection`."
    ),
  relationType: z
    .enum(["oneToMany", "manyToOne", "oneToOne", "manyToMany"])
    .describe("The relation type of the relationship attribute"),
  twoWay: z.boolean().describe("Whether the relationship is two way or not"),
  twoWayKey: z
    .string()
    .optional()
    .describe(
      "The ID of the foreign key in the other collection (required when twoWay is true)"
    ),
  onDelete: z
    .enum(["setNull", "cascade", "restrict"])
    .default("setNull")
    .describe("The action to take when the related document is deleted"),
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
}).superRefine((val, ctx) => {
  if (!val.relatedCollection && !val.relatedTable) {
    ctx.addIssue({
      code: "custom",
      path: ["relatedCollection"],
      message:
        "relationship attribute requires either `relatedCollection` (Appwrite < 1.8) or `relatedTable` (Appwrite >= 1.8)",
    });
  }
  if (val.twoWay) {
    if (!val.twoWayKey) {
      ctx.addIssue({
        code: "custom",
        path: ["twoWayKey"],
        message: "twoWayKey is required when twoWay is true",
      });
    }
    if (!val.side) {
      ctx.addIssue({
        code: "custom",
        path: ["side"],
        message: "side is required when twoWay is true",
      });
    }
  }
});

// Text variant attribute schemas (node-appwrite v22+)
export const varcharAttributeSchema = extendBase({
  type: z.literal("varchar").describe("The type of the attribute"),
  size: z.number().optional().describe("The max length of the attribute"),
  xdefault: z.string().nullish().describe("The default value of the attribute"),
  encrypt: z.boolean().optional().describe("Whether the attribute is encrypted or not"),
});

export const textAttributeSchema = extendBase({
  type: z.literal("text").describe("The type of the attribute"),
  xdefault: z.string().nullish().describe("The default value of the attribute"),
  encrypt: z.boolean().optional().describe("Whether the attribute is encrypted or not"),
});

export const mediumtextAttributeSchema = extendBase({
  type: z.literal("mediumtext").describe("The type of the attribute"),
  xdefault: z.string().nullish().describe("The default value of the attribute"),
  encrypt: z.boolean().optional().describe("Whether the attribute is encrypted or not"),
});

export const longtextAttributeSchema = extendBase({
  type: z.literal("longtext").describe("The type of the attribute"),
  xdefault: z.string().nullish().describe("The default value of the attribute"),
  encrypt: z.boolean().optional().describe("Whether the attribute is encrypted or not"),
});

// Geospatial attribute schemas (node-appwrite v22+)
export const pointAttributeSchema = extendBase({
  type: z.literal("point").describe("The type of the attribute"),
  xdefault: z.array(z.any()).nullish().describe("The default value of the attribute"),
});

export const lineAttributeSchema = extendBase({
  type: z.literal("line").describe("The type of the attribute"),
  xdefault: z.array(z.any()).nullish().describe("The default value of the attribute"),
});

export const polygonAttributeSchema = extendBase({
  type: z.literal("polygon").describe("The type of the attribute"),
  xdefault: z.array(z.any()).nullish().describe("The default value of the attribute"),
});

const attributeVariants = z.discriminatedUnion("type", [
  stringAttributeSchema,
  integerAttributeSchema,
  doubleAttributeSchema,
  floatAttributeSchema,
  booleanAttributeSchema,
  datetimeAttributeSchema,
  emailAttributeSchema,
  ipAttributeSchema,
  urlAttributeSchema,
  enumAttributeSchema,
  relationshipAttributeSchema,
  varcharAttributeSchema,
  textAttributeSchema,
  mediumtextAttributeSchema,
  longtextAttributeSchema,
  pointAttributeSchema,
  lineAttributeSchema,
  polygonAttributeSchema,
]);

const attributeDefaultValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.any()),
  z.null(),
]);

const attributeNormalizerSchema = z
  .object({
    key: z.string(),
    type: z.string(),
    attributes: z.array(z.string()).optional(),
    orders: z.array(z.string()).optional(),
    error: z.string().optional(),
    required: z.boolean().optional(),
    array: z.boolean().optional(),
    default: attributeDefaultValueSchema.optional(),
    xdefault: attributeDefaultValueSchema.optional(),
    format: z.string().optional(),
    size: z.union([z.number(), z.string()]).optional(),
    min: z.union([z.number(), z.string(), z.bigint()]).optional(),
    max: z.union([z.number(), z.string(), z.bigint()]).optional(),
    elements: z.array(z.string()).optional(),
    encrypt: z.boolean().optional(),
    relatedCollection: z.string().optional(),
    relationType: z.string().optional(),
    twoWay: z.boolean().optional(),
    twoWayKey: z.string().optional(),
    onDelete: z.string().optional(),
    side: z.string().optional(),
    importMapping: z
      .object({
        originalIdField: z.string(),
        targetField: z.string().optional(),
      })
      .optional(),
  })
  .loose()
  .overwrite((raw) => {
    const {
      default: defaultValue,
      format,
      attributes: rawAttributes,
      orders: rawOrders,
      size: rawSize,
      min: rawMin,
      max: rawMax,
      ...rest
    } = raw;

    const normalizedAttributes = Array.isArray(rawAttributes)
      ? rawAttributes.filter(
          (value): value is string => typeof value === "string"
        )
      : undefined;

    const normalizedOrders = Array.isArray(rawOrders)
      ? rawOrders.filter((value): value is string => typeof value === "string")
      : undefined;

    const normalizedTypeBase = raw.type?.toString().toLowerCase() ?? "string";

    let normalizedType = normalizedTypeBase;
    if (normalizedTypeBase === "string" && format) {
      const candidate = format
        .toString()
        .toLowerCase()
        .replace(/[^a-z]/g, "");
      if (allowedStringFormats.has(candidate)) {
        normalizedType = candidate;
      }
    }

    const required = raw.required ?? false;
    const array = raw.array ?? false;

    const defaultCandidate =
      defaultValue !== undefined ? defaultValue : raw.xdefault;
    const xdefault =
      !required && defaultCandidate !== undefined && defaultCandidate !== null
        ? defaultCandidate
        : undefined;

    const toNumber = (value: unknown): number | undefined => {
      if (value === undefined || value === null) {
        return undefined;
      }

      // Handle bigint values from node-appwrite v23+
      if (typeof value === 'bigint') {
        const num = Number(value);
        if (Math.abs(num) >= MIN_MAX_THRESHOLD) {
          return undefined;
        }
        return num;
      }

      // Handle string values that might be too large for Number()
      if (typeof value === 'string') {
        try {
          const decimal = new Decimal(value);
          // Check if the decimal is within safe JavaScript number range
          if (decimal.abs().greaterThan(Number.MAX_SAFE_INTEGER)) {
            // For values larger than MAX_SAFE_INTEGER, keep as string to preserve precision
            // But return undefined if it's an extreme database value
            const numValue = decimal.toNumber();
            if (Math.abs(numValue) >= MIN_MAX_THRESHOLD) {
              return undefined;
            }
            // For other large values, we still need to return a number for the schema
            // but log a warning about potential precision loss
            console.warn(`Large number value '${value}' may lose precision when converted to JavaScript number`);
            return numValue;
          }
          return decimal.toNumber();
        } catch (error) {
          // If Decimal parsing fails, fall back to Number()
          console.warn(`Failed to parse large number value '${value}' with Decimal.js:`, error);
        }
      }

      const numeric = Number(value);
      return Number.isNaN(numeric) ? undefined : numeric;
    };

    const size = toNumber(rawSize);
    const min = toNumber(rawMin);
    const max = toNumber(rawMax);

    const normalized = {
      ...rest,
    } as typeof raw;

    normalized.type = normalizedType;
    normalized.required = required;
    normalized.array = array;

    if (normalizedAttributes) {
      normalized.attributes = normalizedAttributes;
    } else {
      delete normalized.attributes;
    }

    if (normalizedOrders) {
      normalized.orders = normalizedOrders;
    } else {
      delete normalized.orders;
    }

    if (size !== undefined) {
      normalized.size = size;
    } else {
      delete normalized.size;
    }

    if (min !== undefined) {
      normalized.min = min;
    } else {
      delete normalized.min;
    }

    if (max !== undefined) {
      normalized.max = max;
    } else {
      delete normalized.max;
    }

    if (xdefault !== undefined) {
      normalized.xdefault = xdefault as typeof normalized.xdefault;
    } else {
      delete normalized.xdefault;
    }

    if ("twoWay" in normalized) {
      normalized.twoWay = Boolean(
        (normalized as typeof normalized & { twoWay?: boolean }).twoWay
      );
    }

    delete (normalized as any).default;
    delete (normalized as any).format;

    if (typeof normalized.status !== "string" || normalized.status.length === 0) {
      normalized.status = "available";
    }

    // Don't force set error here - let individual schemas handle defaults
    // This prevents TypeScript conflicts where error appears required

    if (normalized.array === undefined || normalized.array === null) {
      normalized.array = false;
    }

    return normalized;
  });

export const attributeSchema =
  attributeNormalizerSchema.pipe(attributeVariants);

export type BaseAttribute = z.infer<typeof baseAttributeSchema>;
export type StringAttribute = z.infer<typeof stringAttributeSchema>;
export type IntegerAttribute = z.infer<typeof integerAttributeSchema>;
export type DoubleAttribute = z.infer<typeof doubleAttributeSchema>;
export type FloatAttribute = z.infer<typeof floatAttributeSchema>;
export type BooleanAttribute = z.infer<typeof booleanAttributeSchema>;
export type DatetimeAttribute = z.infer<typeof datetimeAttributeSchema>;
export type EmailAttribute = z.infer<typeof emailAttributeSchema>;
export type IpAttribute = z.infer<typeof ipAttributeSchema>;
export type UrlAttribute = z.infer<typeof urlAttributeSchema>;
export type EnumAttribute = z.infer<typeof enumAttributeSchema>;
export type RelationshipAttribute = z.infer<typeof relationshipAttributeSchema>;
export type VarcharAttribute = z.infer<typeof varcharAttributeSchema>;
export type TextAttribute = z.infer<typeof textAttributeSchema>;
export type MediumtextAttribute = z.infer<typeof mediumtextAttributeSchema>;
export type LongtextAttribute = z.infer<typeof longtextAttributeSchema>;
export type PointAttribute = z.infer<typeof pointAttributeSchema>;
export type LineAttribute = z.infer<typeof lineAttributeSchema>;
export type PolygonAttribute = z.infer<typeof polygonAttributeSchema>;

export const attributesSchema = z.array(attributeSchema);

export type Attribute = z.infer<typeof attributeSchema>;
export type Attributes = z.infer<typeof attributesSchema>;
export type Column = Attribute; // Alias for clarity in TablesDB
export type Columns = Attributes; // Alias for clarity in TablesDB
