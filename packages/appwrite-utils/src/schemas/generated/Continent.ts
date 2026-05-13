// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const ContinentJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
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
} as const;

export const ContinentSchema = z.fromJSONSchema(ContinentJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Continent = z.infer<typeof ContinentSchema>;
