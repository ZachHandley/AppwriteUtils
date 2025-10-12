import { Query, type Databases, type Models } from "node-appwrite";
import {
  attributeSchema,
  parseAttribute,
  type Attribute,
} from "appwrite-utils";
import {
  nameToIdMapping,
  enqueueOperation,
  markAttributeProcessed,
  isAttributeProcessed
} from "../shared/operationQueue.js";
import { delay, tryAwaitWithRetry, calculateExponentialBackoff } from "../utils/helperFunctions.js";
import chalk from "chalk";
import type { DatabaseAdapter, CreateAttributeParams, UpdateAttributeParams, DeleteAttributeParams } from "../adapters/DatabaseAdapter.js";
import { logger } from "../shared/logging.js";
import { MessageFormatter } from "../shared/messageFormatter.js";
import { isDatabaseAdapter } from "../utils/typeGuards.js";

// Threshold for treating min/max values as undefined (1 trillion)
const MIN_MAX_THRESHOLD = 1_000_000_000_000;

// Extreme values that Appwrite may return, which should be treated as undefined
const EXTREME_MIN_INTEGER = -9223372036854776000;
const EXTREME_MAX_INTEGER = 9223372036854776000;
const EXTREME_MIN_FLOAT = -1.7976931348623157e+308;
const EXTREME_MAX_FLOAT = 1.7976931348623157e+308;

/**
 * Type guard to check if an attribute has min/max properties
 */
const hasMinMaxProperties = (attribute: Attribute): attribute is Attribute & { min?: number; max?: number } => {
  return attribute.type === 'integer' || attribute.type === 'double' || attribute.type === 'float';
};

/**
 * Normalizes min/max values for integer and float attributes
 * Sets values to undefined if they exceed the threshold or are extreme values from database
 */
const normalizeMinMaxValues = (attribute: Attribute): { min?: number; max?: number } => {
  if (!hasMinMaxProperties(attribute)) {
    logger.debug(`Attribute '${attribute.key}' does not have min/max properties`, {
      type: attribute.type,
      operation: 'normalizeMinMaxValues'
    });
    return {};
  }

  const { type, min, max } = attribute;
  let normalizedMin = min;
  let normalizedMax = max;

  logger.debug(`Normalizing min/max values for attribute '${attribute.key}'`, {
    type,
    originalMin: min,
    originalMax: max,
    operation: 'normalizeMinMaxValues'
  });

  // Handle min value
  if (normalizedMin !== undefined && normalizedMin !== null) {
    const minValue = Number(normalizedMin);
    const originalMin = normalizedMin;

    // Check if it exceeds threshold or is an extreme database value
    if (type === 'integer') {
      if (Math.abs(minValue) >= MIN_MAX_THRESHOLD || minValue === EXTREME_MIN_INTEGER) {
        logger.debug(`Min value normalized to undefined for attribute '${attribute.key}'`, {
          type,
          originalValue: originalMin,
          numericValue: minValue,
          reason: Math.abs(minValue) >= MIN_MAX_THRESHOLD ? 'exceeds_threshold' : 'extreme_database_value',
          threshold: MIN_MAX_THRESHOLD,
          extremeValue: EXTREME_MIN_INTEGER,
          operation: 'normalizeMinMaxValues'
        });
        normalizedMin = undefined;
      }
    } else { // float/double
      if (Math.abs(minValue) >= MIN_MAX_THRESHOLD || minValue === EXTREME_MIN_FLOAT) {
        logger.debug(`Min value normalized to undefined for attribute '${attribute.key}'`, {
          type,
          originalValue: originalMin,
          numericValue: minValue,
          reason: Math.abs(minValue) >= MIN_MAX_THRESHOLD ? 'exceeds_threshold' : 'extreme_database_value',
          threshold: MIN_MAX_THRESHOLD,
          extremeValue: EXTREME_MIN_FLOAT,
          operation: 'normalizeMinMaxValues'
        });
        normalizedMin = undefined;
      }
    }
  }

  // Handle max value
  if (normalizedMax !== undefined && normalizedMax !== null) {
    const maxValue = Number(normalizedMax);
    const originalMax = normalizedMax;

    // Check if it exceeds threshold or is an extreme database value
    if (type === 'integer') {
      if (Math.abs(maxValue) >= MIN_MAX_THRESHOLD || maxValue === EXTREME_MAX_INTEGER) {
        logger.debug(`Max value normalized to undefined for attribute '${attribute.key}'`, {
          type,
          originalValue: originalMax,
          numericValue: maxValue,
          reason: Math.abs(maxValue) >= MIN_MAX_THRESHOLD ? 'exceeds_threshold' : 'extreme_database_value',
          threshold: MIN_MAX_THRESHOLD,
          extremeValue: EXTREME_MAX_INTEGER,
          operation: 'normalizeMinMaxValues'
        });
        normalizedMax = undefined;
      }
    } else { // float/double
      if (Math.abs(maxValue) >= MIN_MAX_THRESHOLD || maxValue === EXTREME_MAX_FLOAT) {
        logger.debug(`Max value normalized to undefined for attribute '${attribute.key}'`, {
          type,
          originalValue: originalMax,
          numericValue: maxValue,
          reason: Math.abs(maxValue) >= MIN_MAX_THRESHOLD ? 'exceeds_threshold' : 'extreme_database_value',
          threshold: MIN_MAX_THRESHOLD,
          extremeValue: EXTREME_MAX_FLOAT,
          operation: 'normalizeMinMaxValues'
        });
        normalizedMax = undefined;
      }
    }
  }

  const result = { min: normalizedMin, max: normalizedMax };
  logger.debug(`Min/max normalization complete for attribute '${attribute.key}'`, {
    type,
    result,
    operation: 'normalizeMinMaxValues'
  });

  return result;
};

/**
 * Normalizes an attribute for comparison by handling extreme database values
 * This is used when comparing database attributes with config attributes
 */
const normalizeAttributeForComparison = (attribute: Attribute): Attribute => {
  const normalized: any = { ...attribute };

  // Normalize min/max for numeric types
  if (hasMinMaxProperties(attribute)) {
    const { min, max } = normalizeMinMaxValues(attribute);
    normalized.min = min;
    normalized.max = max;
  }

  // Remove xdefault if null/undefined to ensure consistent comparison
  // Appwrite sets xdefault: null for required attributes, but config files omit it
  if ('xdefault' in normalized && (normalized.xdefault === null || normalized.xdefault === undefined)) {
    delete normalized.xdefault;
  }

  return normalized;
};

