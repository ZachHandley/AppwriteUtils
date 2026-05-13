// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const ColumnUrlJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "key": {
      "type": "string",
      "x-example": "githubUrl",
      "description": "Column Key."
    },
    "type": {
      "type": "string",
      "x-example": "string",
      "description": "Column type."
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
      "x-enum-name": "ColumnStatus",
      "description": "Column status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
    },
    "error": {
      "type": "string",
      "x-example": "string",
      "description": "Error message. Displays error generated on failure of creating or deleting an column."
    },
    "required": {
      "type": "boolean",
      "x-example": true,
      "description": "Is column required?"
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
      "description": "Is column an array?"
    },
    "$createdAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Column creation date in ISO 8601 format."
    },
    "$updatedAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Column update date in ISO 8601 format."
    },
    "format": {
      "type": "string",
      "x-example": "url",
      "description": "String format."
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
      "x-example": "https://example.com",
      "description": "Default value for column when not provided. Cannot be set when column is required."
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
    "key": "githubUrl",
    "type": "string",
    "status": "available",
    "error": "string",
    "required": true,
    "array": false,
    "$createdAt": "2020-10-15T06:38:00.000+00:00",
    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
    "format": "url",
    "default": "https://example.com"
  },
  "description": "ColumnURL"
} as const;

export const ColumnUrlSchema = z.fromJSONSchema(ColumnUrlJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type ColumnUrl = z.infer<typeof ColumnUrlSchema>;
