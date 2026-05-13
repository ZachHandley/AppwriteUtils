// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const TemplateVariableJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "x-example": "APPWRITE_DATABASE_ID",
      "description": "Variable Name."
    },
    "description": {
      "type": "string",
      "x-example": "The ID of the Appwrite database that contains the collection to sync.",
      "description": "Variable Description."
    },
    "value": {
      "type": "string",
      "x-example": "512",
      "description": "Variable Value."
    },
    "secret": {
      "type": "boolean",
      "x-example": false,
      "description": "Variable secret flag. Secret variables can only be updated or deleted, but never read."
    },
    "placeholder": {
      "type": "string",
      "x-example": "64a55...7b912",
      "description": "Variable Placeholder."
    },
    "required": {
      "type": "boolean",
      "x-example": false,
      "description": "Is the variable required?"
    },
    "type": {
      "type": "string",
      "x-example": "password",
      "description": "Variable Type."
    }
  },
  "required": [
    "name",
    "description",
    "value",
    "secret",
    "placeholder",
    "required",
    "type"
  ],
  "additionalProperties": {},
  "example": {
    "name": "APPWRITE_DATABASE_ID",
    "description": "The ID of the Appwrite database that contains the collection to sync.",
    "value": "512",
    "secret": false,
    "placeholder": "64a55...7b912",
    "required": false,
    "type": "password"
  },
  "description": "Template Variable"
} as const;

export const TemplateVariableSchema = z.fromJSONSchema(TemplateVariableJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type TemplateVariable = z.infer<typeof TemplateVariableSchema>;