/**
 * Helper function to create an attribute using either the adapter or legacy API
 */
const createAttributeViaAdapter = async (
  db: Databases | DatabaseAdapter,
  dbId: string,
  collectionId: string,
  attribute: Attribute
): Promise<void> => {
  const startTime = Date.now();
  const adapterType = isDatabaseAdapter(db) ? 'adapter' : 'legacy';

  logger.info(`Creating attribute '${attribute.key}' via ${adapterType}`, {
    type: attribute.type,
    dbId,
    collectionId,
    adapterType,
    operation: 'createAttributeViaAdapter'
  });

  if (isDatabaseAdapter(db)) {
    // Use the adapter's unified createAttribute method
    const params: CreateAttributeParams = {
      databaseId: dbId,
      tableId: collectionId,
      key: attribute.key,
      type: attribute.type,
      required: attribute.required || false,
      array: attribute.array || false,
      ...((attribute as any).size && { size: (attribute as any).size }),
      ...((attribute as any).xdefault !== undefined && !attribute.required && { default: (attribute as any).xdefault }),
      ...((attribute as any).encrypted && { encrypt: (attribute as any).encrypted }),
      ...((attribute as any).min !== undefined && { min: (attribute as any).min }),
      ...((attribute as any).max !== undefined && { max: (attribute as any).max }),
      ...((attribute as any).elements && { elements: (attribute as any).elements }),
      ...((attribute as any).relatedCollection && { relatedCollection: (attribute as any).relatedCollection }),
      ...((attribute as any).relationType && { relationType: (attribute as any).relationType }),
      ...((attribute as any).twoWay !== undefined && { twoWay: (attribute as any).twoWay }),
      ...((attribute as any).onDelete && { onDelete: (attribute as any).onDelete }),
      ...((attribute as any).twoWayKey && { twoWayKey: (attribute as any).twoWayKey })
    };

    logger.debug(`Adapter create parameters for '${attribute.key}'`, {
      params,
      operation: 'createAttributeViaAdapter'
    });

    await db.createAttribute(params);

    const duration = Date.now() - startTime;
    logger.info(`Successfully created attribute '${attribute.key}' via adapter`, {
      duration,
      operation: 'createAttributeViaAdapter'
    });
  } else {
    // Use legacy type-specific methods
    logger.debug(`Using legacy creation for attribute '${attribute.key}'`, {
      operation: 'createAttributeViaAdapter'
    });
    await createLegacyAttribute(db, dbId, collectionId, attribute);

    const duration = Date.now() - startTime;
    logger.info(`Successfully created attribute '${attribute.key}' via legacy`, {
      duration,
      operation: 'createAttributeViaAdapter'
    });
  }
};

/**
 * Helper function to update an attribute using either the adapter or legacy API
 */
const updateAttributeViaAdapter = async (
  db: Databases | DatabaseAdapter,
  dbId: string,
  collectionId: string,
  attribute: Attribute
): Promise<void> => {
  if (isDatabaseAdapter(db)) {
    // Use the adapter's unified updateAttribute method
    const params: UpdateAttributeParams = {
      databaseId: dbId,
      tableId: collectionId,
      key: attribute.key,
      required: attribute.required || false,
      ...((attribute as any).xdefault !== undefined && !attribute.required && { default: (attribute as any).xdefault })
    };
    await db.updateAttribute(params);
  } else {
    // Use legacy type-specific methods
    await updateLegacyAttribute(db, dbId, collectionId, attribute);
  }
};

/**
 * Legacy attribute creation using type-specific methods
 */
