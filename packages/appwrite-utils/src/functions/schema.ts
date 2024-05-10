import { ID, IndexType, Permission } from "node-appwrite";
import { z } from "zod";
import { type Attribute, attributeSchema } from "../schemas/attribute";
import { stringAttributeSchema } from "../schemas/stringAttribute";
import { integerAttributeSchema } from "../schemas/integerAttribute";
import { floatAttributeSchema } from "../schemas/floatAttribute";
import { booleanAttributeSchema } from "../schemas/booleanAttribute";
import { datetimeAttributeSchema } from "../schemas/datetimeAttribute";
import { emailAttributeSchema } from "../schemas/emailAttribute";
import { ipAttributeSchema } from "../schemas/ipAttribute";
import { urlAttributeSchema } from "../schemas/urlAttribute";
import { enumAttributeSchema } from "../schemas/enumAttribute";
import { relationshipAttributeSchema } from "../schemas/relationshipAttribute";

export const parseAttribute = (
  attribute: Attribute & {
    default?: undefined | null | string | number | boolean;
  }
): Attribute => {
  let attributeToParse: any = { ...attribute };

  // Check if 'default' is provided and set it as 'xdefault'
  if (attribute.default !== undefined) {
    attributeToParse.xdefault = attribute.default;
    delete attributeToParse.default;
  }

  if (
    attributeToParse.type === "string" &&
    attributeToParse.format &&
    attributeToParse.format.length > 0
  ) {
    attributeToParse.type = attributeToParse.format.toLowerCase();
    delete attributeToParse.format;
  }

  switch (attributeToParse.type) {
    case "string":
      return stringAttributeSchema.parse(attributeToParse);
    case "integer":
      if (
        attributeToParse.min &&
        BigInt(attributeToParse.min) === BigInt(-9223372036854776000)
      ) {
        delete attributeToParse.min;
      }
      if (
        attributeToParse.max &&
        BigInt(attributeToParse.max) === BigInt(9223372036854776000)
      ) {
        delete attributeToParse.max;
      }
      return integerAttributeSchema.parse(attributeToParse);
    case "float":
      return floatAttributeSchema.parse(attributeToParse);
    case "boolean":
      return booleanAttributeSchema.parse(attributeToParse);
    case "datetime":
      return datetimeAttributeSchema.parse(attributeToParse);
    case "email":
      return emailAttributeSchema.parse(attributeToParse);
    case "ip":
      return ipAttributeSchema.parse(attributeToParse);
    case "url":
      return urlAttributeSchema.parse(attributeToParse);
    case "enum":
      return enumAttributeSchema.parse(attributeToParse);
    case "relationship":
      return relationshipAttributeSchema.parse(attributeToParse);
    default:
      throw new Error(`Invalid attribute type: ${attributeToParse.type}`);
  }
};
