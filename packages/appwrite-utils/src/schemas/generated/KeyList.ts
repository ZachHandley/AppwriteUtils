// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const KeyListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of keys that matched your query."
    },
    "keys": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "$id": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "Key ID."
          },
          "$createdAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Key creation date in ISO 8601 format."
          },
          "$updatedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Key update date in ISO 8601 format."
          },
          "name": {
            "type": "string",
            "x-example": "My API Key",
            "description": "Key name."
          },
          "expire": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Key expiration date in ISO 8601 format."
          },
          "scopes": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "x-example": "users.read",
            "description": "Allowed permission scopes."
          },
          "secret": {
            "type": "string",
            "x-example": "919c2d18fb5d4...a2ae413da83346ad2",
            "description": "Secret key."
          },
          "accessedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Most recent access date in ISO 8601 format. This attribute is only updated again after 24 hours."
          },
          "sdks": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "x-example": "appwrite:flutter",
            "description": "List of SDK user agents that used this key."
          }
        },
        "required": [
          "$id",
          "$createdAt",
          "$updatedAt",
          "name",
          "expire",
          "scopes",
          "secret",
          "accessedAt",
          "sdks"
        ],
        "additionalProperties": {},
        "example": {
          "$id": "5e5ea5c16897e",
          "$createdAt": "2020-10-15T06:38:00.000+00:00",
          "$updatedAt": "2020-10-15T06:38:00.000+00:00",
          "name": "My API Key",
          "expire": "2020-10-15T06:38:00.000+00:00",
          "scopes": "users.read",
          "secret": "919c2d18fb5d4...a2ae413da83346ad2",
          "accessedAt": "2020-10-15T06:38:00.000+00:00",
          "sdks": "appwrite:flutter"
        },
        "description": "Key"
      },
      "x-example": "",
      "description": "List of keys."
    }
  },
  "required": [
    "total",
    "keys"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "keys": ""
  },
  "description": "API Keys List"
} as const;

export const KeyListSchema = z.fromJSONSchema(KeyListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type KeyList = z.infer<typeof KeyListSchema>;