const createLegacyAttribute = async (
  db: Databases,
  dbId: string,
  collectionId: string,
  attribute: Attribute
): Promise<void> => {
  const startTime = Date.now();
  const { min: normalizedMin, max: normalizedMax } = normalizeMinMaxValues(attribute);

  logger.info(`Creating legacy attribute '${attribute.key}'`, {
    type: attribute.type,
    dbId,
    collectionId,
    normalizedMin,
    normalizedMax,
    operation: 'createLegacyAttribute'
  });

  switch (attribute.type) {
    case "string":
      const stringParams = {
        size: (attribute as any).size || 255,
        required: attribute.required || false,
        defaultValue: (attribute as any).xdefault !== undefined && !attribute.required ? (attribute as any).xdefault : undefined,
        array: attribute.array || false,
        encrypted: (attribute as any).encrypted
      };
      logger.debug(`Creating string attribute '${attribute.key}'`, {
        ...stringParams,
        operation: 'createLegacyAttribute'
      });
      await db.createStringAttribute(
        dbId,
        collectionId,
        attribute.key,
        stringParams.size,
        stringParams.required,
        stringParams.defaultValue,
        stringParams.array,
        stringParams.encrypted
      );
      break;
    case "integer":
      const integerParams = {
        required: attribute.required || false,
        min: normalizedMin !== undefined ? parseInt(String(normalizedMin)) : undefined,
        max: normalizedMax !== undefined ? parseInt(String(normalizedMax)) : undefined,
        defaultValue: (attribute as any).xdefault !== undefined && !attribute.required ? (attribute as any).xdefault : undefined,
        array: attribute.array || false
      };
      logger.debug(`Creating integer attribute '${attribute.key}'`, {
        ...integerParams,
        operation: 'createLegacyAttribute'
      });
      await db.createIntegerAttribute(
        dbId,
        collectionId,
        attribute.key,
        integerParams.required,
        integerParams.min,
        integerParams.max,
        integerParams.defaultValue,
        integerParams.array
      );
      break;
    case "double":
    case "float":
      await db.createFloatAttribute(
        dbId,
        collectionId,
        attribute.key,
        attribute.required || false,
        normalizedMin !== undefined ? Number(normalizedMin) : undefined,
        normalizedMax !== undefined ? Number(normalizedMax) : undefined,
        (attribute as any).xdefault !== undefined && !attribute.required ? (attribute as any).xdefault : undefined,
        attribute.array || false
      );
      break;
    case "boolean":
      await db.createBooleanAttribute(
        dbId,
        collectionId,
        attribute.key,
        attribute.required || false,
        (attribute as any).xdefault !== undefined && !attribute.required ? (attribute as any).xdefault : undefined,
        attribute.array || false
      );
      break;
    case "datetime":
      await db.createDatetimeAttribute(
        dbId,
        collectionId,
        attribute.key,
        attribute.required || false,
        (attribute as any).xdefault !== undefined && !attribute.required ? (attribute as any).xdefault : undefined,
        attribute.array || false
      );
      break;
    case "email":
      await db.createEmailAttribute(
        dbId,
        collectionId,
        attribute.key,
        attribute.required || false,
        (attribute as any).xdefault !== undefined && !attribute.required ? (attribute as any).xdefault : undefined,
        attribute.array || false
      );
      break;
    case "ip":
      await db.createIpAttribute(
        dbId,
        collectionId,
        attribute.key,
        attribute.required || false,
        (attribute as any).xdefault !== undefined && !attribute.required ? (attribute as any).xdefault : undefined,
        attribute.array || false
      );
      break;
    case "url":
      await db.createUrlAttribute(
        dbId,
        collectionId,
        attribute.key,
        attribute.required || false,
        (attribute as any).xdefault !== undefined && !attribute.required ? (attribute as any).xdefault : undefined,
        attribute.array || false
      );
      break;
    case "enum":
      await db.createEnumAttribute(
        dbId,
        collectionId,
        attribute.key,
        (attribute as any).elements || [],
        attribute.required || false,
        (attribute as any).xdefault !== undefined && !attribute.required ? (attribute as any).xdefault : undefined,
        attribute.array || false
      );
      break;
    case "relationship":
      await db.createRelationshipAttribute(
        dbId,
        collectionId,
        (attribute as any).relatedCollection!,
        (attribute as any).relationType!,
        (attribute as any).twoWay,
        attribute.key,
        (attribute as any).twoWayKey,
        (attribute as any).onDelete
      );
      break;
    default:
      const error = new Error(`Unsupported attribute type: ${(attribute as any).type}`);
      logger.error(`Unsupported attribute type for '${(attribute as any).key}'`, {
        type: (attribute as any).type,
        supportedTypes: ['string', 'integer', 'double', 'float', 'boolean', 'datetime', 'email', 'ip', 'url', 'enum', 'relationship'],
        operation: 'createLegacyAttribute'
      });
      throw error;
  }

  const duration = Date.now() - startTime;
  logger.info(`Successfully created legacy attribute '${attribute.key}'`, {
    type: attribute.type,
    duration,
    operation: 'createLegacyAttribute'
  });
};

/**
 * Legacy attribute update using type-specific methods
 */
const updateLegacyAttribute = async (
  db: Databases,
  dbId: string,
  collectionId: string,
  attribute: Attribute
): Promise<void> => {
  const { min: normalizedMin, max: normalizedMax } = normalizeMinMaxValues(attribute);

  switch (attribute.type) {
    case "string":
      await db.updateStringAttribute(
        dbId,
        collectionId,
        attribute.key,
        attribute.required || false,
        !attribute.required && (attribute as any).xdefault !== undefined ? (attribute as any).xdefault : null,
        attribute.size
      );
      break;
    case "integer":
      await db.updateIntegerAttribute(
        dbId,
        collectionId,
        attribute.key,
        attribute.required || false,
        !attribute.required && (attribute as any).xdefault !== undefined ? (attribute as any).xdefault : null,
        normalizedMin !== undefined ? parseInt(String(normalizedMin)) : undefined,
        normalizedMax !== undefined ? parseInt(String(normalizedMax)) : undefined
      );
      break;
    case "double":
    case "float":
      await db.updateFloatAttribute(
        dbId,
        collectionId,
        attribute.key,
        attribute.required || false,
        normalizedMin !== undefined ? Number(normalizedMin) : undefined,
        normalizedMax !== undefined ? Number(normalizedMax) : undefined,
        !attribute.required && (attribute as any).xdefault !== undefined ? (attribute as any).xdefault : null
      );
      break;
    case "boolean":
      await db.updateBooleanAttribute(
        dbId,
        collectionId,
        attribute.key,
        attribute.required || false,
        !attribute.required && (attribute as any).xdefault !== undefined ? (attribute as any).xdefault : null
      );
      break;
    case "datetime":
      await db.updateDatetimeAttribute(
        dbId,
        collectionId,
        attribute.key,
        attribute.required || false,
        !attribute.required && (attribute as any).xdefault !== undefined ? (attribute as any).xdefault : null
      );
      break;
    case "email":
      await db.updateEmailAttribute(
        dbId,
        collectionId,
        attribute.key,
        attribute.required || false,
        !attribute.required && (attribute as any).xdefault !== undefined ? (attribute as any).xdefault : null
      );
      break;
    case "ip":
      await db.updateIpAttribute(
        dbId,
        collectionId,
        attribute.key,
        attribute.required || false,
        !attribute.required && (attribute as any).xdefault !== undefined ? (attribute as any).xdefault : null
      );
      break;
    case "url":
      await db.updateUrlAttribute(
        dbId,
        collectionId,
        attribute.key,
        attribute.required || false,
        !attribute.required && (attribute as any).xdefault !== undefined ? (attribute as any).xdefault : null
      );
      break;
    case "enum":
      await db.updateEnumAttribute(
        dbId,
        collectionId,
        attribute.key,
        (attribute as any).elements || [],
        attribute.required || false,
        !attribute.required && (attribute as any).xdefault !== undefined ? (attribute as any).xdefault : null
      );
      break;
    case "relationship":
      await db.updateRelationshipAttribute(
        dbId,
        collectionId,
        attribute.key,
        (attribute as any).onDelete
      );
      break;
    default:
      throw new Error(`Unsupported attribute type for update: ${(attribute as any).type}`);
  }
};

// Interface for attribute with status (fixing the type issue)
interface AttributeWithStatus {
  key: string;
  type: string;
  status: "available" | "processing" | "deleting" | "stuck" | "failed";
  error: string;
  required: boolean;
  array?: boolean;
  $createdAt: string;
  $updatedAt: string;
  [key: string]: any; // For type-specific fields
}

/**
 * Wait for attribute to become available, with retry logic for stuck attributes and exponential backoff
 */
