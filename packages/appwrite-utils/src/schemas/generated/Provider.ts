// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const ProviderJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "$id": {
      "type": "string",
      "x-example": "5e5ea5c16897e",
      "description": "Provider ID."
    },
    "$createdAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Provider creation time in ISO 8601 format."
    },
    "$updatedAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Provider update date in ISO 8601 format."
    },
    "name": {
      "type": "string",
      "x-example": "Mailgun",
      "description": "The name for the provider instance."
    },
    "provider": {
      "type": "string",
      "x-example": "mailgun",
      "description": "The name of the provider service."
    },
    "enabled": {
      "type": "boolean",
      "x-example": true,
      "description": "Is provider enabled?"
    },
    "type": {
      "type": "string",
      "x-example": "sms",
      "description": "Type of provider."
    },
    "credentials": {
      "type": "object",
      "properties": {},
      "additionalProperties": {},
      "x-example": {
        "key": "123456789"
      },
      "description": "Provider credentials."
    },
    "options": {
      "anyOf": [
        {
          "type": "object",
          "properties": {},
          "additionalProperties": {}
        },
        {
          "type": "null"
        }
      ],
      "x-example": {
        "from": "sender-email@mydomain"
      },
      "description": "Provider options."
    }
  },
  "required": [
    "$id",
    "$createdAt",
    "$updatedAt",
    "name",
    "provider",
    "enabled",
    "type",
    "credentials"
  ],
  "additionalProperties": {},
  "example": {
    "$id": "5e5ea5c16897e",
    "$createdAt": "2020-10-15T06:38:00.000+00:00",
    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
    "name": "Mailgun",
    "provider": "mailgun",
    "enabled": true,
    "type": "sms",
    "credentials": {
      "key": "123456789"
    },
    "options": {
      "from": "sender-email@mydomain"
    }
  },
  "description": "Provider"
} as const;

export const ProviderSchema = z.fromJSONSchema(ProviderJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Provider = z.infer<typeof ProviderSchema>;
