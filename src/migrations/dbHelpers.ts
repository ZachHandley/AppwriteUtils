import type { Attribute, RelationshipAttribute } from "./schema";

// Helper function to categorize collections based on relationship sides
export const categorizeCollectionByRelationshipSide = (
  attributes: Attribute[]
): "parent" | "mixed" | "child" => {
  let hasParent = false;
  let hasChild = false;

  for (const attr of attributes) {
    if (attr.type === "relationship") {
      if (attr.side === "parent") {
        hasParent = true;
      } else if (attr.side === "child") {
        hasChild = true;
      }
    }
  }

  if (hasParent && hasChild) return "mixed";
  if (hasParent) return "parent";
  return "child";
};

// Helper function to get all dependencies of a collection
export const getDependencies = (attributes: Attribute[]): string[] => {
  return attributes
    .filter(
      (attr) =>
        attr.type === "relationship" && attr.relatedCollection !== undefined
    )
    .map((attr) => (attr as RelationshipAttribute).relatedCollection);
};

// Function to sort collections based on dependencies and relationship sides
export const sortCollections = (configCollections: any[]): any[] => {
  // Categorize collections based on their relationship sides
  const parentCollections = configCollections.filter(
    ({ attributes }) =>
      categorizeCollectionByRelationshipSide(attributes) === "parent"
  );
  const mixedCollections = configCollections.filter(
    ({ attributes }) =>
      categorizeCollectionByRelationshipSide(attributes) === "mixed"
  );
  const childCollections = configCollections.filter(
    ({ attributes }) =>
      categorizeCollectionByRelationshipSide(attributes) === "child"
  );

  // Sort mixedCollections to ensure parents are processed before children within the mixed category
  // This might involve more sophisticated logic if you need to order mixed collections based on specific parent-child relationships
  mixedCollections.sort((a, b) => {
    // Example sorting logic for mixed collections; adjust based on your specific needs
    const aDependencies = getDependencies(a.attributes).length;
    const bDependencies = getDependencies(b.attributes).length;
    return aDependencies - bDependencies;
  });

  // Combine them back into a single array with the desired order
  return [...parentCollections, ...mixedCollections, ...childCollections];
};

// Function to sort attributes within a collection based on relationship sides
export const sortAttributesByRelationshipSide = (
  attributes: Attribute[]
): Attribute[] => {
  // Separate attributes into parent and child based on their relationship side
  const parentAttributes = attributes.filter(
    (attr) => attr.type === "relationship" && attr.side === "parent"
  );
  const childAttributes = attributes.filter(
    (attr) => attr.type === "relationship" && attr.side === "child"
  );
  const otherAttributes = attributes.filter(
    (attr) => attr.type !== "relationship"
  );

  // Combine them back into a single array with parent attributes first, then other attributes, and child attributes last
  return [...parentAttributes, ...otherAttributes, ...childAttributes];
};
