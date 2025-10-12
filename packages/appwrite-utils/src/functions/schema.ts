import { attributeSchema, type Attribute } from "../schemas/attribute.js";

export const parseAttribute = (
  attribute: Record<string, unknown>
): Attribute => {
  const attributeToParse: Record<string, unknown> = { ...attribute };

  // Normalize default into xdefault for compatibility with Appwrite SDK
  if ("default" in attributeToParse) {
    if (attributeToParse.default !== null && attributeToParse.default !== undefined) {
      attributeToParse.xdefault = attributeToParse.default;
    }
    delete attributeToParse.default;
  }

  if (
    attributeToParse.type === "string" &&
    typeof attributeToParse.format === "string" &&
    attributeToParse.format.length > 0
  ) {
    attributeToParse.type = attributeToParse.format.toLowerCase();
    delete attributeToParse.format;
  }

  return attributeSchema.parse(attributeToParse);
};
