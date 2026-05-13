// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const LanguageJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
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
} as const;

export const LanguageSchema = z.fromJSONSchema(LanguageJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Language = z.infer<typeof LanguageSchema>;