const waitForAttributeAvailable = async (
  db: Databases | DatabaseAdapter,
  dbId: string,
  collectionId: string,
  attributeKey: string,
  maxWaitTime: number = 60000, // 1 minute
  retryCount: number = 0,
  maxRetries: number = 5
): Promise<boolean> => {
  const startTime = Date.now();
  let checkInterval = 2000; // Start with 2 seconds

  logger.info(`Waiting for attribute '${attributeKey}' to become available`, {
    dbId,
    collectionId,
    maxWaitTime,
    retryCount,
    maxRetries,
    operation: 'waitForAttributeAvailable'
  });

  // Calculate exponential backoff: 2s, 4s, 8s, 16s, 30s (capped at 30s)
  if (retryCount > 0) {
    const exponentialDelay = calculateExponentialBackoff(retryCount);
    await delay(exponentialDelay);
  }

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const collection = isDatabaseAdapter(db)
        ? (await db.getTable({ databaseId: dbId, tableId: collectionId })).data
        : await db.getCollection(dbId, collectionId);
      const attribute = (collection.attributes as any[]).find(
        (attr: AttributeWithStatus) => attr.key === attributeKey
      ) as AttributeWithStatus | undefined;

      if (!attribute) {
        MessageFormatter.error(`Attribute '${attributeKey}' not found`);
        return false;
      }

      const statusInfo = {
        attributeKey,
        status: attribute.status,
        error: attribute.error,
        dbId,
        collectionId,
        waitTime: Date.now() - startTime,
        operation: 'waitForAttributeAvailable'
      };

      switch (attribute.status) {
        case "available":
          logger.info(`Attribute '${attributeKey}' became available`, statusInfo);
          return true;

        case "failed":
          logger.error(`Attribute '${attributeKey}' failed`, statusInfo);
          return false;

        case "stuck":
          logger.warn(`Attribute '${attributeKey}' is stuck`, statusInfo);
          return false;

        case "processing":
          // Continue waiting
          logger.debug(`Attribute '${attributeKey}' still processing`, statusInfo);
          break;

        case "deleting":
          MessageFormatter.info(
            chalk.yellow(`Attribute '${attributeKey}' is being deleted`)
          );
          logger.warn(`Attribute '${attributeKey}' is being deleted`, statusInfo);
          break;

        default:
          MessageFormatter.info(
            chalk.yellow(
              `Unknown status '${attribute.status}' for attribute '${attributeKey}'`
            )
          );
          logger.warn(`Unknown status for attribute '${attributeKey}'`, statusInfo);
          break;
      }

      await delay(checkInterval);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      MessageFormatter.error(`Error checking attribute status: ${errorMessage}`);

      logger.error('Error checking attribute status', {
        attributeKey,
        dbId,
        collectionId,
        error: errorMessage,
        waitTime: Date.now() - startTime,
        operation: 'waitForAttributeAvailable'
      });

      return false;
    }
  }

  // Timeout reached
  MessageFormatter.info(
    chalk.yellow(
      `⏰ Timeout waiting for attribute '${attributeKey}' (${maxWaitTime}ms)`
    )
  );

  // If we have retries left and this isn't the last retry, try recreating
  if (retryCount < maxRetries) {
    MessageFormatter.info(
      chalk.yellow(
        `🔄 Retrying attribute creation (attempt ${
          retryCount + 1
        }/${maxRetries})`
      )
    );
    return false; // Signal that we need to retry
  }

  return false;
};

/**
 * Wait for all attributes in a collection to become available
 */
const waitForAllAttributesAvailable = async (
  db: Databases | DatabaseAdapter,
  dbId: string,
  collectionId: string,
  attributeKeys: string[],
  maxWaitTime: number = 60000
): Promise<string[]> => {
  MessageFormatter.info(
    chalk.blue(
      `Waiting for ${attributeKeys.length} attributes to become available...`
    )
  );

  const failedAttributes: string[] = [];

  for (const attributeKey of attributeKeys) {
    const success = await waitForAttributeAvailable(
      db,
      dbId,
      collectionId,
      attributeKey,
      maxWaitTime
    );
    if (!success) {
      failedAttributes.push(attributeKey);
    }
  }

  return failedAttributes;
};

/**
 * Delete collection and recreate with retry logic
 */
const deleteAndRecreateCollection = async (
  db: Databases | DatabaseAdapter,
  dbId: string,
  collection: Models.Collection,
  retryCount: number
): Promise<Models.Collection | null> => {
  try {
    MessageFormatter.info(
      chalk.yellow(
        `🗑️ Deleting collection '${collection.name}' for retry ${retryCount}`
      )
    );

    // Delete the collection
    if (isDatabaseAdapter(db)) {
      await db.deleteTable({ databaseId: dbId, tableId: collection.$id });
    } else {
      await db.deleteCollection(dbId, collection.$id);
    }
    MessageFormatter.warning(`Deleted collection '${collection.name}'`);

    // Wait a bit before recreating
    await delay(2000);

    // Recreate the collection
    MessageFormatter.info(`🔄 Recreating collection '${collection.name}'`);
    const newCollection = isDatabaseAdapter(db)
      ? (await db.createTable({
          databaseId: dbId,
          id: collection.$id,
          name: collection.name,
          permissions: collection.$permissions,
          documentSecurity: collection.documentSecurity,
          enabled: collection.enabled
        })).data
      : await db.createCollection(
          dbId,
          collection.$id,
          collection.name,
          collection.$permissions,
          collection.documentSecurity,
          collection.enabled
        );

    MessageFormatter.success(`✅ Recreated collection '${collection.name}'`);
    return newCollection;
  } catch (error) {
    MessageFormatter.info(
      chalk.red(
        `Failed to delete/recreate collection '${collection.name}': ${error}`
      )
    );
    return null;
  }
};

/**
 * Get the fields that should be compared for a specific attribute type
 * Only returns fields that are valid for the given type to avoid false positives
 */
