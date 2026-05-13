// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const VariableListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of variables that matched your query."
    },
    "variables": {
      "type": "array",
      "items": {
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
      },
      "x-example": "",
      "description": "List of variables."
    }
  },
  "required": [
    "total",
    "variables"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "variables": ""
  },
  "description": "Variables List"
} as const;

export const VariableListSchema = z.fromJSONSchema(VariableListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type VariableList = z.infer<typeof VariableListSchema>;
