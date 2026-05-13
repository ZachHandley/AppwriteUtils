// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const ColumnRelationshipJsonSchema = {
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
    "relatedTable": {
      "type": "string",
      "x-example": "table",
      "description": "The ID of the related table."
    },
    "relationType": {
      "type": "string",
      "x-example": "oneToOne|oneToMany|manyToOne|manyToMany",
      "description": "The type of the relationship."
    },
    "twoWay": {
      "type": "boolean",
      "x-example": false,
      "description": "Is the relationship two-way?"
    },
    "twoWayKey": {
      "type": "string",
      "x-example": "string",
      "description": "The key of the two-way relationship."
    },
    "onDelete": {
      "type": "string",
      "x-example": "restrict|cascade|setNull",
      "description": "How deleting the parent document will propagate to child documents."
    },
    "side": {
      "type": "string",
      "x-example": "parent|child",
      "description": "Whether this is the parent or child side of the relationship"
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
    "relatedTable",
    "relationType",
    "twoWay",
    "twoWayKey",
    "onDelete",
    "side"
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
    "relatedTable": "table",
    "relationType": "oneToOne|oneToMany|manyToOne|manyToMany",
    "twoWay": false,
    "twoWayKey": "string",
    "onDelete": "restrict|cascade|setNull",
    "side": "parent|child"
  },
  "description": "ColumnRelationship"
} as const;

export const ColumnRelationshipSchema = z.fromJSONSchema(ColumnRelationshipJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type ColumnRelationship = z.infer<typeof ColumnRelationshipSchema>;