const getComparableFields = (type: string): string[] => {
  const baseFields = ["key", "type", "array", "required", "xdefault"];

  switch (type) {
    case "string":
      return [...baseFields, "size", "encrypted"];

    case "integer":
    case "double":
    case "float":
      return [...baseFields, "min", "max"];

    case "enum":
      return [...baseFields, "elements"];

    case "relationship":
      return [...baseFields, "relationType", "twoWay", "twoWayKey", "onDelete", "relatedCollection"];

    case "boolean":
    case "datetime":
    case "email":
    case "ip":
    case "url":
      return baseFields;

    default:
      // Fallback to all fields for unknown types
      return [
        "key", "type", "array", "encrypted", "required", "size",
        "min", "max", "xdefault", "elements", "relationType",
        "twoWay", "twoWayKey", "onDelete", "relatedCollection"
      ];
  }
};

const attributesSame = (
  databaseAttribute: Attribute,
  configAttribute: Attribute
): boolean => {
  // Normalize both attributes for comparison (handle extreme database values)
  const normalizedDbAttr = normalizeAttributeForComparison(databaseAttribute);
  const normalizedConfigAttr = normalizeAttributeForComparison(configAttribute);

  // Use type-specific field list to avoid false positives from irrelevant fields
  const attributesToCheck = getComparableFields(normalizedConfigAttr.type);

  const differences: string[] = [];

  const result = attributesToCheck.every((attr) => {
    // Check if both objects have the attribute
    const dbHasAttr = attr in normalizedDbAttr;
    const configHasAttr = attr in normalizedConfigAttr;

    // If both have the attribute, compare values
    if (dbHasAttr && configHasAttr) {
      const dbValue = normalizedDbAttr[attr as keyof typeof normalizedDbAttr];
      const configValue = normalizedConfigAttr[attr as keyof typeof normalizedConfigAttr];

      // Consider undefined and null as equivalent
      if (
        (dbValue === undefined || dbValue === null) &&
        (configValue === undefined || configValue === null)
      ) {
        return true;
      }

      // Normalize booleans: treat undefined and false as equivalent
      if (typeof dbValue === "boolean" || typeof configValue === "boolean") {
        const boolMatch = Boolean(dbValue) === Boolean(configValue);
        if (!boolMatch) {
          differences.push(`${attr}: db=${dbValue} config=${configValue}`);
        }
        return boolMatch;
      }
      // For numeric comparisons, compare numbers if both are numeric-like
      if (
        (typeof dbValue === "number" || (typeof dbValue === "string" && dbValue !== "" && !isNaN(Number(dbValue)))) &&
        (typeof configValue === "number" || (typeof configValue === "string" && configValue !== "" && !isNaN(Number(configValue))))
      ) {
        const numMatch = Number(dbValue) === Number(configValue);
        if (!numMatch) {
          differences.push(`${attr}: db=${dbValue} config=${configValue}`);
        }
        return numMatch;
      }

      // For array comparisons (e.g., enum elements), use order-independent equality
      if (Array.isArray(dbValue) && Array.isArray(configValue)) {
        const arrayMatch =
          dbValue.length === configValue.length &&
          dbValue.every((val) => configValue.includes(val));
        if (!arrayMatch) {
          differences.push(`${attr}: db=${JSON.stringify(dbValue)} config=${JSON.stringify(configValue)}`);
        }
        return arrayMatch;
      }

      const match = dbValue === configValue;
      if (!match) {
        differences.push(`${attr}: db=${JSON.stringify(dbValue)} config=${JSON.stringify(configValue)}`);
      }
      return match;
    }

    // If neither has the attribute, consider it the same
    if (!dbHasAttr && !configHasAttr) {
      return true;
    }

    // If one has the attribute and the other doesn't, check if it's undefined or null
    if (dbHasAttr && !configHasAttr) {
      const dbValue = normalizedDbAttr[attr as keyof typeof normalizedDbAttr];
      // Consider default-false booleans as equal to missing in config
      if (typeof dbValue === "boolean") {
        const match = dbValue === false; // missing in config equals false in db
        if (!match) {
          differences.push(`${attr}: db=${dbValue} config=<missing>`);
        }
        return match;
      }
      const match = dbValue === undefined || dbValue === null;
      if (!match) {
        differences.push(`${attr}: db=${JSON.stringify(dbValue)} config=<missing>`);
      }
      return match;
    }

    if (!dbHasAttr && configHasAttr) {
      const configValue = normalizedConfigAttr[attr as keyof typeof normalizedConfigAttr];
      // Consider default-false booleans as equal to missing in db
      if (typeof configValue === "boolean") {
        const match = configValue === false; // missing in db equals false in config
        if (!match) {
          differences.push(`${attr}: db=<missing> config=${configValue}`);
        }
        return match;
      }
      const match = configValue === undefined || configValue === null;
      if (!match) {
        differences.push(`${attr}: db=<missing> config=${JSON.stringify(configValue)}`);
      }
      return match;
    }

    // If we reach here, the attributes are different
    differences.push(`${attr}: unexpected comparison state`);
    return false;
  });

  // Log differences if any were found
  if (differences.length > 0) {
    logger.debug(`Attribute '${normalizedDbAttr.key}' comparison found differences:`, {
      differences,
      operation: 'attributesSame'
    });
  }

  // Log differences if comparison failed (for debugging)
  if (!result && differences.length > 0) {
    MessageFormatter.debug(
      `Attribute '${configAttribute.key}' differences detected:`,
      { prefix: "Attributes" }
    );
    differences.forEach(diff => {
      MessageFormatter.debug(`  ${diff}`, { prefix: "Attributes" });
    });
  }

  return result;
};

/**
 * Enhanced attribute creation with proper status monitoring and retry logic
 */
