// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const DatabaseJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "$id": {
      "type": "string",
      "x-example": "5e5ea5c16897e",
      "description": "Database ID."
    },
    "name": {
      "type": "string",
      "x-example": "My Database",
      "description": "Database name."
    },
    "$createdAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Database creation date in ISO 8601 format."
    },
    "$updatedAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Database update date in ISO 8601 format."
    },
    "enabled": {
      "type": "boolean",
      "x-example": false,
      "description": "If database is enabled. Can be 'enabled' or 'disabled'. When disabled, the database is inaccessible to users, but remains accessible to Server SDKs using API keys."
    },
    "type": {
      "type": "string",
      "enum": [
        "legacy",
        "tablesdb"
      ],
      "x-example": "legacy",
      "description": "Database type."
    }
  },
  "required": [
    "$id",
    "name",
    "$createdAt",
    "$updatedAt",
    "enabled",
    "type"
  ],
  "additionalProperties": {},
  "example": {
    "$id": "5e5ea5c16897e",
    "name": "My Database",
    "$createdAt": "2020-10-15T06:38:00.000+00:00",
    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
    "enabled": false,
    "type": "legacy"
  },
  "description": "Database"
} as const;

export const DatabaseSchema = z.fromJSONSchema(DatabaseJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Database = z.infer<typeof DatabaseSchema>;
