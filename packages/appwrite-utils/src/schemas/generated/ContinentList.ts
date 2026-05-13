// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const ContinentListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of continents that matched your query."
    },
    "continents": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "x-example": "Europe",
            "description": "Continent name."
          },
          "code": {
            "type": "string",
            "x-example": "EU",
            "description": "Continent two letter code."
          }
        },
        "required": [
          "name",
          "code"
        ],
        "additionalProperties": {},
        "example": {
          "name": "Europe",
          "code": "EU"
        },
        "description": "Continent"
      },
      "x-example": "",
      "description": "List of continents."
    }
  },
  "required": [
    "total",
    "continents"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "continents": ""
  },
  "description": "Continents List"
} as const;

export const ContinentListSchema = z.fromJSONSchema(ContinentListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type ContinentList = z.infer<typeof ContinentListSchema>;