export const createOrUpdateAttributeWithStatusCheck = async (
  db: Databases | DatabaseAdapter,
  dbId: string,
  collection: Models.Collection,
  attribute: Attribute,
  retryCount: number = 0,
  maxRetries: number = 5
): Promise<boolean> => {
  try {
    // First, try to create/update the attribute using existing logic
    const result = await createOrUpdateAttribute(db, dbId, collection, attribute);

    // If the attribute was queued (relationship dependency unresolved),
    // skip status polling and retry logic — the queue will handle it later.
    if (result === "queued") {
      MessageFormatter.info(
        chalk.yellow(
          `⏭️  Deferred relationship attribute '${attribute.key}' — queued for later once dependencies are available`
        )
      );
      return true;
    }

    // If collection creation failed, return false to indicate failure
    if (result === "error") {
      MessageFormatter.error(`Failed to create collection for attribute '${attribute.key}'`);
      return false;
    }

    // Now wait for the attribute to become available
    const success = await waitForAttributeAvailable(
      db,
      dbId,
      collection.$id,
      attribute.key,
      60000, // 1 minute timeout
      retryCount,
      maxRetries
    );

    if (success) {
      return true;
    }

    // If not successful and we have retries left, delete specific attribute and try again
    if (retryCount < maxRetries) {
      MessageFormatter.info(
        chalk.yellow(
          `Attribute '${attribute.key}' failed/stuck, deleting and retrying...`
        )
      );

      // Try to delete the specific stuck attribute instead of the entire collection
      try {
        if (isDatabaseAdapter(db)) {
          await db.deleteAttribute({ databaseId: dbId, tableId: collection.$id, key: attribute.key });
        } else {
          await db.deleteAttribute(dbId, collection.$id, attribute.key);
        }
        MessageFormatter.info(
          chalk.yellow(
            `Deleted stuck attribute '${attribute.key}', will retry creation`
          )
        );

        // Wait a bit before retry
        await delay(3000);

        // Get fresh collection data
        const freshCollection = isDatabaseAdapter(db)
          ? (await db.getTable({ databaseId: dbId, tableId: collection.$id })).data
          : await db.getCollection(dbId, collection.$id);

        // Retry with the same collection (attribute should be gone now)
        return await createOrUpdateAttributeWithStatusCheck(
          db,
          dbId,
          freshCollection,
          attribute,
          retryCount + 1,
          maxRetries
        );
      } catch (deleteError) {
        MessageFormatter.info(
          chalk.red(
            `Failed to delete stuck attribute '${attribute.key}': ${deleteError}`
          )
        );

        // If attribute deletion fails, only then try collection recreation as last resort
        if (retryCount >= maxRetries - 1) {
          MessageFormatter.info(
            chalk.yellow(
              `Last resort: Recreating collection for attribute '${attribute.key}'`
            )
          );

          // Get fresh collection data
          const freshCollection = isDatabaseAdapter(db)
          ? (await db.getTable({ databaseId: dbId, tableId: collection.$id })).data
          : await db.getCollection(dbId, collection.$id);

          // Delete and recreate collection
          const newCollection = await deleteAndRecreateCollection(
            db,
            dbId,
            freshCollection,
            retryCount + 1
          );

          if (newCollection) {
            // Retry with the new collection
            return await createOrUpdateAttributeWithStatusCheck(
              db,
              dbId,
              newCollection,
              attribute,
              retryCount + 1,
              maxRetries
            );
          }
        } else {
          // Continue to next retry without collection recreation
          return await createOrUpdateAttributeWithStatusCheck(
            db,
            dbId,
            collection,
            attribute,
            retryCount + 1,
            maxRetries
          );
        }
      }
    }

    MessageFormatter.info(
      chalk.red(
        `❌ Failed to create attribute '${attribute.key}' after ${
          maxRetries + 1
        } attempts`
      )
    );
    return false;
  } catch (error) {
    MessageFormatter.info(
      chalk.red(`Error creating attribute '${attribute.key}': ${error}`)
    );

    if (retryCount < maxRetries) {
      MessageFormatter.info(
        chalk.yellow(`Retrying attribute '${attribute.key}' due to error...`)
      );

      // Wait a bit before retry
      await delay(2000);

      return await createOrUpdateAttributeWithStatusCheck(
        db,
        dbId,
        collection,
        attribute,
        retryCount + 1,
        maxRetries
      );
    }

    return false;
  }
};

