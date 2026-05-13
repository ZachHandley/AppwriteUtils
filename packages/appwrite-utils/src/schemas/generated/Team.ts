// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const TeamJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "$id": {
      "type": "string",
      "x-example": "5e5ea5c16897e",
      "description": "Team ID."
    },
    "$createdAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Team creation date in ISO 8601 format."
    },
    "$updatedAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Team update date in ISO 8601 format."
    },
    "name": {
      "type": "string",
      "x-example": "VIP",
      "description": "Team name."
    },
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 7,
      "description": "Total number of team members."
    },
    "prefs": {
      "type": "object",
      "properties": {},
      "additionalProperties": {},
      "x-example": {
        "theme": "pink",
        "timezone": "UTC"
      },
      "description": "Team preferences as a key-value object"
    }
  },
  "required": [
    "$id",
    "$createdAt",
    "$updatedAt",
    "name",
    "total",
    "prefs"
  ],
  "additionalProperties": {},
  "example": {
    "$id": "5e5ea5c16897e",
    "$createdAt": "2020-10-15T06:38:00.000+00:00",
    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
    "name": "VIP",
    "total": 7,
    "prefs": {
      "theme": "pink",
      "timezone": "UTC"
    }
  },
  "description": "Team"
} as const;

export const TeamSchema = z.fromJSONSchema(TeamJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Team = z.infer<typeof TeamSchema>;
