import { z } from "zod";
import {
  stringAttributeSchema,
  type StringAttribute,
} from "../schemas/stringAttribute";
import {
  integerAttributeSchema,
  type IntegerAttribute,
} from "../schemas/integerAttribute";
import {
  floatAttributeSchema,
  type FloatAttribute,
} from "../schemas/floatAttribute";
import {
  booleanAttributeSchema,
  type BooleanAttribute,
} from "../schemas/booleanAttribute";
import {
  datetimeAttributeSchema,
  type DatetimeAttribute,
} from "../schemas/datetimeAttribute";
import {
  emailAttributeSchema,
  type EmailAttribute,
} from "../schemas/emailAttribute";
import { ipAttributeSchema, type IpAttribute } from "../schemas/ipAttribute";
import { urlAttributeSchema, type UrlAttribute } from "../schemas/urlAttribute";
import {
  enumAttributeSchema,
  type EnumAttribute,
} from "../schemas/enumAttribute";
import {
  relationshipAttributeSchema,
  type RelationshipAttribute,
} from "../schemas/relationshipAttribute";

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
