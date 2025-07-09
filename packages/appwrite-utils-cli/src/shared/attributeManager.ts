import { type Databases, type Models } from "node-appwrite";
import {
  parseAttribute,
  type Attribute,
  type CollectionCreate,
} from "appwrite-utils";
import { nameToIdMapping, type QueuedOperation, enqueueOperation } from "./operationQueue.js";
import { delay, tryAwaitWithRetry } from "../utils/helperFunctions.js";
import chalk from "chalk";
import pLimit from "p-limit";

// Concurrency limits for different operations
const attributeLimit = pLimit(3);    // Low limit for attribute operations
const queryLimit = pLimit(25);       // Higher limit for read operations

export const attributesSame = (
  databaseAttribute: Attribute,
  configAttribute: Attribute
): boolean => {
  const attributesToCheck = [
    "key",
    "type", 
    "array",
    "encrypted",
    "required",
    "size",
    "min",
    "max",
    "xdefault",
    "elements",
    "relationType",
    "twoWay",
    "twoWayKey",
    "onDelete",
    "relatedCollection",
  ];

  return attributesToCheck.every((attr) => {
    // Special handling for min/max values
    if (attr === "min" || attr === "max") {
      const dbValue = databaseAttribute[attr as keyof typeof databaseAttribute];
      const configValue = configAttribute[attr as keyof typeof configAttribute];

      // Use type-specific default values when comparing
      if (databaseAttribute.type === "integer") {
        const defaultMin = attr === "min" ? -2147483647 : undefined;
        const defaultMax = attr === "max" ? 2147483647 : undefined;
        return (dbValue ?? defaultMin) === (configValue ?? defaultMax);
      }
      if (databaseAttribute.type === "double" || databaseAttribute.type === "float") {
        const defaultMin = attr === "min" ? -2147483647 : undefined;
        const defaultMax = attr === "max" ? 2147483647 : undefined;
        return (dbValue ?? defaultMin) === (configValue ?? defaultMax);
      }
    }

    // Check if both objects have the attribute
    const dbHasAttr = attr in databaseAttribute;
    const configHasAttr = attr in configAttribute;

    // If both have the attribute, compare values
    if (dbHasAttr && configHasAttr) {
      const dbValue = databaseAttribute[attr as keyof typeof databaseAttribute];
      const configValue = configAttribute[attr as keyof typeof configAttribute];

      // Consider undefined and null as equivalent
      if (
        (dbValue === undefined || dbValue === null) &&
        (configValue === undefined || configValue === null)
      ) {
        return true;
      }

      return dbValue === configValue;
    }

    // If neither has the attribute, consider it the same
    if (!dbHasAttr && !configHasAttr) {
      return true;
    }

    // If one has the attribute and the other doesn't, check if it's undefined or null
    if (dbHasAttr && !configHasAttr) {
      const dbValue = databaseAttribute[attr as keyof typeof databaseAttribute];
      return dbValue === undefined || dbValue === null;
    }

    if (!dbHasAttr && configHasAttr) {
      const configValue = configAttribute[attr as keyof typeof configAttribute];
      return configValue === undefined || configValue === null;
    }

    // If we reach here, the attributes are different
    return false;
  });
};

