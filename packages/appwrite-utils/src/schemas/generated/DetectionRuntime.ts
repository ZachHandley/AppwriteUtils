// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const DetectionRuntimeJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "variables": {
      "anyOf": [
        {
          "type": "array",
          "items": {
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
          }
        },
        {
          "type": "null"
        }
      ],
      "x-example": {},
      "description": "Environment variables found in .env files"
    },
    "runtime": {
      "type": "string",
      "x-example": "node",
      "description": "Runtime"
    },
    "entrypoint": {
      "type": "string",
      "x-example": "index.js",
      "description": "Function Entrypoint"
    },
    "commands": {
      "type": "string",
      "x-example": "npm install && npm run build",
      "description": "Function install and build commands"
    }
  },
  "required": [
    "runtime",
    "entrypoint",
    "commands"
  ],
  "additionalProperties": {},
  "example": {
    "variables": {},
    "runtime": "node",
    "entrypoint": "index.js",
    "commands": "npm install && npm run build"
  },
  "description": "DetectionRuntime"
} as const;

export const DetectionRuntimeSchema = z.fromJSONSchema(DetectionRuntimeJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type DetectionRuntime = z.infer<typeof DetectionRuntimeSchema>;
