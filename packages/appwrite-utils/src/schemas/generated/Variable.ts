// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const VariableJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "$id": {
      "type": "string",
      "x-example": "5e5ea5c16897e",
      "description": "Variable ID."
    },
    "$createdAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Variable creation date in ISO 8601 format."
    },
    "$updatedAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Variable creation date in ISO 8601 format."
    },
    "key": {
      "type": "string",
      "x-example": "API_KEY",
      "description": "Variable key."
    },
    "value": {
      "type": "string",
      "x-example": "myPa$$word1",
      "description": "Variable value."
    },
    "secret": {
      "type": "boolean",
      "x-example": false,
      "description": "Variable secret flag. Secret variables can only be updated or deleted, but never read."
    },
    "resourceType": {
      "type": "string",
      "x-example": "function",
      "description": "Service to which the variable belongs. Possible values are \"project\", \"function\""
    },
    "resourceId": {
      "type": "string",
      "x-example": "myAwesomeFunction",
      "description": "ID of resource to which the variable belongs. If resourceType is \"project\", it is empty. If resourceType is \"function\", it is ID of the function."
    }
  },
  "required": [
    "$id",
    "$createdAt",
    "$updatedAt",
    "key",
    "value",
    "secret",
    "resourceType",
    "resourceId"
  ],
  "additionalProperties": {},
  "example": {
    "$id": "5e5ea5c16897e",
    "$createdAt": "2020-10-15T06:38:00.000+00:00",
    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
    "key": "API_KEY",
    "value": "myPa$$word1",
    "secret": false,
    "resourceType": "function",
    "resourceId": "myAwesomeFunction"
  },
  "description": "Variable"
} as const;

export const VariableSchema = z.fromJSONSchema(VariableJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Variable = z.infer<typeof VariableSchema>;
