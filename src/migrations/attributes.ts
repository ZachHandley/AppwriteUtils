import { Query, type Databases, type Models } from "node-appwrite";
import type { Attribute } from "./schema.js";
import { nameToIdMapping, enqueueOperation } from "./queue.js";

export const createOrUpdateAttribute = async (
  db: Databases,
  dbId: string,
  collection: Models.Collection,
  attribute: Attribute
): Promise<void> => {
  let action = "create";
  let foundAttribute;
  try {
    foundAttribute = await db.getAttribute(dbId, collection.$id, attribute.key);
  } catch (error) {
    foundAttribute = undefined;
  }
  let numSameAttributes = 0;
  if (foundAttribute && foundAttribute.key === attribute.key) {
    numSameAttributes++;
    return;
  } else if (foundAttribute) {
    action = "update";
  }

  // Relationship attribute logic with adjustments
  let collectionFoundViaRelatedCollection: Models.Collection | undefined;
  let relatedCollectionId: string | undefined;
  if (attribute.type === "relationship") {
    if (nameToIdMapping.has(attribute.relatedCollection)) {
      console.log(
        `Name to ID Mapping has relationship collection with name: ${attribute.relatedCollection}`
      );
      relatedCollectionId = nameToIdMapping.get(attribute.relatedCollection);
      console.log(`Fetching collection by ID: ${relatedCollectionId}`);
      try {
        collectionFoundViaRelatedCollection = await db.getCollection(
          dbId,
          relatedCollectionId!
        );
        console.log(
          `Collection found: ${collectionFoundViaRelatedCollection.$id}`
        );
      } catch (e) {
        console.log(
          `Collection not found: ${attribute.relatedCollection} when nameToIdMapping was set`
        );
        collectionFoundViaRelatedCollection = undefined;
      }
    } else {
      console.log(
        `Name to ID mapping does not have collection with name: ${attribute.relatedCollection}`
      );
      const collectionsPulled = await db.listCollections(dbId, [
        Query.equal("name", attribute.relatedCollection),
      ]);
      if (collectionsPulled.total > 0) {
        console.log(
          `Found ${collectionsPulled.total} collections with name: ${attribute.relatedCollection}`
        );
        collectionFoundViaRelatedCollection = collectionsPulled.collections[0];
        relatedCollectionId = collectionFoundViaRelatedCollection.$id;
        nameToIdMapping.set(attribute.relatedCollection, relatedCollectionId);
      }
    }
    console.log(
      `Related collection ID: ${relatedCollectionId}, found: ${collectionFoundViaRelatedCollection}`
    );
    if (!(relatedCollectionId && collectionFoundViaRelatedCollection)) {
      console.log(`Enqueueing operation for attribute: ${attribute.key}`);
      enqueueOperation({
        type: "attribute",
        collectionId: collection.$id,
        collection: collection,
        attribute,
        dependencies: [attribute.relatedCollection],
      });
      return;
    }
  }

  switch (attribute.type) {
    case "string":
      if (action === "create") {
        await db.createStringAttribute(
          dbId,
          collection.$id,
          attribute.key,
          attribute.size,
          attribute.required,
          attribute.xdefault || undefined,
          attribute.array,
          attribute.encrypted
        );
      } else {
        await db.updateStringAttribute(
          dbId,
          collection.$id,
          attribute.key,
          attribute.required,
          attribute.xdefault || undefined
        );
      }
      break;
    case "integer":
      if (action === "create") {
        await db.createIntegerAttribute(
          dbId,
          collection.$id,
          attribute.key,
          attribute.required,
          attribute.min,
          attribute.max,
          attribute.xdefault || undefined,
          attribute.array
        );
      } else {
        await db.updateIntegerAttribute(
          dbId,
          collection.$id,
          attribute.key,
          attribute.required,
          attribute.min || 0,
          attribute.max || 2147483647,
          attribute.xdefault || undefined
        );
      }
      break;
    case "float":
      if (action === "create") {
        await db.createFloatAttribute(
          dbId,
          collection.$id,
          attribute.key,
          attribute.required,
          attribute.min,
          attribute.max,
          attribute.xdefault || undefined,
          attribute.array
        );
      } else {
        await db.updateFloatAttribute(
          dbId,
          collection.$id,
          attribute.key,
          attribute.required,
          attribute.min || 0,
          attribute.max || 2147483647,
          attribute.xdefault || undefined
        );
      }
      break;
    case "boolean":
      if (action === "create") {
        await db.createBooleanAttribute(
          dbId,
          collection.$id,
          attribute.key,
          attribute.required,
          attribute.xdefault || undefined,
          attribute.array
        );
      } else {
        await db.updateBooleanAttribute(
          dbId,
          collection.$id,
          attribute.key,
          attribute.required,
          attribute.xdefault || undefined
        );
      }
      break;
    case "datetime":
      if (action === "create") {
        await db.createDatetimeAttribute(
          dbId,
          collection.$id,
          attribute.key,
          attribute.required,
          attribute.xdefault || undefined,
          attribute.array
        );
      } else {
        await db.updateDatetimeAttribute(
          dbId,
          collection.$id,
          attribute.key,
          attribute.required,
          attribute.xdefault || undefined
        );
      }
      break;
    case "email":
      if (action === "create") {
        await db.createEmailAttribute(
          dbId,
          collection.$id,
          attribute.key,
          attribute.required,
          attribute.xdefault || undefined,
          attribute.array
        );
      } else {
        await db.updateEmailAttribute(
          dbId,
          collection.$id,
          attribute.key,
          attribute.required,
          attribute.xdefault || undefined
        );
      }
      break;
    case "ip":
      if (action === "create") {
        await db.createIpAttribute(
          dbId,
          collection.$id,
          attribute.key,
          attribute.required,
          attribute.xdefault || undefined,
          attribute.array
        );
      } else {
        await db.updateIpAttribute(
          dbId,
          collection.$id,
          attribute.key,
          attribute.required,
          attribute.xdefault || undefined
        );
      }
      break;
    case "url":
      if (action === "create") {
        await db.createUrlAttribute(
          dbId,
          collection.$id,
          attribute.key,
          attribute.required,
          attribute.xdefault || undefined,
          attribute.array
        );
      } else {
        await db.updateUrlAttribute(
          dbId,
          collection.$id,
          attribute.key,
          attribute.required,
          attribute.xdefault || undefined
        );
      }
      break;
    case "enum":
      if (action === "create") {
        await db.createEnumAttribute(
          dbId,
          collection.$id,
          attribute.key,
          attribute.elements,
          attribute.required,
          attribute.xdefault || undefined,
          attribute.array
        );
      } else {
        await db.updateEnumAttribute(
          dbId,
          collection.$id,
          attribute.key,
          attribute.elements,
          attribute.required,
          attribute.xdefault || undefined
        );
      }
      break;
    case "relationship":
      if (action === "create") {
        await db.createRelationshipAttribute(
          dbId,
          collection.$id,
          relatedCollectionId!,
          attribute.relationType,
          attribute.twoWay,
          attribute.key,
          attribute.twoWayKey,
          attribute.onDelete
        );
      } else {
        await db.updateRelationshipAttribute(
          dbId,
          collection.$id,
          attribute.key,
          attribute.onDelete
        );
      }
      break;
    default:
      console.error("Invalid attribute type");
      break;
  }
  console.log(
    `Found ${numSameAttributes} attributes with the same name and did nothing`
  );
};

export const createUpdateCollectionAttributes = async (
  db: Databases,
  dbId: string,
  collection: Models.Collection,
  attributes: Attribute[]
): Promise<void> => {
  console.log(`Creating/Updating attributes for collection: ${collection.$id}`);

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
};
