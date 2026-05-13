// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const ColumnIndexJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "$id": {
      "type": "string",
      "x-example": "5e5ea5c16897e",
      "description": "Index ID."
    },
    "$createdAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Index creation date in ISO 8601 format."
    },
    "$updatedAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Index update date in ISO 8601 format."
    },
    "key": {
      "type": "string",
      "x-example": "index1",
      "description": "Index Key."
    },
    "type": {
      "type": "string",
      "x-example": "primary",
      "description": "Index type."
    },
    "status": {
      "type": "string",
      "x-example": "available",
      "description": "Index status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
    },
    "error": {
      "type": "string",
      "x-example": "string",
      "description": "Error message. Displays error generated on failure of creating or deleting an index."
    },
    "columns": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "x-example": [],
      "description": "Index columns."
    },
    "lengths": {
      "type": "array",
      "items": {
        "type": "integer",
        "minimum": -9007199254740991,
        "maximum": 9007199254740991
      },
      "x-example": [],
      "description": "Index columns length."
    },
    "orders": {
      "anyOf": [
        {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        {
          "type": "null"
        }
      ],
      "x-example": [],
      "description": "Index orders."
    }
  },
  "required": [
    "$id",
    "$createdAt",
    "$updatedAt",
    "key",
    "type",
    "status",
    "error",
    "columns",
    "lengths"
  ],
  "additionalProperties": {},
  "example": {
    "$id": "5e5ea5c16897e",
    "$createdAt": "2020-10-15T06:38:00.000+00:00",
    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
    "key": "index1",
    "type": "primary",
    "status": "available",
    "error": "string",
    "columns": [],
    "lengths": [],
    "orders": []
  },
  "description": "Index"
} as const;

export const ColumnIndexSchema = z.fromJSONSchema(ColumnIndexJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type ColumnIndex = z.infer<typeof ColumnIndexSchema>;
