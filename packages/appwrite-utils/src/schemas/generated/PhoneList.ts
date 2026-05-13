// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const PhoneListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of phones that matched your query."
    },
    "phones": {
      "type": "array",
      "items": {
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
      },
      "x-example": "",
      "description": "List of phones."
    }
  },
  "required": [
    "total",
    "phones"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "phones": ""
  },
  "description": "Phones List"
} as const;

export const PhoneListSchema = z.fromJSONSchema(PhoneListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type PhoneList = z.infer<typeof PhoneListSchema>;
