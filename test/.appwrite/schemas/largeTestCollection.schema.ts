// Auto-generated JSON schema for LargeTestCollection
import type { JSONSchema7 } from "json-schema";

export const largeTestCollectionJsonSchema: JSONSchema7 = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/schemas/largeTestCollection.json",
  "title": "LargeTestCollection",
  "type": "object",
  "properties": {
    "$id": {
      "type": "string",
      "pattern": "^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$"
    },
    "$createdAt": {
      "type": "string",
      "format": "date-time"
    },
    "$updatedAt": {
      "type": "string",
      "format": "date-time"
    },
    "$permissions": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "title": {
      "type": "string",
      "maxLength": 255
    },
    "content": {
      "type": "string",
      "maxLength": 10000
    },
    "category": {
      "type": "string",
      "maxLength": 100
    },
    "tags": {
      "type": "string",
      "maxLength": 1000
    },
    "isPublished": {
      "type": "boolean",
      "default": false
    },
    "publishedAt": {
      "type": "string",
      "format": "date-time"
    },
    "viewCount": {
      "type": "integer",
      "default": 0
    },
    "rating": {
      "type": "number"
    }
  },
  "required": [
    "$id",
    "$createdAt",
    "$updatedAt",
    "title",
    "category"
  ],
  "additionalProperties": false
} as const;

export type LargeTestCollectionJsonSchema = typeof largeTestCollectionJsonSchema;

export default largeTestCollectionJsonSchema;
