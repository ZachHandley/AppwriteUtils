import { Query, type Databases, type Models } from "node-appwrite";
import {
  attributeSchema,
  parseAttribute,
  type Attribute,
} from "appwrite-utils";
import { nameToIdMapping, enqueueOperation } from "../shared/operationQueue.js";
import { delay, tryAwaitWithRetry } from "../utils/helperFunctions.js";
import chalk from "chalk";

// Interface for attribute with status (fixing the type issue)
interface AttributeWithStatus {
  key: string;
  type: string;
  status: 'available' | 'processing' | 'deleting' | 'stuck' | 'failed';
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
  db: Databases,
  dbId: string,
  collectionId: string,
  attributeKey: string,
  maxWaitTime: number = 60000, // 1 minute
  retryCount: number = 0,
  maxRetries: number = 5
): Promise<boolean> => {
  const startTime = Date.now();
  let checkInterval = 2000; // Start with 2 seconds
  
  // Calculate exponential backoff: 2s, 4s, 8s, 16s, 30s (capped at 30s)
  if (retryCount > 0) {
    const exponentialDelay = Math.min(2000 * Math.pow(2, retryCount), 30000);
    console.log(chalk.blue(`Waiting for attribute '${attributeKey}' to become available (retry ${retryCount}, backoff: ${exponentialDelay}ms)...`));
    await delay(exponentialDelay);
  } else {
    console.log(chalk.blue(`Waiting for attribute '${attributeKey}' to become available...`));
  }
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const collection = await db.getCollection(dbId, collectionId);
      const attribute = (collection.attributes as any[]).find(
        (attr: AttributeWithStatus) => attr.key === attributeKey
      ) as AttributeWithStatus | undefined;
      
      if (!attribute) {
        console.log(chalk.red(`Attribute '${attributeKey}' not found`));
        return false;
      }
      
      console.log(chalk.gray(`Attribute '${attributeKey}' status: ${attribute.status}`));
      
      switch (attribute.status) {
        case 'available':
          console.log(chalk.green(`✅ Attribute '${attributeKey}' is now available`));
          return true;
          
        case 'failed':
          console.log(chalk.red(`❌ Attribute '${attributeKey}' failed: ${attribute.error}`));
          return false;
          
        case 'stuck':
          console.log(chalk.yellow(`⚠️ Attribute '${attributeKey}' is stuck, will retry...`));
          return false;
          
        case 'processing':
          // Continue waiting
          break;
          
        case 'deleting':
          console.log(chalk.yellow(`Attribute '${attributeKey}' is being deleted`));
          break;
          
        default:
          console.log(chalk.yellow(`Unknown status '${attribute.status}' for attribute '${attributeKey}'`));
          break;
      }
      
      await delay(checkInterval);
    } catch (error) {
      console.log(chalk.red(`Error checking attribute status: ${error}`));
      return false;
    }
  }
  
  // Timeout reached
  console.log(chalk.yellow(`⏰ Timeout waiting for attribute '${attributeKey}' (${maxWaitTime}ms)`));
  
  // If we have retries left and this isn't the last retry, try recreating
  if (retryCount < maxRetries) {
    console.log(chalk.yellow(`🔄 Retrying attribute creation (attempt ${retryCount + 1}/${maxRetries})`));
    return false; // Signal that we need to retry
  }
  
  return false;
};

/**
 * Wait for all attributes in a collection to become available
 */
