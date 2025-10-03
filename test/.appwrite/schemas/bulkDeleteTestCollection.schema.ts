// Auto-generated JSON schema for BulkDeleteTestCollection
import type { JSONSchema7 } from "json-schema";

export const bulkDeleteTestCollectionJsonSchema: JSONSchema7 = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/schemas/bulkDeleteTestCollection.json",
  "title": "BulkDeleteTestCollection",
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
    "batchId": {
      "type": "string",
      "maxLength": 50
    },
    "recordNumber": {
      "type": "integer"
    },
    "testData": {
      "type": "string",
      "maxLength": 500
    },
    "createdBatch": {
      "type": "string",
      "format": "date-time"
    }
  },
  "required": [
    "$id",
    "$createdAt",
    "$updatedAt",
    "batchId",
    "recordNumber",
    "createdBatch"
  ],
  "additionalProperties": false
} as const;

export type BulkDeleteTestCollectionJsonSchema = typeof bulkDeleteTestCollectionJsonSchema;

export default bulkDeleteTestCollectionJsonSchema;
