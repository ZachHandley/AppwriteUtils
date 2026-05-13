// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const ColumnLineJsonSchema = {
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
    "default": {
      "anyOf": [
        {
          "type": "array",
          "items": {}
        },
        {
          "type": "null"
        }
      ],
      "x-example": [
        [
          0,
          0
        ],
        [
          1,
          1
        ]
      ],
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
    "$updatedAt"
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
    "default": [
      [
        0,
        0
      ],
      [
        1,
        1
      ]
    ]
  },
  "description": "ColumnLine"
} as const;

export const ColumnLineSchema = z.fromJSONSchema(ColumnLineJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type ColumnLine = z.infer<typeof ColumnLineSchema>;