const waitForAllAttributesAvailable = async (
  db: Databases,
  dbId: string,
  collectionId: string,
  attributeKeys: string[],
  maxWaitTime: number = 60000
): Promise<string[]> => {
  console.log(chalk.blue(`Waiting for ${attributeKeys.length} attributes to become available...`));
  
  const failedAttributes: string[] = [];
  
  for (const attributeKey of attributeKeys) {
    const success = await waitForAttributeAvailable(db, dbId, collectionId, attributeKey, maxWaitTime);
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
  db: Databases,
  dbId: string,
  collection: Models.Collection,
  retryCount: number
): Promise<Models.Collection | null> => {
  try {
    console.log(chalk.yellow(`🗑️ Deleting collection '${collection.name}' for retry ${retryCount}`));
    
    // Delete the collection
    await db.deleteCollection(dbId, collection.$id);
    console.log(chalk.yellow(`Deleted collection '${collection.name}'`));
    
    // Wait a bit before recreating
    await delay(2000);
    
    // Recreate the collection
    console.log(chalk.blue(`🔄 Recreating collection '${collection.name}'`));
    const newCollection = await db.createCollection(
      dbId,
      collection.$id,
      collection.name,
      collection.$permissions,
      collection.documentSecurity,
      collection.enabled
    );
    
    console.log(chalk.green(`✅ Recreated collection '${collection.name}'`));
    return newCollection;
    
  } catch (error) {
    console.log(chalk.red(`Failed to delete/recreate collection '${collection.name}': ${error}`));
    return null;
  }
};

const attributesSame = (
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

/**
 * Enhanced attribute creation with proper status monitoring and retry logic
 */
export const createOrUpdateAttributeWithStatusCheck = async (
  db: Databases,
  dbId: string,
  collection: Models.Collection,
  attribute: Attribute,
  retryCount: number = 0,
  maxRetries: number = 5
): Promise<boolean> => {
  console.log(chalk.blue(`Creating/updating attribute '${attribute.key}' (attempt ${retryCount + 1}/${maxRetries + 1})`));
  
  try {
    // First, try to create/update the attribute using existing logic
    await createOrUpdateAttribute(db, dbId, collection, attribute);
    
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
      console.log(chalk.yellow(`Attribute '${attribute.key}' failed/stuck, deleting and retrying...`));
      
      // Try to delete the specific stuck attribute instead of the entire collection
      try {
        await db.deleteAttribute(dbId, collection.$id, attribute.key);
        console.log(chalk.yellow(`Deleted stuck attribute '${attribute.key}', will retry creation`));
        
        // Wait a bit before retry
        await delay(3000);
        
        // Get fresh collection data
        const freshCollection = await db.getCollection(dbId, collection.$id);
        
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
        console.log(chalk.red(`Failed to delete stuck attribute '${attribute.key}': ${deleteError}`));
        
        // If attribute deletion fails, only then try collection recreation as last resort
        if (retryCount >= maxRetries - 1) {
          console.log(chalk.yellow(`Last resort: Recreating collection for attribute '${attribute.key}'`));
          
          // Get fresh collection data
          const freshCollection = await db.getCollection(dbId, collection.$id);
          
          // Delete and recreate collection
          const newCollection = await deleteAndRecreateCollection(db, dbId, freshCollection, retryCount + 1);
          
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
    
    console.log(chalk.red(`❌ Failed to create attribute '${attribute.key}' after ${maxRetries + 1} attempts`));
    return false;
    
  } catch (error) {
    console.log(chalk.red(`Error creating attribute '${attribute.key}': ${error}`));
    
    if (retryCount < maxRetries) {
      console.log(chalk.yellow(`Retrying attribute '${attribute.key}' due to error...`));
      
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
  db: Databases,
  dbId: string,
  collection: Models.Collection,
  attribute: Attribute
): Promise<void> => {
  let action = "create";
  let foundAttribute: Attribute | undefined;
  const updateEnabled = true;
  let finalAttribute: any = attribute;
  try {
    const collectionAttr = collection.attributes.find(
      (attr: any) => attr.key === attribute.key
    ) as unknown as any;
    foundAttribute = parseAttribute(collectionAttr);
    // console.log(`Found attribute: ${JSON.stringify(foundAttribute)}`);
  } catch (error) {
    foundAttribute = undefined;
  }

  if (
    foundAttribute &&
    attributesSame(foundAttribute, attribute) &&
    updateEnabled
  ) {
    // No need to do anything, they are the same
    return;
  } else if (
    foundAttribute &&
    !attributesSame(foundAttribute, attribute) &&
    updateEnabled
  ) {
    // console.log(
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
    await db.deleteAttribute(dbId, collection.$id, attribute.key);
    console.log(
      `Deleted attribute: ${attribute.key} to recreate it because they diff (update disabled temporarily)`
    );
    return;
  }

  // console.log(`${action}-ing attribute: ${finalAttribute.key}`);

  // Relationship attribute logic with adjustments
  let collectionFoundViaRelatedCollection: Models.Collection | undefined;
  let relatedCollectionId: string | undefined;
  if (finalAttribute.type === "relationship") {
    if (nameToIdMapping.has(finalAttribute.relatedCollection)) {
      relatedCollectionId = nameToIdMapping.get(
        finalAttribute.relatedCollection
      );
      try {
        collectionFoundViaRelatedCollection = await db.getCollection(
          dbId,
          relatedCollectionId!
        );
      } catch (e) {
        // console.log(
        //   `Collection not found: ${finalAttribute.relatedCollection} when nameToIdMapping was set`
        // );
        collectionFoundViaRelatedCollection = undefined;
      }
    } else {
      const collectionsPulled = await db.listCollections(dbId, [
        Query.equal("name", finalAttribute.relatedCollection),
      ]);
      if (collectionsPulled.total > 0) {
        collectionFoundViaRelatedCollection = collectionsPulled.collections[0];
        relatedCollectionId = collectionFoundViaRelatedCollection.$id;
        nameToIdMapping.set(
          finalAttribute.relatedCollection,
          relatedCollectionId
        );
      }
    }
    if (!(relatedCollectionId && collectionFoundViaRelatedCollection)) {
      // console.log(`Enqueueing operation for attribute: ${finalAttribute.key}`);
      enqueueOperation({
        type: "attribute",
        collectionId: collection.$id,
        collection: collection,
        attribute,
        dependencies: [finalAttribute.relatedCollection],
      });
      return;
    }
  }
  finalAttribute = parseAttribute(finalAttribute);
  // console.log(`Final Attribute: ${JSON.stringify(finalAttribute)}`);
  switch (finalAttribute.type) {
    case "string":
      if (action === "create") {
        await tryAwaitWithRetry(
          async () =>
            await db.createStringAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.size,
              finalAttribute.required || false,
              finalAttribute.xdefault !== undefined && !finalAttribute.required
                ? finalAttribute.xdefault
                : null,
              finalAttribute.array || false,
              finalAttribute.encrypted
            )
        );
      } else {
        await tryAwaitWithRetry(
          async () =>
            await db.updateStringAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.required || false,
              finalAttribute.xdefault !== undefined && !finalAttribute.required
                ? finalAttribute.xdefault
                : null
            )
        );
      }
      break;
    case "integer":
      if (action === "create") {
        if (
          finalAttribute.min &&
          BigInt(finalAttribute.min) === BigInt(-9223372036854776000)
        ) {
          delete finalAttribute.min;
        }
        if (
          finalAttribute.max &&
          BigInt(finalAttribute.max) === BigInt(9223372036854776000)
        ) {
          delete finalAttribute.max;
        }
        await tryAwaitWithRetry(
          async () =>
            await db.createIntegerAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.required || false,
              finalAttribute.min || -2147483647,
              finalAttribute.max || 2147483647,
              finalAttribute.xdefault !== undefined && !finalAttribute.required
                ? finalAttribute.xdefault
                : null,
              finalAttribute.array || false
            )
        );
      } else {
        if (
          finalAttribute.min &&
          BigInt(finalAttribute.min) === BigInt(-9223372036854776000)
        ) {
          delete finalAttribute.min;
        }
        if (
          finalAttribute.max &&
          BigInt(finalAttribute.max) === BigInt(9223372036854776000)
        ) {
          delete finalAttribute.max;
        }
        await tryAwaitWithRetry(
          async () =>
            await db.updateIntegerAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.required || false,
              finalAttribute.min || -2147483647,
              finalAttribute.max || 2147483647,
              finalAttribute.xdefault !== undefined && !finalAttribute.required
                ? finalAttribute.xdefault
                : null
            )
        );
      }
      break;
    case "double":
    case "float": // Backward compatibility
      if (action === "create") {
        await tryAwaitWithRetry(
          async () =>
            await db.createFloatAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.required || false,
              finalAttribute.min !== undefined ? finalAttribute.min : -2147483647,
              finalAttribute.max !== undefined ? finalAttribute.max : 2147483647,
              finalAttribute.xdefault !== undefined && !finalAttribute.required
                ? finalAttribute.xdefault
                : null,
              finalAttribute.array || false
            )
        );
      } else {
        await tryAwaitWithRetry(
          async () =>
            await db.updateFloatAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.required || false,
              finalAttribute.min !== undefined ? finalAttribute.min : -2147483647,
              finalAttribute.max !== undefined ? finalAttribute.max : 2147483647,
              finalAttribute.xdefault !== undefined && !finalAttribute.required
                ? finalAttribute.xdefault
                : null
            )
        );
      }
      break;
    case "boolean":
      if (action === "create") {
        await tryAwaitWithRetry(
          async () =>
            await db.createBooleanAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.required || false,
              finalAttribute.xdefault !== undefined && !finalAttribute.required
                ? finalAttribute.xdefault
                : null,
              finalAttribute.array || false
            )
        );
      } else {
        await tryAwaitWithRetry(
          async () =>
            await db.updateBooleanAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.required || false,
              finalAttribute.xdefault !== undefined && !finalAttribute.required
                ? finalAttribute.xdefault
                : null
            )
        );
      }
      break;
    case "datetime":
      if (action === "create") {
        await tryAwaitWithRetry(
          async () =>
            await db.createDatetimeAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.required || false,
              finalAttribute.xdefault !== undefined && !finalAttribute.required
                ? finalAttribute.xdefault
                : null,
              finalAttribute.array || false
            )
        );
      } else {
        await tryAwaitWithRetry(
          async () =>
            await db.updateDatetimeAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.required || false,
              finalAttribute.xdefault !== undefined && !finalAttribute.required
                ? finalAttribute.xdefault
                : null
            )
        );
      }
      break;
    case "email":
      if (action === "create") {
        await tryAwaitWithRetry(
          async () =>
            await db.createEmailAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.required || false,
              finalAttribute.xdefault !== undefined && !finalAttribute.required
                ? finalAttribute.xdefault
                : null,
              finalAttribute.array || false
            )
        );
      } else {
        await tryAwaitWithRetry(
          async () =>
            await db.updateEmailAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.required || false,
              finalAttribute.xdefault !== undefined && !finalAttribute.required
                ? finalAttribute.xdefault
                : null
            )
        );
      }
      break;
    case "ip":
      if (action === "create") {
        await tryAwaitWithRetry(
          async () =>
            await db.createIpAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.required || false,
              finalAttribute.xdefault !== undefined && !finalAttribute.required
                ? finalAttribute.xdefault
                : null,
              finalAttribute.array || false
            )
        );
      } else {
        await tryAwaitWithRetry(
          async () =>
            await db.updateIpAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.required || false,
              finalAttribute.xdefault !== undefined && !finalAttribute.required
                ? finalAttribute.xdefault
                : null
            )
        );
      }
      break;
    case "url":
      if (action === "create") {
        await tryAwaitWithRetry(
          async () =>
            await db.createUrlAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.required || false,
              finalAttribute.xdefault !== undefined && !finalAttribute.required
                ? finalAttribute.xdefault
                : null,
              finalAttribute.array || false
            )
        );
      } else {
        await tryAwaitWithRetry(
          async () =>
            await db.updateUrlAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.required || false,
              finalAttribute.xdefault !== undefined && !finalAttribute.required
                ? finalAttribute.xdefault
                : null
            )
        );
      }
      break;
    case "enum":
      if (action === "create") {
        await tryAwaitWithRetry(
          async () =>
            await db.createEnumAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.elements,
              finalAttribute.required || false,
              finalAttribute.xdefault !== undefined && !finalAttribute.required
                ? finalAttribute.xdefault
                : null,
              finalAttribute.array || false
            )
        );
      } else {
        await tryAwaitWithRetry(
          async () =>
            await db.updateEnumAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.elements,
              finalAttribute.required || false,
              finalAttribute.xdefault !== undefined && !finalAttribute.required
                ? finalAttribute.xdefault
                : null
            )
        );
      }
      break;
    case "relationship":
      if (action === "create") {
        await tryAwaitWithRetry(
          async () =>
            await db.createRelationshipAttribute(
              dbId,
              collection.$id,
              relatedCollectionId!,
              finalAttribute.relationType,
              finalAttribute.twoWay,
              finalAttribute.key,
              finalAttribute.twoWayKey,
              finalAttribute.onDelete
            )
        );
      } else {
        await tryAwaitWithRetry(
          async () =>
            await db.updateRelationshipAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.onDelete
            )
        );
      }
      break;
    default:
      console.error("Invalid attribute type");
      break;
  }
};

