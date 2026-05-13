// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const MfaTypeJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "secret": {
      "type": "string",
      "x-example": true,
      "description": "Secret token used for TOTP factor."
    },
    "uri": {
      "type": "string",
      "x-example": true,
      "description": "URI for authenticator apps."
    }
  },
  "required": [
    "secret",
    "uri"
  ],
  "additionalProperties": {},
  "example": {
    "secret": true,
    "uri": true
  },
  "description": "MFAType"
} as const;

export const MfaTypeSchema = z.fromJSONSchema(MfaTypeJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type MfaType = z.infer<typeof MfaTypeSchema>;
