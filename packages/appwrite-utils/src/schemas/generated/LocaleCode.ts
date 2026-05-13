// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const LocaleCodeJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
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
} as const;

export const LocaleCodeSchema = z.fromJSONSchema(LocaleCodeJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type LocaleCode = z.infer<typeof LocaleCodeSchema>;
