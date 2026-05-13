// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const DetectionVariableJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "x-example": "NODE_ENV",
      "description": "Name of environment variable"
    },
    "value": {
      "type": "string",
      "x-example": "production",
      "description": "Value of environment variable"
    }
  },
  "required": [
    "name",
    "value"
  ],
  "additionalProperties": {},
  "example": {
    "name": "NODE_ENV",
    "value": "production"
  },
  "description": "DetectionVariable"
} as const;

export const DetectionVariableSchema = z.fromJSONSchema(DetectionVariableJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type DetectionVariable = z.infer<typeof DetectionVariableSchema>;
