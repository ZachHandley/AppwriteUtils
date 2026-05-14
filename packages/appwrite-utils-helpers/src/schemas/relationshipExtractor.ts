import type { AppwriteConfig, Attribute, RelationshipAttribute } from "appwrite-utils";

/**
 * Represents detailed information about a two-way relationship between collections
 */
export interface RelationshipDetail {
  parentCollection: string;
  childCollection: string;
  parentKey: string;
  childKey: string;
  isArray: boolean;
  isChild: boolean;
}

/**
 * Represents basic relationship information for JSON schema generation
 */
export interface SimpleRelationship {
  attributeKey: string;
  relatedCollection: string;
  relationType: string;
  isArray: boolean;
}

/**
 * Helper function to resolve collection name from ID or name
 * @param config - Appwrite configuration containing collections
 * @param idOrName - Collection ID or name to resolve
 * @returns Resolved collection name, or the original input if not found
 */
export function resolveCollectionName(config: AppwriteConfig, idOrName: string): string {
  const col = config.collections?.find(
    (c) => c.$id === (idOrName as any) || c.name === idOrName
  );
  return col?.name ?? idOrName;
}

/**
 * Determines if a relationship type results in an array
 * @param relationType - The type of relationship (oneToOne, oneToMany, manyToOne, manyToMany)
 * @returns true if the relationship results in an array
 */
export function isArrayRelationship(relationType: string): boolean {
  return relationType === "oneToMany" || relationType === "manyToMany";
}

/**
 * Extracts two-way relationship details from collections for Zod schema generation
 * This handles complex bidirectional relationships with parent-child tracking
 *
 * @param config - Appwrite configuration containing collections
 * @returns Map of collection names to their relationship details
 */
export function extractTwoWayRelationships(
  config: AppwriteConfig
): Map<string, RelationshipDetail[]> {
  const relationshipMap = new Map<string, RelationshipDetail[]>();

  if (!config.collections) {
    return relationshipMap;
  }

  config.collections.forEach((collection) => {
    if (!collection.attributes) {
      return;
    }

    collection.attributes.forEach((attr) => {
      if (attr.type === "relationship" && attr.twoWay && attr.twoWayKey) {
        const relationshipAttr = attr as RelationshipAttribute;

        // Appwrite >= 1.8 emits `relatedTable` instead of `relatedCollection`.
        // The schema accepts either; resolve here for the consumer.
        const relatedRef =
          relationshipAttr.relatedCollection ??
          (relationshipAttr as { relatedTable?: string }).relatedTable;
        if (!relatedRef) {
          return;
        }

        let isArrayParent = false;
        let isArrayChild = false;

        switch (relationshipAttr.relationType) {
          case "oneToMany":
            isArrayParent = true;
            isArrayChild = false;
            break;
          case "manyToMany":
            isArrayParent = true;
            isArrayChild = true;
            break;
          case "oneToOne":
            isArrayParent = false;
            isArrayChild = false;
            break;
          case "manyToOne":
            isArrayParent = false;
            isArrayChild = true;
            break;
          default:
            break;
        }

        const relatedCollectionName = resolveCollectionName(
          config,
          relatedRef
        );

        addTwoWayRelationship(
          relationshipMap,
          collection.name,
          relatedCollectionName,
          attr.key,
          relationshipAttr.twoWayKey!,
          isArrayParent,
          isArrayChild
        );

        console.log(
          `Extracted relationship: ${attr.key}\n\t${collection.name} -> ${relationshipAttr.relatedCollection}, databaseId: ${collection.databaseId}`
        );
      }
    });
  });

  return relationshipMap;
}

/**
 * Helper to add two-way relationship details to both parent and child collections
 * @param relationshipMap - The map to add relationships to
 * @param parentCollection - Parent collection name
 * @param childCollection - Child collection name
 * @param parentKey - Attribute key in parent collection
 * @param childKey - Attribute key in child collection
 * @param isArrayParent - Whether parent side is an array
 * @param isArrayChild - Whether child side is an array
 */
function addTwoWayRelationship(
  relationshipMap: Map<string, RelationshipDetail[]>,
  parentCollection: string,
  childCollection: string,
  parentKey: string,
  childKey: string,
  isArrayParent: boolean,
  isArrayChild: boolean
): void {
  const relationshipsChild = relationshipMap.get(childCollection) || [];
  const relationshipsParent = relationshipMap.get(parentCollection) || [];

  relationshipsParent.push({
    parentCollection,
    childCollection,
    parentKey,
    childKey,
    isArray: isArrayParent,
    isChild: false,
  });

  relationshipsChild.push({
    parentCollection,
    childCollection,
    parentKey,
    childKey,
    isArray: isArrayChild,
    isChild: true,
  });

  relationshipMap.set(childCollection, relationshipsChild);
  relationshipMap.set(parentCollection, relationshipsParent);
}

/**
 * Extracts simple relationship information from collections for JSON schema generation
 * This handles one-way and basic relationship tracking
 *
 * @param config - Appwrite configuration containing collections
 * @returns Map of collection names to their simple relationships
 */
export function extractSimpleRelationships(
  config: AppwriteConfig
): Map<string, SimpleRelationship[]> {
  const relationshipMap = new Map<string, SimpleRelationship[]>();

  if (!config.collections) {
    return relationshipMap;
  }

  config.collections.forEach((collection) => {
    if (!collection.attributes) {
      return;
    }

    collection.attributes.forEach((attr) => {
      if (attr.type === "relationship") {
        // Appwrite >= 1.8 uses `relatedTable` instead of `relatedCollection`.
        const relatedRef =
          attr.relatedCollection ??
          (attr as { relatedTable?: string }).relatedTable;
        if (!relatedRef) return;

        const relationships = relationshipMap.get(collection.name) || [];

        relationships.push({
          attributeKey: attr.key,
          relatedCollection: resolveCollectionName(config, relatedRef),
          relationType: attr.relationType || "oneToOne",
          isArray: isArrayRelationship(attr.relationType || "oneToOne")
        });

        relationshipMap.set(collection.name, relationships);
      }
    });
  });

  return relationshipMap;
}

/**
 * Extracts all relationship attributes from a collection's attributes
 * @param attributes - Array of collection attributes
 * @returns Array of relationship attributes only
 */
export function filterRelationshipAttributes(attributes: Attribute[]): RelationshipAttribute[] {
  return attributes.filter(
    (attr): attr is RelationshipAttribute => attr.type === "relationship"
  );
}
