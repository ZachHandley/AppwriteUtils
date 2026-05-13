// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const LocaleCodeListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of localeCodes that matched your query."
    },
    "localeCodes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "code": {
            "type": "string",
            "x-example": "en-us",
            "description": "Locale codes in [ISO 639-1](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes)"
          },
          "name": {
            "type": "string",
            "x-example": "US",
            "description": "Locale name"
          }
        },
        "required": [
          "code",
          "name"
        ],
        "additionalProperties": {},
        "example": {
          "code": "en-us",
          "name": "US"
        },
        "description": "LocaleCode"
      },
      "x-example": "",
      "description": "List of localeCodes."
    }
  },
  "required": [
    "total",
    "localeCodes"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "localeCodes": ""
  },
  "description": "Locale codes list"
} as const;

export const LocaleCodeListSchema = z.fromJSONSchema(LocaleCodeListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type LocaleCodeList = z.infer<typeof LocaleCodeListSchema>;