/**
 * Enhanced collection attribute creation with proper status monitoring
 */
export const createUpdateCollectionAttributesWithStatusCheck = async (
  db: Databases,
  dbId: string,
  collection: Models.Collection,
  attributes: Attribute[]
): Promise<boolean> => {
  console.log(
    chalk.green(
      `Creating/Updating attributes for collection: ${collection.name} with status monitoring`
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

  // Handle attribute removal first
  if (attributesToRemove.length > 0) {
    if (indexesToRemove.length > 0) {
      console.log(
        chalk.red(
          `Removing indexes as they rely on an attribute that is being removed: ${indexesToRemove
            .map((index) => index.key)
            .join(", ")}`
        )
      );
      for (const index of indexesToRemove) {
        await tryAwaitWithRetry(
          async () => await db.deleteIndex(dbId, collection.$id, index.key)
        );
        await delay(500); // Longer delay for deletions
      }
    }
    for (const attr of attributesToRemove) {
      console.log(
        chalk.red(
          `Removing attribute: ${attr.key} as it is no longer in the collection`
        )
      );
      await tryAwaitWithRetry(
        async () => await db.deleteAttribute(dbId, collection.$id, attr.key)
      );
      await delay(500); // Longer delay for deletions
    }
  }

  // First, get fresh collection data and determine which attributes actually need processing
  console.log(chalk.blue(`Analyzing ${attributes.length} attributes to determine which need processing...`));
  
  let currentCollection = collection;
  try {
    currentCollection = await db.getCollection(dbId, collection.$id);
  } catch (error) {
    console.log(chalk.yellow(`Warning: Could not refresh collection data: ${error}`));
  }
  
  const existingAttributesMap = new Map<string, Attribute>();
  try {
    // @ts-expect-error
    const parsedAttributes = currentCollection.attributes.map((attr) => parseAttribute(attr));
    parsedAttributes.forEach(attr => existingAttributesMap.set(attr.key, attr));
  } catch (error) {
    console.log(chalk.yellow(`Warning: Could not parse existing attributes: ${error}`));
  }
  
  // Filter to only attributes that need processing (new or changed)
  const attributesToProcess = attributes.filter(attribute => {
    const existing = existingAttributesMap.get(attribute.key);
    if (!existing) {
      console.log(chalk.blue(`➕ New attribute: ${attribute.key}`));
      return true;
    }
    
    const needsUpdate = !attributesSame(existing, attribute);
    if (needsUpdate) {
      console.log(chalk.blue(`🔄 Changed attribute: ${attribute.key}`));
    } else {
      console.log(chalk.gray(`✅ Unchanged attribute: ${attribute.key} (skipping)`));
    }
    return needsUpdate;
  });
  
  if (attributesToProcess.length === 0) {
    console.log(chalk.green(`✅ All ${attributes.length} attributes are already up to date for collection: ${collection.name}`));
    return true;
  }
  
  console.log(chalk.blue(`Creating ${attributesToProcess.length} attributes sequentially with status monitoring...`));
  
  let remainingAttributes = [...attributesToProcess];
  let overallRetryCount = 0;
  const maxOverallRetries = 3;
  
  while (remainingAttributes.length > 0 && overallRetryCount < maxOverallRetries) {
    const attributesToProcessThisRound = [...remainingAttributes];
    remainingAttributes = []; // Reset for next iteration
    
    console.log(chalk.blue(`\n=== Attempt ${overallRetryCount + 1}/${maxOverallRetries} - Processing ${attributesToProcessThisRound.length} attributes ===`));
    
    for (const attribute of attributesToProcessThisRound) {
      console.log(chalk.blue(`\n--- Processing attribute: ${attribute.key} ---`));
      
      const success = await createOrUpdateAttributeWithStatusCheck(
        db, 
        dbId, 
        currentCollection, 
        attribute
      );
      
      if (success) {
        console.log(chalk.green(`✅ Successfully created attribute: ${attribute.key}`));
        
        // Get updated collection data for next iteration
        try {
          currentCollection = await db.getCollection(dbId, collection.$id);
        } catch (error) {
          console.log(chalk.yellow(`Warning: Could not refresh collection data: ${error}`));
        }
        
        // Add delay between successful attributes
        await delay(1000);
      } else {
        console.log(chalk.red(`❌ Failed to create attribute: ${attribute.key}, will retry in next round`));
        remainingAttributes.push(attribute); // Add back to retry list
      }
    }
    
    if (remainingAttributes.length === 0) {
      console.log(chalk.green(`\n✅ Successfully created all ${attributesToProcess.length} attributes for collection: ${collection.name}`));
      return true;
    }
    
    overallRetryCount++;
    
    if (overallRetryCount < maxOverallRetries) {
      console.log(chalk.yellow(`\n⏳ Waiting 5 seconds before retrying ${attributesToProcess.length} failed attributes...`));
      await delay(5000);
      
      // Refresh collection data before retry
      try {
        currentCollection = await db.getCollection(dbId, collection.$id);
        console.log(chalk.blue(`Refreshed collection data for retry`));
      } catch (error) {
        console.log(chalk.yellow(`Warning: Could not refresh collection data for retry: ${error}`));
      }
    }
  }
  
  // If we get here, some attributes still failed after all retries
  if (attributesToProcess.length > 0) {
    console.log(chalk.red(`\n❌ Failed to create ${attributesToProcess.length} attributes after ${maxOverallRetries} attempts: ${attributesToProcess.map(a => a.key).join(', ')}`));
    console.log(chalk.red(`This may indicate a fundamental issue with the attribute definitions or Appwrite instance`));
    return false;
  }
  
  console.log(chalk.green(`\n✅ Successfully created all ${attributes.length} attributes for collection: ${collection.name}`));
  return true;
};

export const createUpdateCollectionAttributes = async (
  db: Databases,
  dbId: string,
  collection: Models.Collection,
  attributes: Attribute[]
): Promise<void> => {
  console.log(
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
      console.log(
        chalk.red(
          `Removing indexes as they rely on an attribute that is being removed: ${indexesToRemove
            .map((index) => index.key)
            .join(", ")}`
        )
      );
      for (const index of indexesToRemove) {
        await tryAwaitWithRetry(
          async () => await db.deleteIndex(dbId, collection.$id, index.key)
        );
        await delay(100);
      }
    }
    for (const attr of attributesToRemove) {
      console.log(
        chalk.red(
          `Removing attribute: ${attr.key} as it is no longer in the collection`
        )
      );
      await tryAwaitWithRetry(
        async () => await db.deleteAttribute(dbId, collection.$id, attr.key)
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
        console.error("An attribute promise was rejected:", result.reason);
      }
    });

    // Add delay after each batch
    await delay(200);
  }
  console.log(
    `Finished creating/updating attributes for collection: ${collection.name}`
  );
};