export const createOrUpdateAttribute = async (
  db: Databases | DatabaseAdapter,
  dbId: string,
  collection: Models.Collection,
  attribute: Attribute
): Promise<"queued" | "processed" | "error"> => {
  let action = "create";
  let foundAttribute: Attribute | undefined;
  const updateEnabled = true;
  let finalAttribute: any = attribute;
  try {
    const collectionAttr = collection.attributes.find(
      (attr: any) => attr.key === attribute.key
    ) as unknown as any;
    foundAttribute = parseAttribute(collectionAttr);

  } catch (error) {
    foundAttribute = undefined;
  }

  if (
    foundAttribute &&
    attributesSame(foundAttribute, attribute) &&
    updateEnabled
  ) {
    // No need to do anything, they are the same
    return "processed";
  } else if (
    foundAttribute &&
    !attributesSame(foundAttribute, attribute) &&
    updateEnabled
  ) {
    // MessageFormatter.info(
    //   `Updating attribute with same key ${attribute.key} but different values`
    // );
    finalAttribute = {
      ...foundAttribute,
      ...attribute,
    };
    action = "update";
  } else if (
    !updateEnabled &&
    foundAttribute &&
    !attributesSame(foundAttribute, attribute)
  ) {
    if (isDatabaseAdapter(db)) {
      await db.deleteAttribute({ databaseId: dbId, tableId: collection.$id, key: attribute.key });
    } else {
      await db.deleteAttribute(dbId, collection.$id, attribute.key);
    }
    MessageFormatter.info(
      `Deleted attribute: ${attribute.key} to recreate it because they diff (update disabled temporarily)`
    );
    return "processed";
  }



  // Relationship attribute logic with adjustments
  let collectionFoundViaRelatedCollection: Models.Collection | undefined;
  let relatedCollectionId: string | undefined;
  if (
    finalAttribute.type === "relationship" &&
    finalAttribute.relatedCollection
  ) {
    // First try treating relatedCollection as an ID directly
    try {
      const byIdCollection = isDatabaseAdapter(db)
        ? (await db.getTable({ databaseId: dbId, tableId: finalAttribute.relatedCollection })).data
        : await db.getCollection(dbId, finalAttribute.relatedCollection);
      collectionFoundViaRelatedCollection = byIdCollection;
      relatedCollectionId = byIdCollection.$id;
      // Cache by name for subsequent lookups
      nameToIdMapping.set(byIdCollection.name, byIdCollection.$id);
    } catch (_) {
      // Not an ID or not found — fall back to name-based resolution below
    }

    if (!collectionFoundViaRelatedCollection && nameToIdMapping.has(finalAttribute.relatedCollection)) {
      relatedCollectionId = nameToIdMapping.get(
        finalAttribute.relatedCollection
      );
      try {
        collectionFoundViaRelatedCollection = isDatabaseAdapter(db)
          ? (await db.getTable({ databaseId: dbId, tableId: relatedCollectionId! })).data
          : await db.getCollection(dbId, relatedCollectionId!);
      } catch (e) {
        // MessageFormatter.info(
        //   `Collection not found: ${finalAttribute.relatedCollection} when nameToIdMapping was set`
        // );
        collectionFoundViaRelatedCollection = undefined;
      }
    } else if (!collectionFoundViaRelatedCollection) {
      const collectionsPulled = isDatabaseAdapter(db)
        ? await db.listTables({ databaseId: dbId, queries: [Query.equal("name", finalAttribute.relatedCollection)] })
        : await db.listCollections(dbId, [Query.equal("name", finalAttribute.relatedCollection)]);
      if (collectionsPulled.total && collectionsPulled.total > 0) {
        collectionFoundViaRelatedCollection = isDatabaseAdapter(db)
          ? (collectionsPulled as any).tables?.[0]
          : (collectionsPulled as any).collections?.[0];
        relatedCollectionId = collectionFoundViaRelatedCollection?.$id;
        if (relatedCollectionId) {
          nameToIdMapping.set(
            finalAttribute.relatedCollection,
            relatedCollectionId
          );
        }
      }
    }
    // ONLY queue relationship attributes that have actual unresolved dependencies
    if (!(relatedCollectionId && collectionFoundViaRelatedCollection)) {
      MessageFormatter.info(
        chalk.yellow(
          `⏳ Queueing relationship attribute '${finalAttribute.key}' - related collection '${finalAttribute.relatedCollection}' not found yet`
        )
      );
      enqueueOperation({
        type: "attribute",
        collectionId: collection.$id,
        collection: collection,
        attribute,
        dependencies: [finalAttribute.relatedCollection],
      });
      return "queued";
    }
  }
  finalAttribute = parseAttribute(finalAttribute);

  // Ensure collection/table exists - create it if it doesn't
  try {
    await (isDatabaseAdapter(db)
      ? db.getTable({ databaseId: dbId, tableId: collection.$id })
      : db.getCollection(dbId, collection.$id));
  } catch (error) {
    // Collection doesn't exist - create it
    if ((error as any).code === 404 ||
        (error instanceof Error && (
          error.message.includes('collection_not_found') ||
          error.message.includes('Collection with the requested ID could not be found')
        ))) {

      MessageFormatter.info(`Collection '${collection.name}' doesn't exist, creating it first...`);

      try {
        if (isDatabaseAdapter(db)) {
          await db.createTable({
            databaseId: dbId,
            id: collection.$id,
            name: collection.name,
            permissions: collection.$permissions || [],
            documentSecurity: collection.documentSecurity ?? false,
            enabled: collection.enabled ?? true
          });
        } else {
          await db.createCollection(
            dbId,
            collection.$id,
            collection.name,
            collection.$permissions || [],
            collection.documentSecurity ?? false,
            collection.enabled ?? true
          );
        }

        MessageFormatter.success(`Created collection '${collection.name}'`);
        await delay(500); // Wait for collection to be ready
      } catch (createError) {
        MessageFormatter.error(
          `Failed to create collection '${collection.name}'`,
          createError instanceof Error ? createError : new Error(String(createError))
        );
        return "error";
      }
    } else {
      // Other error - re-throw
      throw error;
    }
  }

  // Use adapter-based attribute creation/update
  if (action === "create") {
    await tryAwaitWithRetry(
      async () => await createAttributeViaAdapter(db, dbId, collection.$id, finalAttribute)
    );
  } else {
    await tryAwaitWithRetry(
      async () => await updateAttributeViaAdapter(db, dbId, collection.$id, finalAttribute)
    );
  }
  return "processed";
};

/**
 * Enhanced collection attribute creation with proper status monitoring
 */
