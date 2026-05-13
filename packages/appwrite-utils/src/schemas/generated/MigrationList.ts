// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const MigrationListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of migrations that matched your query."
    },
    "migrations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "$id": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "Migration ID."
          },
          "$createdAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Migration creation date in ISO 8601 format."
          },
          "$updatedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Variable creation date in ISO 8601 format."
          },
          "status": {
            "type": "string",
            "x-example": "pending",
            "description": "Migration status ( pending, processing, failed, completed ) "
          },
          "stage": {
            "type": "string",
            "x-example": "init",
            "description": "Migration stage ( init, processing, source-check, destination-check, migrating, finished )"
          },
          "source": {
            "type": "string",
            "x-example": "Appwrite",
            "description": "A string containing the type of source of the migration."
          },
          "destination": {
            "type": "string",
            "x-example": "Appwrite",
            "description": "A string containing the type of destination of the migration."
          },
          "resources": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "x-example": [
              "user"
            ],
            "description": "Resources to migrate."
          },
          "resourceId": {
            "type": "string",
            "x-example": "databaseId:collectionId",
            "description": "Id of the resource to migrate."
          },
          "statusCounters": {
            "type": "object",
            "properties": {},
            "additionalProperties": {},
            "x-example": "{\"Database\": {\"PENDING\": 0, \"SUCCESS\": 1, \"ERROR\": 0, \"SKIP\": 0, \"PROCESSING\": 0, \"WARNING\": 0}}",
            "description": "A group of counters that represent the total progress of the migration."
          },
          "resourceData": {
            "type": "object",
            "properties": {},
            "additionalProperties": {},
            "x-example": "[{\"resource\":\"Database\",\"id\":\"public\",\"status\":\"SUCCESS\",\"message\":\"\"}]",
            "description": "An array of objects containing the report data of the resources that were migrated."
          },
          "errors": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "x-example": [],
            "description": "All errors that occurred during the migration process."
          },
          "options": {
            "type": "object",
            "properties": {},
            "additionalProperties": {},
            "x-example": "{\"bucketId\": \"exports\", \"notify\": false}",
            "description": "Migration options used during the migration process."
          }
        },
        "required": [
          "$id",
          "$createdAt",
          "$updatedAt",
          "status",
          "stage",
          "source",
          "destination",
          "resources",
          "resourceId",
          "statusCounters",
          "resourceData",
          "errors",
          "options"
        ],
        "additionalProperties": {},
        "example": {
          "$id": "5e5ea5c16897e",
          "$createdAt": "2020-10-15T06:38:00.000+00:00",
          "$updatedAt": "2020-10-15T06:38:00.000+00:00",
          "status": "pending",
          "stage": "init",
          "source": "Appwrite",
          "destination": "Appwrite",
          "resources": [
            "user"
          ],
          "resourceId": "databaseId:collectionId",
          "statusCounters": "{\"Database\": {\"PENDING\": 0, \"SUCCESS\": 1, \"ERROR\": 0, \"SKIP\": 0, \"PROCESSING\": 0, \"WARNING\": 0}}",
          "resourceData": "[{\"resource\":\"Database\",\"id\":\"public\",\"status\":\"SUCCESS\",\"message\":\"\"}]",
          "errors": [],
          "options": "{\"bucketId\": \"exports\", \"notify\": false}"
        },
        "description": "Migration"
      },
      "x-example": "",
      "description": "List of migrations."
    }
  },
  "required": [
    "total",
    "migrations"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "migrations": ""
  },
  "description": "Migrations List"
} as const;

export const MigrationListSchema = z.fromJSONSchema(MigrationListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type MigrationList = z.infer<typeof MigrationListSchema>;
