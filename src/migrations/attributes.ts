import type { Databases, Models } from "node-appwrite";
import type { Attribute } from "./schema";
import { nameToIdMapping, enqueueOperation } from "./queue";

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
  if (foundAttribute && foundAttribute.key === attribute.key) {
    console.log("Same attribute key, continuing...");
    return;
  } else if (foundAttribute) {
    action = "update";
  }

  // Relationship attribute logic with adjustments
  if (attribute.type === "relationship") {
    let collectionFoundViaRelatedCollection: Models.Collection | undefined;
    let relatedCollectionId: string | undefined;
    try {
      collectionFoundViaRelatedCollection = await db.getCollection(
        dbId,
        attribute.relatedCollection
      );
      relatedCollectionId = collectionFoundViaRelatedCollection.$id;
    } catch (e) {
      console.log(`${attribute.relatedCollection} must be a name :)`);
      relatedCollectionId = nameToIdMapping.get(attribute.relatedCollection);
      try {
        if (relatedCollectionId) {
          collectionFoundViaRelatedCollection = await db.getCollection(
            dbId,
            relatedCollectionId
          );
        }
      } catch (e) {
        console.log(
          `Could not find collection with name: ${attribute.relatedCollection}`
        );
      }
    }
    if (!relatedCollectionId || !collectionFoundViaRelatedCollection) {
      enqueueOperation({
        type: "attribute",
        collectionId: collection.$id,
        collection: collection,
        attribute,
        dependencies: [attribute.relatedCollection],
      });
      return;
    }
    // Adjust attribute.relatedCollection to use the ID instead of name
    attribute.relatedCollection = relatedCollectionId;
  }

  console.log(`${action.toUpperCase()} attribute: ${attribute.key}`);
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
          attribute.relatedCollection,
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
};

export const createUpdateCollectionAttributes = async (
  db: Databases,
  dbId: string,
  collection: Models.Collection,
  attributes: Attribute[]
): Promise<void> => {
  console.log(`Creating/Updating attributes for collection: ${collection.$id}`);
  for (const attribute of attributes) {
    await createOrUpdateAttribute(db, dbId, collection, attribute);
  }
};