export const createUpdateCollectionAttributesWithStatusCheck = async (
  db: Databases | DatabaseAdapter,
  dbId: string,
  collection: Models.Collection,
  attributes: Attribute[]
): Promise<boolean> => {
  const existingAttributes: Attribute[] =
    // @ts-expect-error
    collection.attributes.map((attr) => parseAttribute(attr)) || [];

  const attributesToRemove = existingAttributes.filter(
    (attr) => !attributes.some((a) => a.key === attr.key)
  );
  const indexesToRemove = collection.indexes.filter((index) =>
    attributesToRemove.some((attr) => index.attributes.includes(attr.key))
  );

  // Handle attribute removal first
  if (attributesToRemove.length > 0) {
    if (indexesToRemove.length > 0) {
      MessageFormatter.info(
        chalk.red(
          `Removing indexes as they rely on an attribute that is being removed: ${indexesToRemove
            .map((index) => index.key)
            .join(", ")}`
        )
      );
      for (const index of indexesToRemove) {
        await tryAwaitWithRetry(
          async () => {
            if (isDatabaseAdapter(db)) {
              await db.deleteIndex({ databaseId: dbId, tableId: collection.$id, key: index.key });
            } else {
              await db.deleteIndex(dbId, collection.$id, index.key);
            }
          }
        );
        await delay(500); // Longer delay for deletions
      }
    }
    for (const attr of attributesToRemove) {
      MessageFormatter.info(
        chalk.red(
          `Removing attribute: ${attr.key} as it is no longer in the collection`
        )
      );
      await tryAwaitWithRetry(
        async () => {
          if (isDatabaseAdapter(db)) {
            await db.deleteAttribute({ databaseId: dbId, tableId: collection.$id, key: attr.key });
          } else {
            await db.deleteAttribute(dbId, collection.$id, attr.key);
          }
        }
      );
      await delay(500); // Longer delay for deletions
    }
  }

  // First, get fresh collection data and determine which attributes actually need processing
  let currentCollection = collection;
  try {
    currentCollection = isDatabaseAdapter(db)
      ? (await db.getTable({ databaseId: dbId, tableId: collection.$id })).data
      : await db.getCollection(dbId, collection.$id);
  } catch (error) {
    MessageFormatter.info(
      chalk.yellow(`Warning: Could not refresh collection data: ${error}`)
    );
  }

  const existingAttributesMap = new Map<string, Attribute>();
  try {
    const parsedAttributes = currentCollection.attributes.map((attr) =>
      // @ts-expect-error
      parseAttribute(attr)
    );
    parsedAttributes.forEach((attr) =>
      existingAttributesMap.set(attr.key, attr)
    );
  } catch (error) {
    MessageFormatter.info(
      chalk.yellow(`Warning: Could not parse existing attributes: ${error}`)
    );
  }

  // Filter to only attributes that need processing (new, changed, or not yet processed)
  const attributesToProcess = attributes.filter((attribute) => {
    // Skip if already processed in this session
    if (isAttributeProcessed(currentCollection.$id, attribute.key)) {
      return false;
    }

    const existing = existingAttributesMap.get(attribute.key);
    if (!existing) {
      MessageFormatter.info(`➕ ${attribute.key}`);
      return true;
    }

    const needsUpdate = !attributesSame(existing, parseAttribute(attribute));
    if (needsUpdate) {
      MessageFormatter.info(`🔄 ${attribute.key}`);
    } else {
      MessageFormatter.info(chalk.gray(`✅ ${attribute.key}`));
    }
    return needsUpdate;
  });

  if (attributesToProcess.length === 0) {
    return true;
  }

  let remainingAttributes = [...attributesToProcess];
  let overallRetryCount = 0;
  const maxOverallRetries = 3;

  while (
    remainingAttributes.length > 0 &&
    overallRetryCount < maxOverallRetries
  ) {
    const attributesToProcessThisRound = [...remainingAttributes];
    remainingAttributes = []; // Reset for next iteration

    for (const attribute of attributesToProcessThisRound) {
      const success = await createOrUpdateAttributeWithStatusCheck(
        db,
        dbId,
        currentCollection,
        attribute
      );

      if (success) {
        // Mark this specific attribute as processed
        markAttributeProcessed(currentCollection.$id, attribute.key);

        // Get updated collection data for next iteration
        try {
          currentCollection = isDatabaseAdapter(db)
      ? (await db.getTable({ databaseId: dbId, tableId: collection.$id })).data as Models.Collection
      : await db.getCollection(dbId, collection.$id);
        } catch (error) {
          MessageFormatter.info(
            chalk.yellow(`Warning: Could not refresh collection data: ${error}`)
          );
        }

        // Add delay between successful attributes
        await delay(1000);
      } else {
        MessageFormatter.info(chalk.red(`❌ ${attribute.key}`));
        remainingAttributes.push(attribute); // Add back to retry list
      }
    }

    if (remainingAttributes.length === 0) {
      return true;
    }

    overallRetryCount++;

    if (overallRetryCount < maxOverallRetries) {
      MessageFormatter.info(
        chalk.yellow(`⏳ Retrying ${remainingAttributes.length} failed attributes...`)
      );
      await delay(5000);

      // Refresh collection data before retry
      try {
        currentCollection = isDatabaseAdapter(db)
      ? (await db.getTable({ databaseId: dbId, tableId: collection.$id })).data as Models.Collection
      : await db.getCollection(dbId, collection.$id);
      } catch (error) {
        // Silently continue if refresh fails
      }
    }
  }

  // If we get here, some attributes still failed after all retries
  if (attributesToProcess.length > 0) {
    MessageFormatter.info(
      chalk.red(
        `\n❌ Failed to create ${
          attributesToProcess.length
        } attributes after ${maxOverallRetries} attempts: ${attributesToProcess
          .map((a) => a.key)
          .join(", ")}`
      )
    );
    MessageFormatter.info(
      chalk.red(
        `This may indicate a fundamental issue with the attribute definitions or Appwrite instance`
      )
    );
    return false;
  }

  MessageFormatter.info(
    chalk.green(
      `\n✅ Successfully created all ${attributes.length} attributes for collection: ${collection.name}`
    )
  );
  return true;
};

export const createUpdateCollectionAttributes = async (
  db: Databases | DatabaseAdapter,
  dbId: string,
  collection: Models.Collection,
  attributes: Attribute[]
): Promise<void> => {
  MessageFormatter.info(
    chalk.green(
      `Creating/Updating attributes for collection: ${collection.name}`
    )
  );

  const existingAttributes: Attribute[] =
    // @ts-expect-error
    collection.attributes.map((attr) => parseAttribute(attr)) || [];

  const attributesToRemove = existingAttributes.filter(
    (attr) => !attributes.some((a) => a.key === attr.key)
  );
  const indexesToRemove = collection.indexes.filter((index) =>
    attributesToRemove.some((attr) => index.attributes.includes(attr.key))
  );

  if (attributesToRemove.length > 0) {
    if (indexesToRemove.length > 0) {
      MessageFormatter.info(
        chalk.red(
          `Removing indexes as they rely on an attribute that is being removed: ${indexesToRemove
            .map((index) => index.key)
            .join(", ")}`
        )
      );
      for (const index of indexesToRemove) {
        await tryAwaitWithRetry(
          async () => {
            if (isDatabaseAdapter(db)) {
              await db.deleteIndex({ databaseId: dbId, tableId: collection.$id, key: index.key });
            } else {
              await db.deleteIndex(dbId, collection.$id, index.key);
            }
          }
        );
        await delay(100);
      }
    }
    for (const attr of attributesToRemove) {
      MessageFormatter.info(
        chalk.red(
          `Removing attribute: ${attr.key} as it is no longer in the collection`
        )
      );
      await tryAwaitWithRetry(
        async () => {
          if (isDatabaseAdapter(db)) {
            await db.deleteAttribute({ databaseId: dbId, tableId: collection.$id, key: attr.key });
          } else {
            await db.deleteAttribute(dbId, collection.$id, attr.key);
          }
        }
      );
      await delay(50);
    }
  }

  const batchSize = 3;
  for (let i = 0; i < attributes.length; i += batchSize) {
    const batch = attributes.slice(i, i + batchSize);
    const attributePromises = batch.map((attribute) =>
      tryAwaitWithRetry(
        async () =>
          await createOrUpdateAttribute(db, dbId, collection, attribute)
      )
    );

    const results = await Promise.allSettled(attributePromises);
    results.forEach((result) => {
      if (result.status === "rejected") {
        MessageFormatter.error("An attribute promise was rejected:", result.reason);
      }
    });

    // Add delay after each batch
    await delay(200);
  }
  MessageFormatter.info(
    `Finished creating/updating attributes for collection: ${collection.name}`
  );
};
