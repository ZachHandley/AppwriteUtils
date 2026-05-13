// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const MigrationReportJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "user": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 20,
      "description": "Number of users to be migrated."
    },
    "team": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 20,
      "description": "Number of teams to be migrated."
    },
    "database": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 20,
      "description": "Number of databases to be migrated."
    },
    "row": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 20,
      "description": "Number of rows to be migrated."
    },
    "file": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 20,
      "description": "Number of files to be migrated."
    },
    "bucket": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 20,
      "description": "Number of buckets to be migrated."
    },
    "function": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 20,
      "description": "Number of functions to be migrated."
    },
    "size": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 30000,
      "description": "Size of files to be migrated in mb."
    },
    "version": {
      "type": "string",
      "x-example": "1.4.0",
      "description": "Version of the Appwrite instance to be migrated."
    }
  },
  "required": [
    "user",
    "team",
    "database",
    "row",
    "file",
    "bucket",
    "function",
    "size",
    "version"
  ],
  "additionalProperties": {},
  "example": {
    "user": 20,
    "team": 20,
    "database": 20,
    "row": 20,
    "file": 20,
    "bucket": 20,
    "function": 20,
    "size": 30000,
    "version": "1.4.0"
  },
  "description": "Migration Report"
} as const;

export const MigrationReportSchema = z.fromJSONSchema(MigrationReportJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type MigrationReport = z.infer<typeof MigrationReportSchema>;
