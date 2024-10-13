import { Query, type Databases, type Models } from "node-appwrite";
import {
  attributeSchema,
  parseAttribute,
  type Attribute,
} from "appwrite-utils";
import { nameToIdMapping, enqueueOperation } from "../migrations/queue.js";
import _ from "lodash";
import { delay, tryAwaitWithRetry } from "../utils/helperFunctions.js";
import chalk from "chalk";

const attributesSame = (
  databaseAttribute: Attribute,
  configAttribute: Attribute
): boolean => {
  const attributesToCheck = [
    'key',
    'type',
    'array',
    'encrypted',
    'required',
    'size',
    'min',
    'max',
    'xdefault',
    'elements',
    'relationType',
    'twoWay',
    'twoWayKey',
    'onDelete',
    'relatedCollection'
  ];

  return attributesToCheck.every(attr => {
    // Check if both objects have the attribute
    const dbHasAttr = attr in databaseAttribute;
    const configHasAttr = attr in configAttribute;

    // If both have the attribute, compare values
    if (dbHasAttr && configHasAttr) {
      const dbValue = databaseAttribute[attr as keyof typeof databaseAttribute];
      const configValue = configAttribute[attr as keyof typeof configAttribute];

      // Consider undefined and null as equivalent
      if ((dbValue === undefined || dbValue === null) && (configValue === undefined || configValue === null)) {
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
  attribute: Attribute
): Promise<void> => {
  let action = "create";
  let foundAttribute: Attribute | undefined;
  const updateEnabled = true;
  let finalAttribute: any = attribute;
  try {
    const collectionAttr = collection.attributes.find(
      // @ts-expect-error
      (attr) => attr.key === attribute.key
    ) as unknown as any;
    foundAttribute = parseAttribute(collectionAttr);
    // console.log(`Found attribute: ${JSON.stringify(foundAttribute)}`);
  } catch (error) {
    foundAttribute = undefined;
  }

  if (foundAttribute && attributesSame(foundAttribute, attribute) && updateEnabled) {
    // No need to do anything, they are the same
    return;
  } else if (foundAttribute && !attributesSame(foundAttribute, attribute) && updateEnabled) {
    // console.log(
    //   `Updating attribute with same key ${attribute.key} but different values`
    // );
    finalAttribute = {
      ...foundAttribute,
      ...attribute,
    };
    action = "update";
  } else if (!updateEnabled && foundAttribute && !attributesSame(foundAttribute, attribute)) {
    await db.deleteAttribute(dbId, collection.$id, attribute.key);
    console.log(`Deleted attribute: ${attribute.key} to recreate it because they diff (update disabled temporarily)`);
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
              finalAttribute.xdefault !== undefined && !finalAttribute.required ? finalAttribute.xdefault : null,
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
              finalAttribute.xdefault !== undefined && !finalAttribute.required ? finalAttribute.xdefault : null,
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
              finalAttribute.xdefault !== undefined && !finalAttribute.required ? finalAttribute.xdefault : null,
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
              finalAttribute.xdefault !== undefined && !finalAttribute.required ? finalAttribute.xdefault : null
            )
        );
      }
      break;
    case "float":
      if (action === "create") {
        await tryAwaitWithRetry(
          async () =>
            await db.createFloatAttribute(
              dbId,
              collection.$id,
              finalAttribute.key,
              finalAttribute.required || false,
              finalAttribute.min || -2147483647,
              finalAttribute.max || 2147483647,
              finalAttribute.xdefault !== undefined && !finalAttribute.required ? finalAttribute.xdefault : null,
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
              finalAttribute.min || -2147483647,
              finalAttribute.max || 2147483647,
              finalAttribute.xdefault !== undefined && !finalAttribute.required ? finalAttribute.xdefault : null
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
              finalAttribute.xdefault !== undefined && !finalAttribute.required ? finalAttribute.xdefault : null,
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
              finalAttribute.xdefault !== undefined && !finalAttribute.required ? finalAttribute.xdefault : null
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
              finalAttribute.xdefault !== undefined && !finalAttribute.required ? finalAttribute.xdefault : null,
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
              finalAttribute.xdefault !== undefined && !finalAttribute.required ? finalAttribute.xdefault : null
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
              finalAttribute.xdefault !== undefined && !finalAttribute.required ? finalAttribute.xdefault : null,
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
              finalAttribute.xdefault !== undefined && !finalAttribute.required ? finalAttribute.xdefault : null
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
              finalAttribute.xdefault !== undefined && !finalAttribute.required ? finalAttribute.xdefault : null,
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
              finalAttribute.xdefault !== undefined && !finalAttribute.required ? finalAttribute.xdefault : null
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
              finalAttribute.xdefault !== undefined && !finalAttribute.required ? finalAttribute.xdefault : null,
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
              finalAttribute.xdefault !== undefined && !finalAttribute.required ? finalAttribute.xdefault : null
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
              finalAttribute.xdefault !== undefined && !finalAttribute.required ? finalAttribute.xdefault : null,
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
              finalAttribute.xdefault !== undefined && !finalAttribute.required ? finalAttribute.xdefault : null
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

export const createUpdateCollectionAttributes = async (
  db: Databases,
  dbId: string,
  collection: Models.Collection,
  attributes: Attribute[]
): Promise<void> => {
  console.log(
    chalk.green(`Creating/Updating attributes for collection: ${collection.name}`)
  );

  const batchSize = 3;
  for (let i = 0; i < attributes.length; i += batchSize) {
    const batch = attributes.slice(i, i + batchSize);
    const attributePromises = batch.map((attribute) =>
      createOrUpdateAttribute(db, dbId, collection, attribute)
    );

    const results = await Promise.allSettled(attributePromises);
    results.forEach((result) => {
      if (result.status === "rejected") {
        console.error("An attribute promise was rejected:", result.reason);
      }
    });

    // Add delay after each batch
    await delay(500);
  }
  console.log(
    `Finished creating/updating attributes for collection: ${collection.name}`
  );
};
