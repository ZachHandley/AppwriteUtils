// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const DocumentListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of documents that matched your query."
    },
    "documents": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "$id": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "Document ID."
          },
          "$sequence": {
            "readOnly": true,
            "x-example": 1,
            "description": "Document automatically incrementing ID.",
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991
          },
          "$collectionId": {
            "readOnly": true,
            "x-example": "5e5ea5c15117e",
            "description": "Collection ID.",
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
            "description": "Document creation date in ISO 8601 format."
          },
          "$updatedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Document update date in ISO 8601 format."
          },
          "$permissions": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "x-example": [
              "read(\"any\")"
            ],
            "description": "Document permissions. [Learn more about permissions](https://appwrite.io/docs/permissions)."
          }
        },
        "required": [
          "$id",
          "$sequence",
          "$collectionId",
          "$databaseId",
          "$createdAt",
          "$updatedAt",
          "$permissions"
        ],
        "additionalProperties": {},
        "example": {
          "$id": "5e5ea5c16897e",
          "$sequence": 1,
          "$collectionId": "5e5ea5c15117e",
          "$databaseId": "5e5ea5c15117e",
          "$createdAt": "2020-10-15T06:38:00.000+00:00",
          "$updatedAt": "2020-10-15T06:38:00.000+00:00",
          "$permissions": [
            "read(\"any\")"
          ],
          "username": "john.doe",
          "email": "john.doe@example.com",
          "fullName": "John Doe",
          "age": 30,
          "isAdmin": false
        },
        "description": "Document"
      },
      "x-example": "",
      "description": "List of documents."
    }
  },
  "required": [
    "total",
    "documents"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "documents": ""
  },
  "description": "Documents List"
} as const;

export const DocumentListSchema = z.fromJSONSchema(DocumentListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type DocumentList = z.infer<typeof DocumentListSchema>;
