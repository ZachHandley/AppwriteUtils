// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const FrameworkListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of frameworks that matched your query."
    },
    "frameworks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "key": {
            "type": "string",
            "x-example": "sveltekit",
            "description": "Framework key."
          },
          "name": {
            "type": "string",
            "x-example": "SvelteKit",
            "description": "Framework Name."
          },
          "buildRuntime": {
            "type": "string",
            "x-example": "node-22",
            "description": "Default runtime version."
          },
          "runtimes": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "x-example": [
              "static-1",
              "node-22"
            ],
            "description": "List of supported runtime versions."
          },
          "adapters": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "key": {
                  "type": "string",
                  "x-example": "static",
                  "description": "Adapter key."
                },
                "installCommand": {
                  "type": "string",
                  "x-example": "npm install",
                  "description": "Default command to download dependencies."
                },
                "buildCommand": {
                  "type": "string",
                  "x-example": "npm run build",
                  "description": "Default command to build site into output directory."
                },
                "outputDirectory": {
                  "type": "string",
                  "x-example": "./dist",
                  "description": "Default output directory of build."
                },
                "fallbackFile": {
                  "type": "string",
                  "x-example": "index.html",
                  "description": "Name of fallback file to use instead of 404 page. If null, Appwrite 404 page will be displayed."
                }
              },
              "required": [
                "key",
                "installCommand",
                "buildCommand",
                "outputDirectory",
                "fallbackFile"
              ],
              "additionalProperties": {},
              "example": {
                "key": "static",
                "installCommand": "npm install",
                "buildCommand": "npm run build",
                "outputDirectory": "./dist",
                "fallbackFile": "index.html"
              },
              "description": "Framework Adapter"
            },
            "x-example": [
              {
                "key": "static",
                "buildRuntime": "node-22",
                "buildCommand": "npm run build",
                "installCommand": "npm install",
                "outputDirectory": "./dist"
              }
            ],
            "description": "List of supported adapters."
          }
        },
        "required": [
          "key",
          "name",
          "buildRuntime",
          "runtimes",
          "adapters"
        ],
        "additionalProperties": {},
        "example": {
          "key": "sveltekit",
          "name": "SvelteKit",
          "buildRuntime": "node-22",
          "runtimes": [
            "static-1",
            "node-22"
          ],
          "adapters": [
            {
              "key": "static",
              "buildRuntime": "node-22",
              "buildCommand": "npm run build",
              "installCommand": "npm install",
              "outputDirectory": "./dist"
            }
          ]
        },
        "description": "Framework"
      },
      "x-example": "",
      "description": "List of frameworks."
    }
  },
  "required": [
    "total",
    "frameworks"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "frameworks": ""
  },
  "description": "Frameworks List"
} as const;

export const FrameworkListSchema = z.fromJSONSchema(FrameworkListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type FrameworkList = z.infer<typeof FrameworkListSchema>;
