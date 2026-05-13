// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const TemplateFrameworkJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "key": {
      "type": "string",
      "x-example": "sveltekit",
      "description": "Parent framework key."
    },
    "name": {
      "type": "string",
      "x-example": "SvelteKit",
      "description": "Framework Name."
    },
    "installCommand": {
      "type": "string",
      "x-example": "npm install",
      "description": "The install command used to install the dependencies."
    },
    "buildCommand": {
      "type": "string",
      "x-example": "npm run build",
      "description": "The build command used to build the deployment."
    },
    "outputDirectory": {
      "type": "string",
      "x-example": "./build",
      "description": "The output directory to store the build output."
    },
    "providerRootDirectory": {
      "type": "string",
      "x-example": "./svelte-kit/starter",
      "description": "Path to site in VCS (Version Control System) repository"
    },
    "buildRuntime": {
      "type": "string",
      "x-example": "node-22",
      "description": "Runtime used during build step of template."
    },
    "adapter": {
      "type": "string",
      "x-example": "ssr",
      "description": "Site framework runtime"
    },
    "fallbackFile": {
      "type": "string",
      "x-example": "index.html",
      "description": "Fallback file for SPA. Only relevant for static serve runtime."
    }
  },
  "required": [
    "key",
    "name",
    "installCommand",
    "buildCommand",
    "outputDirectory",
    "providerRootDirectory",
    "buildRuntime",
    "adapter",
    "fallbackFile"
  ],
  "additionalProperties": {},
  "example": {
    "key": "sveltekit",
    "name": "SvelteKit",
    "installCommand": "npm install",
    "buildCommand": "npm run build",
    "outputDirectory": "./build",
    "providerRootDirectory": "./svelte-kit/starter",
    "buildRuntime": "node-22",
    "adapter": "ssr",
    "fallbackFile": "index.html"
  },
  "description": "Template Framework"
} as const;

export const TemplateFrameworkSchema = z.fromJSONSchema(TemplateFrameworkJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type TemplateFramework = z.infer<typeof TemplateFrameworkSchema>;
