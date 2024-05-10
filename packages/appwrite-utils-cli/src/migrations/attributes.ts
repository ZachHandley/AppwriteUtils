import { Query, type Databases, type Models } from "node-appwrite";
import {
  attributeSchema,
  parseAttribute,
  type Attribute,
} from "appwrite-utils";
import { nameToIdMapping, enqueueOperation } from "./queue.js";
import _ from "lodash";

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
  const updateEnabled = false;
  let finalAttribute: any = attribute;
  try {
    const collectionAttr = collection.attributes.find(
      // @ts-expect-error
      (attr) => attr.key === attribute.key
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
    // Check if mutable properties have changed and set action to "update" if necessary
    const requiredChanged =
      "required" in foundAttribute && "required" in attribute
        ? foundAttribute.required !== attribute.required
        : false;

    // const xdefaultChanged =
    //   "xdefault" in foundAttribute && "xdefault" in attribute
    //     ? foundAttribute.xdefault !== attribute.xdefault
    //     : false;

    const onDeleteChanged =
      foundAttribute.type === "relationship" &&
      attribute.type === "relationship" &&
      "onDelete" in foundAttribute &&
      "onDelete" in attribute
        ? foundAttribute.onDelete !== attribute.onDelete
        : false;

    if (requiredChanged || onDeleteChanged) {
      console.log(
        `Required changed: ${requiredChanged}\nOnDelete changed: ${onDeleteChanged}`
      );
      console.log(
        `Found attribute: ${JSON.stringify(foundAttribute, null, 2)}`
      );
      console.log(`Attribute: ${JSON.stringify(attribute, null, 2)}`);
      finalAttribute = {
        ...attribute,
        ...foundAttribute,
      };
      action = "update";
    } else {
      // If no properties that can be updated have changed, return early
      return;
    }
  } else if (
    foundAttribute &&
    !attributesSame(foundAttribute, attribute) &&
    updateEnabled
  ) {
    console.log(
      `Deleting attribute with same key ${
        attribute.key
      } -- but different values -- ${JSON.stringify(
        attribute,
        null,
        2
      )} -- ${JSON.stringify(foundAttribute, null, 2)}`
    );
    await db.deleteAttribute(dbId, collection.$id, attribute.key);
    // After deletion, you might want to create the attribute anew
    finalAttribute = attribute;
    action = "create";
  } else if (!updateEnabled && foundAttribute) {
    return;
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
        await db.createStringAttribute(
          dbId,
          collection.$id,
          finalAttribute.key,
          finalAttribute.size,
          finalAttribute.required || false,
          (finalAttribute.xdefault as string) || undefined,
          finalAttribute.array || false,
          finalAttribute.encrypted
        );
      } else {
        await db.updateStringAttribute(
          dbId,
          collection.$id,
          finalAttribute.key,
          finalAttribute.required || false,
          (finalAttribute.xdefault as string) || undefined
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
        await db.createIntegerAttribute(
          dbId,
          collection.$id,
          finalAttribute.key,
          finalAttribute.required || false,
          finalAttribute.min,
          finalAttribute.max,
          finalAttribute.xdefault || undefined,
          finalAttribute.array
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
        await db.updateIntegerAttribute(
          dbId,
          collection.$id,
          finalAttribute.key,
          finalAttribute.required || false,
          finalAttribute.min || 0,
          finalAttribute.max || 2147483647,
          finalAttribute.xdefault || undefined
        );
      }
      break;
    case "float":
      if (action === "create") {
        await db.createFloatAttribute(
          dbId,
          collection.$id,
          finalAttribute.key,
          finalAttribute.required || false,
          finalAttribute.min,
          finalAttribute.max,
          finalAttribute.xdefault || undefined,
          finalAttribute.array
        );
      } else {
        await db.updateFloatAttribute(
          dbId,
          collection.$id,
          finalAttribute.key,
          finalAttribute.required || false,
          finalAttribute.min || 0,
          finalAttribute.max || 2147483647,
          finalAttribute.xdefault || undefined
        );
      }
      break;
    case "boolean":
      if (action === "create") {
        await db.createBooleanAttribute(
          dbId,
          collection.$id,
          finalAttribute.key,
          finalAttribute.required || false,
          finalAttribute.xdefault || undefined,
          finalAttribute.array
        );
      } else {
        await db.updateBooleanAttribute(
          dbId,
          collection.$id,
          finalAttribute.key,
          finalAttribute.required || false,
          finalAttribute.xdefault || null
        );
      }
      break;
    case "datetime":
      if (action === "create") {
        await db.createDatetimeAttribute(
          dbId,
          collection.$id,
          finalAttribute.key,
          finalAttribute.required || false,
          finalAttribute.xdefault || undefined,
          finalAttribute.array
        );
      } else {
        await db.updateDatetimeAttribute(
          dbId,
          collection.$id,
          finalAttribute.key,
          finalAttribute.required || false,
          finalAttribute.xdefault || undefined
        );
      }
      break;
    case "email":
      if (action === "create") {
        await db.createEmailAttribute(
          dbId,
          collection.$id,
          finalAttribute.key,
          finalAttribute.required || false,
          finalAttribute.xdefault || undefined,
          finalAttribute.array
        );
      } else {
        await db.updateEmailAttribute(
          dbId,
          collection.$id,
          finalAttribute.key,
          finalAttribute.required || false,
          finalAttribute.xdefault || undefined
        );
      }
      break;
    case "ip":
      if (action === "create") {
        await db.createIpAttribute(
          dbId,
          collection.$id,
          finalAttribute.key,
          finalAttribute.required || false,
          finalAttribute.xdefault || undefined,
          finalAttribute.array
        );
      } else {
        await db.updateIpAttribute(
          dbId,
          collection.$id,
          finalAttribute.key,
          finalAttribute.required || false,
          finalAttribute.xdefault || undefined
        );
      }
      break;
    case "url":
      if (action === "create") {
        await db.createUrlAttribute(
          dbId,
          collection.$id,
          finalAttribute.key,
          finalAttribute.required || false,
          finalAttribute.xdefault || undefined,
          finalAttribute.array
        );
      } else {
        await db.updateUrlAttribute(
          dbId,
          collection.$id,
          finalAttribute.key,
          finalAttribute.required || false,
          finalAttribute.xdefault || undefined
        );
      }
      break;
    case "enum":
      if (action === "create") {
        await db.createEnumAttribute(
          dbId,
          collection.$id,
          finalAttribute.key,
          finalAttribute.elements,
          finalAttribute.required || false,
          finalAttribute.xdefault || undefined,
          finalAttribute.array
        );
      } else {
        await db.updateEnumAttribute(
          dbId,
          collection.$id,
          finalAttribute.key,
          finalAttribute.elements,
          finalAttribute.required || false,
          finalAttribute.xdefault || undefined
        );
      }
      break;
    case "relationship":
      if (action === "create") {
        await db.createRelationshipAttribute(
          dbId,
          collection.$id,
          relatedCollectionId!,
          finalAttribute.relationType,
          finalAttribute.twoWay,
          finalAttribute.key,
          finalAttribute.twoWayKey,
          finalAttribute.onDelete
        );
      } else {
        await db.updateRelationshipAttribute(
          dbId,
          collection.$id,
          finalAttribute.key,
          finalAttribute.onDelete
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

  const batchSize = 3; // Size of each batch
  for (let i = 0; i < attributes.length; i += batchSize) {
    // Slice the attributes array to get a batch of at most batchSize elements
    const batch = attributes.slice(i, i + batchSize);
    const attributePromises = batch.map((attribute) =>
      createOrUpdateAttribute(db, dbId, collection, attribute)
    );

    // Await the completion of all promises in the current batch
    const results = await Promise.allSettled(attributePromises);
    results.forEach((result) => {
      if (result.status === "rejected") {
        console.error("An attribute promise was rejected:", result.reason);
      }
    });
  }
  console.log(
    `Finished creating/updating attributes for collection: ${collection.name}`
  );
};
