// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const TemplateRuntimeJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "x-example": "node-19.0",
      "description": "Runtime Name."
    },
    "commands": {
      "type": "string",
      "x-example": "npm install",
      "description": "The build command used to build the deployment."
    },
    "entrypoint": {
      "type": "string",
      "x-example": "index.js",
      "description": "The entrypoint file used to execute the deployment."
    },
    "providerRootDirectory": {
      "type": "string",
      "x-example": "node/starter",
      "description": "Path to function in VCS (Version Control System) repository"
    }
  },
  "required": [
    "name",
    "commands",
    "entrypoint",
    "providerRootDirectory"
  ],
  "additionalProperties": {},
  "example": {
    "name": "node-19.0",
    "commands": "npm install",
    "entrypoint": "index.js",
    "providerRootDirectory": "node/starter"
  },
  "description": "Template Runtime"
} as const;

export const TemplateRuntimeSchema = z.fromJSONSchema(TemplateRuntimeJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type TemplateRuntime = z.infer<typeof TemplateRuntimeSchema>;
