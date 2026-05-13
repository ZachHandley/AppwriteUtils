// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const LanguageListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of languages that matched your query."
    },
    "languages": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "x-example": "Italian",
            "description": "Language name."
          },
          "code": {
            "type": "string",
            "x-example": "it",
            "description": "Language two-character ISO 639-1 codes."
          },
          "nativeName": {
            "type": "string",
            "x-example": "Italiano",
            "description": "Language native name."
          }
        },
        "required": [
          "name",
          "code",
          "nativeName"
        ],
        "additionalProperties": {},
        "example": {
          "name": "Italian",
          "code": "it",
          "nativeName": "Italiano"
        },
        "description": "Language"
      },
      "x-example": "",
      "description": "List of languages."
    }
  },
  "required": [
    "total",
    "languages"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "languages": ""
  },
  "description": "Languages List"
} as const;

export const LanguageListSchema = z.fromJSONSchema(LanguageListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type LanguageList = z.infer<typeof LanguageListSchema>;
