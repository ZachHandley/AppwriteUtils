import { Query, type Databases, type Models } from "node-appwrite";
import {
  attributeSchema,
  parseAttribute,
  type Attribute,
} from "appwrite-utils";
import { nameToIdMapping, enqueueOperation } from "../migrations/queue.js";
import _ from "lodash";
import { delay, tryAwaitWithRetry } from "../utils/helperFunctions.js";

const attributesSame = (
  databaseAttribute: Attribute,
  configAttribute: Attribute
): boolean => {
  return (
    databaseAttribute.key == configAttribute.key &&
    databaseAttribute.type == configAttribute.type &&
    databaseAttribute.array == configAttribute.array
  );
};

export const createOrUpdateAttribute = async (
  db: Databases,
  dbId: string,
  collection: Models.Collection,
  attribute: Attribute
): Promise<void> => {
  let action = "create";
  let foundAttribute: Attribute | undefined;
  let finalAttribute: any = attribute;
  try {
    const collectionAttr = collection.attributes.find(
      // @ts-ignore
      (attr) => attr.key === attribute.key
    ) as unknown as any;
    foundAttribute = parseAttribute(collectionAttr);
  } catch (error) {
    foundAttribute = undefined;
  }

  if (foundAttribute) {
    // Check if any properties have changed
    const requiredChanged =
      "required" in foundAttribute && "required" in attribute
        ? foundAttribute.required !== attribute.required
        : false;

    const xdefaultChanged =
      "xdefault" in foundAttribute && "xdefault" in attribute
        ? foundAttribute.xdefault !== attribute.xdefault
        : false;

    const onDeleteChanged =
      foundAttribute.type === "relationship" &&
      attribute.type === "relationship" &&
      "onDelete" in foundAttribute &&
      "onDelete" in attribute
        ? foundAttribute.onDelete !== attribute.onDelete
        : false;

    if (requiredChanged || xdefaultChanged || onDeleteChanged) {
      console.log(
        `Updating attribute: ${attribute.key}\nRequired changed: ${requiredChanged}\nDefault changed: ${xdefaultChanged}\nOnDelete changed: ${onDeleteChanged}`
      );
      console.log(
        `Found attribute: ${JSON.stringify(foundAttribute, null, 2)}`
      );
      console.log(`New attribute: ${JSON.stringify(attribute, null, 2)}`);
      finalAttribute = {
        ...foundAttribute,
        ...attribute,
      };
      action = "update";
    } else {
      // If no properties have changed, return early
      return;
    }
  }

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
        console.log(
          `Collection not found: ${finalAttribute.relatedCollection} when nameToIdMapping was set`
        );
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
      console.log(`Enqueueing operation for attribute: ${finalAttribute.key}`);
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
  finalAttribute = attributeSchema.parse(finalAttribute);
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
              finalAttribute.xdefault
                ? `${finalAttribute.xdefault}`
                : undefined,
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
              finalAttribute.xdefault
                ? `${finalAttribute.xdefault}`
                : undefined,
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
              finalAttribute.min,
              finalAttribute.max,
              finalAttribute.xdefault || undefined,
              finalAttribute.array
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
              finalAttribute.min || 0,
              finalAttribute.max || 2147483647,
              finalAttribute.xdefault || undefined
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
              finalAttribute.min,
              finalAttribute.max,
              finalAttribute.xdefault || undefined,
              finalAttribute.array
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
              finalAttribute.min || 0,
              finalAttribute.max || 2147483647,
              finalAttribute.xdefault || undefined
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
              finalAttribute.xdefault || undefined,
              finalAttribute.array
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
              finalAttribute.xdefault || null
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
              finalAttribute.xdefault || undefined,
              finalAttribute.array
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
              finalAttribute.xdefault || undefined
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
              finalAttribute.xdefault || undefined,
              finalAttribute.array
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
              finalAttribute.xdefault || undefined
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
              finalAttribute.xdefault || undefined,
              finalAttribute.array
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
              finalAttribute.xdefault || undefined
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
              finalAttribute.xdefault || undefined,
              finalAttribute.array
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
              finalAttribute.xdefault || undefined
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
              finalAttribute.xdefault || undefined,
              finalAttribute.array
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
              finalAttribute.xdefault || undefined
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
    `Creating/Updating attributes for collection: ${collection.name}`
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
