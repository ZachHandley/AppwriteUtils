// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const PreferencesJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {},
  "additionalProperties": {},
  "example": {
    "language": "en",
    "timezone": "UTC",
    "darkTheme": true
  },
  "description": "Preferences"
} as const;

export const PreferencesSchema = z.fromJSONSchema(PreferencesJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Preferences = z.infer<typeof PreferencesSchema>;
