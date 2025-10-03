// Auto-generated JSON schema for ExampleTable
import type { JSONSchema7 } from "json-schema";

export const exampleTableJsonSchema: JSONSchema7 = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/schemas/exampleTable.json",
  "title": "ExampleTable",
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
    }
  },
  "required": [
    "$id",
    "$createdAt",
    "$updatedAt"
  ],
  "additionalProperties": false
} as const;

export type ExampleTableJsonSchema = typeof exampleTableJsonSchema;

export default exampleTableJsonSchema;
