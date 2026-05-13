// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const DevKeyListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of devKeys that matched your query."
    },
    "devKeys": {
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
            "x-example": "Dev API Key",
            "description": "Key name."
          },
          "expire": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Key expiration date in ISO 8601 format."
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
          "secret",
          "accessedAt",
          "sdks"
        ],
        "additionalProperties": {},
        "example": {
          "$id": "5e5ea5c16897e",
          "$createdAt": "2020-10-15T06:38:00.000+00:00",
          "$updatedAt": "2020-10-15T06:38:00.000+00:00",
          "name": "Dev API Key",
          "expire": "2020-10-15T06:38:00.000+00:00",
          "secret": "919c2d18fb5d4...a2ae413da83346ad2",
          "accessedAt": "2020-10-15T06:38:00.000+00:00",
          "sdks": "appwrite:flutter"
        },
        "description": "DevKey"
      },
      "x-example": "",
      "description": "List of devKeys."
    }
  },
  "required": [
    "total",
    "devKeys"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "devKeys": ""
  },
  "description": "Dev Keys List"
} as const;

export const DevKeyListSchema = z.fromJSONSchema(DevKeyListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type DevKeyList = z.infer<typeof DevKeyListSchema>;
