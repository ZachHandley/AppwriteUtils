// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const TemplateSiteJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "key": {
      "type": "string",
      "x-example": "starter",
      "description": "Site Template ID."
    },
    "name": {
      "type": "string",
      "x-example": "Starter site",
      "description": "Site Template Name."
    },
    "tagline": {
      "type": "string",
      "x-example": "Minimal web app integrating with Appwrite.",
      "description": "Short description of template"
    },
    "demoUrl": {
      "type": "string",
      "x-example": "https://nextjs-starter.appwrite.network/",
      "description": "URL hosting a template demo."
    },
    "screenshotDark": {
      "type": "string",
      "x-example": "https://cloud.appwrite.io/images/sites/templates/template-for-blog-dark.png",
      "description": "File URL with preview screenshot in dark theme preference."
    },
    "screenshotLight": {
      "type": "string",
      "x-example": "https://cloud.appwrite.io/images/sites/templates/template-for-blog-light.png",
      "description": "File URL with preview screenshot in light theme preference."
    },
    "useCases": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "x-example": "Starter",
      "description": "Site use cases."
    },
    "frameworks": {
      "type": "array",
      "items": {
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
      },
      "x-example": [],
      "description": "List of frameworks that can be used with this template."
    },
    "vcsProvider": {
      "type": "string",
      "x-example": "github",
      "description": "VCS (Version Control System) Provider."
    },
    "providerRepositoryId": {
      "type": "string",
      "x-example": "templates",
      "description": "VCS (Version Control System) Repository ID"
    },
    "providerOwner": {
      "type": "string",
      "x-example": "appwrite",
      "description": "VCS (Version Control System) Owner."
    },
    "providerVersion": {
      "type": "string",
      "x-example": "main",
      "description": "VCS (Version Control System) branch version (tag)."
    },
    "variables": {
      "type": "array",
      "items": {
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
      },
      "x-example": [],
      "description": "Site variables."
    }
  },
  "required": [
    "key",
    "name",
    "tagline",
    "demoUrl",
    "screenshotDark",
    "screenshotLight",
    "useCases",
    "frameworks",
    "vcsProvider",
    "providerRepositoryId",
    "providerOwner",
    "providerVersion",
    "variables"
  ],
  "additionalProperties": {},
  "example": {
    "key": "starter",
    "name": "Starter site",
    "tagline": "Minimal web app integrating with Appwrite.",
    "demoUrl": "https://nextjs-starter.appwrite.network/",
    "screenshotDark": "https://cloud.appwrite.io/images/sites/templates/template-for-blog-dark.png",
    "screenshotLight": "https://cloud.appwrite.io/images/sites/templates/template-for-blog-light.png",
    "useCases": "Starter",
    "frameworks": [],
    "vcsProvider": "github",
    "providerRepositoryId": "templates",
    "providerOwner": "appwrite",
    "providerVersion": "main",
    "variables": []
  },
  "description": "Template Site"
} as const;

export const TemplateSiteSchema = z.fromJSONSchema(TemplateSiteJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type TemplateSite = z.infer<typeof TemplateSiteSchema>;
