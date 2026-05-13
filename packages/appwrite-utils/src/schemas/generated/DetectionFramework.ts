// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const DetectionFrameworkJsonSchema = {
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
    "framework": {
      "type": "string",
      "x-example": "nuxt",
      "description": "Framework"
    },
    "installCommand": {
      "type": "string",
      "x-example": "npm install",
      "description": "Site Install Command"
    },
    "buildCommand": {
      "type": "string",
      "x-example": "npm run build",
      "description": "Site Build Command"
    },
    "outputDirectory": {
      "type": "string",
      "x-example": "dist",
      "description": "Site Output Directory"
    }
  },
  "required": [
    "framework",
    "installCommand",
    "buildCommand",
    "outputDirectory"
  ],
  "additionalProperties": {},
  "example": {
    "variables": {},
    "framework": "nuxt",
    "installCommand": "npm install",
    "buildCommand": "npm run build",
    "outputDirectory": "dist"
  },
  "description": "DetectionFramework"
} as const;

export const DetectionFrameworkSchema = z.fromJSONSchema(DetectionFrameworkJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type DetectionFramework = z.infer<typeof DetectionFrameworkSchema>;
