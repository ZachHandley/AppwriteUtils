// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const CountryJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
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
} as const;

export const CountrySchema = z.fromJSONSchema(CountryJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Country = z.infer<typeof CountrySchema>;
