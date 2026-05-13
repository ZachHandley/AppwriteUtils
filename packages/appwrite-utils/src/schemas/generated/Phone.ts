// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const PhoneJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "code": {
      "type": "string",
      "x-example": "+1",
      "description": "Phone code."
    },
    "countryCode": {
      "type": "string",
      "x-example": "US",
      "description": "Country two-character ISO 3166-1 alpha code."
    },
    "countryName": {
      "type": "string",
      "x-example": "United States",
      "description": "Country name."
    }
  },
  "required": [
    "code",
    "countryCode",
    "countryName"
  ],
  "additionalProperties": {},
  "example": {
    "code": "+1",
    "countryCode": "US",
    "countryName": "United States"
  },
  "description": "Phone"
} as const;

export const PhoneSchema = z.fromJSONSchema(PhoneJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Phone = z.infer<typeof PhoneSchema>;
