// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const ColumnStringJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "key": {
      "type": "string",
      "x-example": "fullName",
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
    "size": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 128,
      "description": "Column size."
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
      "x-example": "default",
      "description": "Default value for column when not provided. Cannot be set when column is required."
    },
    "encrypt": {
      "anyOf": [
        {
          "type": "boolean"
        },
        {
          "type": "null"
        }
      ],
      "x-example": false,
      "description": "Defines whether this column is encrypted or not."
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
    "size"
  ],
  "additionalProperties": {},
  "example": {
    "key": "fullName",
    "type": "string",
    "status": "available",
    "error": "string",
    "required": true,
    "array": false,
    "$createdAt": "2020-10-15T06:38:00.000+00:00",
    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
    "size": 128,
    "default": "default",
    "encrypt": false
  },
  "description": "ColumnString"
} as const;

export const ColumnStringSchema = z.fromJSONSchema(ColumnStringJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type ColumnString = z.infer<typeof ColumnStringSchema>;
