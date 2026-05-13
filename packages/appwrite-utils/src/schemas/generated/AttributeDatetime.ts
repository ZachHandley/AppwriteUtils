// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const AttributeDatetimeJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "key": {
      "type": "string",
      "x-example": "birthDay",
      "description": "Attribute Key."
    },
    "type": {
      "type": "string",
      "x-example": "datetime",
      "description": "Attribute type."
    },
    "status": {
      "type": "string",
      "enum": [
        "available",
        "processing",
        "deleting",
        "stuck",
        "failed"
      ],
      "x-example": "available",
      "x-enum-name": "AttributeStatus",
      "description": "Attribute status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
    },
    "error": {
      "type": "string",
      "x-example": "string",
      "description": "Error message. Displays error generated on failure of creating or deleting an attribute."
    },
    "required": {
      "type": "boolean",
      "x-example": true,
      "description": "Is attribute required?"
    },
    "array": {
      "anyOf": [
        {
          "type": "boolean"
        },
        {
          "type": "null"
        }
      ],
      "x-example": false,
      "description": "Is attribute an array?"
    },
    "$createdAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Attribute creation date in ISO 8601 format."
    },
    "$updatedAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Attribute update date in ISO 8601 format."
    },
    "format": {
      "type": "string",
      "x-example": "datetime",
      "description": "ISO 8601 format."
    },
    "default": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Default value for attribute when not provided. Only null is optional"
    }
  },
  "required": [
    "key",
    "type",
    "status",
    "error",
    "required",
    "$createdAt",
    "$updatedAt",
    "format"
  ],
  "additionalProperties": {},
  "example": {
    "key": "birthDay",
    "type": "datetime",
    "status": "available",
    "error": "string",
    "required": true,
    "array": false,
    "$createdAt": "2020-10-15T06:38:00.000+00:00",
    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
    "format": "datetime",
    "default": "2020-10-15T06:38:00.000+00:00"
  },
  "description": "AttributeDatetime"
} as const;

export const AttributeDatetimeSchema = z.fromJSONSchema(AttributeDatetimeJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type AttributeDatetime = z.infer<typeof AttributeDatetimeSchema>;
