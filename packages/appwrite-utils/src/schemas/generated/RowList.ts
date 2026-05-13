// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const RowListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of rows that matched your query."
    },
    "rows": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "$id": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "Row ID."
          },
          "$sequence": {
            "readOnly": true,
            "x-example": 1,
            "description": "Row automatically incrementing ID.",
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991
          },
          "$tableId": {
            "readOnly": true,
            "x-example": "5e5ea5c15117e",
            "description": "Table ID.",
            "type": "string"
          },
          "$databaseId": {
            "readOnly": true,
            "x-example": "5e5ea5c15117e",
            "description": "Database ID.",
            "type": "string"
          },
          "$createdAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Row creation date in ISO 8601 format."
          },
          "$updatedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Row update date in ISO 8601 format."
          },
          "$permissions": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "x-example": [
              "read(\"any\")"
            ],
            "description": "Row permissions. [Learn more about permissions](https://appwrite.io/docs/permissions)."
          }
        },
        "required": [
          "$id",
          "$sequence",
          "$tableId",
          "$databaseId",
          "$createdAt",
          "$updatedAt",
          "$permissions"
        ],
        "additionalProperties": {},
        "example": {
          "$id": "5e5ea5c16897e",
          "$sequence": 1,
          "$tableId": "5e5ea5c15117e",
          "$databaseId": "5e5ea5c15117e",
          "$createdAt": "2020-10-15T06:38:00.000+00:00",
          "$updatedAt": "2020-10-15T06:38:00.000+00:00",
          "$permissions": [
            "read(\"any\")"
          ]
        },
        "description": "Row"
      },
      "x-example": "",
      "description": "List of rows."
    }
  },
  "required": [
    "total",
    "rows"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "rows": ""
  },
  "description": "Rows List"
} as const;

export const RowListSchema = z.fromJSONSchema(RowListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type RowList = z.infer<typeof RowListSchema>;
