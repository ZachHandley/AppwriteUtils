import { z } from "zod";
import {
  stringAttributeSchema,
  type StringAttribute,
} from "../schemas/stringAttribute.js";
import {
  integerAttributeSchema,
  type IntegerAttribute,
} from "../schemas/integerAttribute.js";
import {
  floatAttributeSchema,
  type FloatAttribute,
} from "../schemas/floatAttribute.js";
import {
  booleanAttributeSchema,
  type BooleanAttribute,
} from "../schemas/booleanAttribute.js";
import {
  datetimeAttributeSchema,
  type DatetimeAttribute,
} from "../schemas/datetimeAttribute.js";
import {
  emailAttributeSchema,
  type EmailAttribute,
} from "../schemas/emailAttribute.js";
import { ipAttributeSchema, type IpAttribute } from "../schemas/ipAttribute.js";
import {
  urlAttributeSchema,
  type UrlAttribute,
} from "../schemas/urlAttribute.js";
import {
  enumAttributeSchema,
  type EnumAttribute,
} from "../schemas/enumAttribute.js";
import {
  relationshipAttributeSchema,
  type RelationshipAttribute,
} from "../schemas/relationshipAttribute.js";

export const attributeSchema = z.discriminatedUnion("type", [
  stringAttributeSchema,
  integerAttributeSchema,
  floatAttributeSchema,
  booleanAttributeSchema,
  datetimeAttributeSchema,
  emailAttributeSchema,
  ipAttributeSchema,
  urlAttributeSchema,
  enumAttributeSchema,
  relationshipAttributeSchema,
]);

export type Attribute = z.infer<typeof attributeSchema>;

export const attributesSchema = z.array(attributeSchema);

export type Attributes = z.infer<typeof attributesSchema>;
