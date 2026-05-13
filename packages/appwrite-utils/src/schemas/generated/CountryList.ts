// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const CountryListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of countries that matched your query."
    },
    "countries": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "x-example": "United States",
            "description": "Country name."
          },
          "code": {
            "type": "string",
            "x-example": "US",
            "description": "Country two-character ISO 3166-1 alpha code."
          }
        },
        "required": [
          "name",
          "code"
        ],
        "additionalProperties": {},
        "example": {
          "name": "United States",
          "code": "US"
        },
        "description": "Country"
      },
      "x-example": "",
      "description": "List of countries."
    }
  },
  "required": [
    "total",
    "countries"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "countries": ""
  },
  "description": "Countries List"
} as const;

export const CountryListSchema = z.fromJSONSchema(CountryListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type CountryList = z.infer<typeof CountryListSchema>;
