// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const AttributeFloatJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "key": {
      "type": "string",
      "x-example": "percentageCompleted",
      "description": "Attribute Key."
    },
    "type": {
      "type": "string",
      "x-example": "double",
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
    "min": {
      "anyOf": [
        {
          "type": "number"
        },
        {
          "type": "null"
        }
      ],
      "x-example": 1.5,
      "description": "Minimum value to enforce for new documents."
    },
    "max": {
      "anyOf": [
        {
          "type": "number"
        },
        {
          "type": "null"
        }
      ],
      "x-example": 10.5,
      "description": "Maximum value to enforce for new documents."
    },
    "default": {
      "anyOf": [
        {
          "type": "number"
        },
        {
          "type": "null"
        }
      ],
      "x-example": 2.5,
      "description": "Default value for attribute when not provided. Cannot be set when attribute is required."
    }
  },
  "required": [
    "key",
    "type",
    "status",
    "error",
    "required",
    "$createdAt",
    "$updatedAt"
  ],
  "additionalProperties": {},
  "example": {
    "key": "percentageCompleted",
    "type": "double",
    "status": "available",
    "error": "string",
    "required": true,
    "array": false,
    "$createdAt": "2020-10-15T06:38:00.000+00:00",
    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
    "min": 1.5,
    "max": 10.5,
    "default": 2.5
  },
  "description": "AttributeFloat"
} as const;

export const AttributeFloatSchema = z.fromJSONSchema(AttributeFloatJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type AttributeFloat = z.infer<typeof AttributeFloatSchema>;
