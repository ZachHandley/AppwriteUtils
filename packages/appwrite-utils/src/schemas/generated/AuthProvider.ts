// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const AuthProviderJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "key": {
      "type": "string",
      "x-example": "github",
      "description": "Auth Provider."
    },
    "name": {
      "type": "string",
      "x-example": "GitHub",
      "description": "Auth Provider name."
    },
    "appId": {
      "type": "string",
      "x-example": "259125845563242502",
      "description": "OAuth 2.0 application ID."
    },
    "secret": {
      "type": "string",
      "x-example": "Bpw_g9c2TGXxfgLshDbSaL8tsCcqgczQ",
      "description": "OAuth 2.0 application secret. Might be JSON string if provider requires extra configuration."
    },
    "enabled": {
      "type": "boolean",
      "x-example": "",
      "description": "Auth Provider is active and can be used to create session."
    }
  },
  "required": [
    "key",
    "name",
    "appId",
    "secret",
    "enabled"
  ],
  "additionalProperties": {},
  "example": {
    "key": "github",
    "name": "GitHub",
    "appId": "259125845563242502",
    "secret": "Bpw_g9c2TGXxfgLshDbSaL8tsCcqgczQ",
    "enabled": ""
  },
  "description": "AuthProvider"
} as const;

export const AuthProviderSchema = z.fromJSONSchema(AuthProviderJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type AuthProvider = z.infer<typeof AuthProviderSchema>;
