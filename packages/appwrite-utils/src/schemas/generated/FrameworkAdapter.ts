// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const FrameworkAdapterJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
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
} as const;

export const FrameworkAdapterSchema = z.fromJSONSchema(FrameworkAdapterJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type FrameworkAdapter = z.infer<typeof FrameworkAdapterSchema>;