export const createOrUpdateAttribute = async (
  db: Databases,
  dbId: string,
  collection: Models.Collection,
  attribute: Attribute,
  options: {
    updateEnabled?: boolean;
    useQueue?: boolean;
    verbose?: boolean;
  } = {}
): Promise<void> => {
  const { updateEnabled = true, useQueue = true, verbose = false } = options;
  
  let action = "create";
  let foundAttribute: Attribute | undefined;
  let finalAttribute: any = attribute;
  
  try {
    const collectionAttr = collection.attributes.find(
      (attr: any) => attr.key === attribute.key
    ) as unknown as any;
    foundAttribute = parseAttribute(collectionAttr);
    
    if (verbose) {
      console.log(`Found attribute: ${JSON.stringify(foundAttribute)}`);
    }
  } catch (error) {
    foundAttribute = undefined;
  }

  if (
    foundAttribute &&
    attributesSame(foundAttribute, attribute) &&
    updateEnabled
  ) {
    if (verbose) {
      console.log(chalk.green(`✓ Attribute ${attribute.key} is up to date`));
    }
    return;
  }

  if (foundAttribute) {
    action = "update";
    if (verbose) {
      console.log(chalk.yellow(`⚠ Updating attribute ${attribute.key}`));
    }
  } else {
    if (verbose) {
      console.log(chalk.blue(`+ Creating attribute ${attribute.key}`));
    }
  }

  // Handle relationship attributes with nameToIdMapping
  if (attribute.type === "relationship" && attribute.relatedCollection) {
    const relatedCollectionId = nameToIdMapping.get(attribute.relatedCollection);
    if (relatedCollectionId) {
      finalAttribute = {
        ...attribute,
        relatedCollection: relatedCollectionId,
      };
    }
  }

  // Handle BigInt values for integer, double and float types
  if (attribute.type === "integer" || attribute.type === "double" || attribute.type === "float") {
    if (typeof finalAttribute.min === "bigint") {
      finalAttribute.min = Number(finalAttribute.min);
    }
    if (typeof finalAttribute.max === "bigint") {
      finalAttribute.max = Number(finalAttribute.max);
    }
  }

  const queuedOperation: QueuedOperation = {
    type: "attribute",
    collectionId: collection.$id,
    attribute: finalAttribute,
    collection,
  };

  const executeOperation = async () => {
    await attributeLimit(async () => {
      if (action === "update" && foundAttribute) {
        // Delete existing attribute first
        await tryAwaitWithRetry(async () => {
          await db.deleteAttribute(dbId, collection.$id, attribute.key);
        });
        await delay(250);
      }

      // Create attribute based on type
      switch (finalAttribute.type) {
        case "string":
          await tryAwaitWithRetry(async () => {
            await db.createStringAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.size,
              finalAttribute.required,
              finalAttribute.xdefault,
              finalAttribute.array,
              finalAttribute.encrypted
            );
          });
          break;
        case "integer":
          await tryAwaitWithRetry(async () => {
            await db.createIntegerAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.required,
              finalAttribute.min,
              finalAttribute.max,
              finalAttribute.xdefault,
              finalAttribute.array
            );
          });
          break;
        case "double":
        case "float": // Backward compatibility
          await tryAwaitWithRetry(async () => {
            await db.createFloatAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.required,
              finalAttribute.min,
              finalAttribute.max,
              finalAttribute.xdefault,
              finalAttribute.array
            );
          });
          break;
        case "boolean":
          await tryAwaitWithRetry(async () => {
            await db.createBooleanAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.required,
              finalAttribute.xdefault,
              finalAttribute.array
            );
          });
          break;
        case "datetime":
          await tryAwaitWithRetry(async () => {
            await db.createDatetimeAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.required,
              finalAttribute.xdefault,
              finalAttribute.array
            );
          });
          break;
        case "email":
          await tryAwaitWithRetry(async () => {
            await db.createEmailAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.required,
              finalAttribute.xdefault,
              finalAttribute.array
            );
          });
          break;
        case "ip":
          await tryAwaitWithRetry(async () => {
            await db.createIpAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.required,
              finalAttribute.xdefault,
              finalAttribute.array
            );
          });
          break;
        case "url":
          await tryAwaitWithRetry(async () => {
            await db.createUrlAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.required,
              finalAttribute.xdefault,
              finalAttribute.array
            );
          });
          break;
        case "enum":
          await tryAwaitWithRetry(async () => {
            await db.createEnumAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.elements,
              finalAttribute.required,
              finalAttribute.xdefault,
              finalAttribute.array
            );
          });
          break;
        case "relationship":
          await tryAwaitWithRetry(async () => {
            await db.createRelationshipAttribute(
              dbId,
              collection.$id,
              finalAttribute.relatedCollection,
              finalAttribute.relationType,
              finalAttribute.twoWay,
              finalAttribute.key,
              finalAttribute.twoWayKey,
              finalAttribute.onDelete
            );
          });
          break;
        default:
          throw new Error(`Unknown attribute type: ${finalAttribute.type}`);
      }
    });
  };

  if (useQueue) {
    enqueueOperation(queuedOperation);
  } else {
    await executeOperation();
  }
};

export const createUpdateCollectionAttributes = async (
  db: Databases,
  dbId: string,
  collection: Models.Collection,
  collectionConfig: CollectionCreate,
  options: {
    updateEnabled?: boolean;
    useQueue?: boolean;
    verbose?: boolean;
  } = {}
): Promise<void> => {
  if (!collectionConfig.attributes) return;

  const { verbose = false } = options;
  
  if (verbose) {
    console.log(chalk.blue(`Processing ${collectionConfig.attributes.length} attributes for collection ${collection.name}`));
  }

  for (const attribute of collectionConfig.attributes) {
    try {
      await createOrUpdateAttribute(db, dbId, collection, attribute, options);
      
      if (verbose) {
        console.log(chalk.green(`✓ Processed attribute ${attribute.key}`));
      }
      
      // Add delay between attribute operations to prevent rate limiting
      await delay(250);
    } catch (error) {
      console.error(chalk.red(`❌ Failed to process attribute ${attribute.key}:`), error);
      throw error;
    }
  }
};

export const deleteObsoleteAttributes = async (
  db: Databases,
  dbId: string,
  collection: Models.Collection,
  collectionConfig: CollectionCreate,
  options: {
    useQueue?: boolean;
    verbose?: boolean;
  } = {}
): Promise<void> => {
  const { useQueue = true, verbose = false } = options;
  
  const configAttributes = collectionConfig.attributes || [];
  const configAttributeKeys = new Set(configAttributes.map(attr => attr.key));
  
  // Find attributes that exist in the database but not in the config
  const obsoleteAttributes = collection.attributes.filter(
    (attr: any) => !configAttributeKeys.has(attr.key)
  );

  if (obsoleteAttributes.length === 0) {
    return;
  }

  if (verbose) {
    console.log(chalk.yellow(`🗑️ Removing ${obsoleteAttributes.length} obsolete attributes from collection ${collection.name}`));
  }

  for (const attr of obsoleteAttributes) {
    const queuedOperation: QueuedOperation = {
      type: "attribute",
      collectionId: collection.$id,
      attribute: { key: (attr as any).key, type: "delete" } as unknown as Attribute,
      collection,
    };

    const executeOperation = async () => {
      await attributeLimit(() => 
        tryAwaitWithRetry(async () => {
          await db.deleteAttribute(dbId, collection.$id, (attr as any).key);
        })
      );
    };

    if (useQueue) {
      enqueueOperation(queuedOperation);
    } else {
      await executeOperation();
      await delay(250);
    }

    if (verbose) {
      console.log(chalk.gray(`🗑️ Deleted obsolete attribute ${(attr as any).key}`));
    }
  }
};