// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const TemplateFunctionJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "icon": {
      "type": "string",
      "x-example": "icon-lightning-bolt",
      "description": "Function Template Icon."
    },
    "id": {
      "type": "string",
      "x-example": "starter",
      "description": "Function Template ID."
    },
    "name": {
      "type": "string",
      "x-example": "Starter function",
      "description": "Function Template Name."
    },
    "tagline": {
      "type": "string",
      "x-example": "A simple function to get started.",
      "description": "Function Template Tagline."
    },
    "permissions": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "x-example": "any",
      "description": "Execution permissions."
    },
    "events": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "x-example": "account.create",
      "description": "Function trigger events."
    },
    "cron": {
      "type": "string",
      "x-example": "0 0 * * *",
      "description": "Function execution schedult in CRON format."
    },
    "timeout": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 300,
      "description": "Function execution timeout in seconds."
    },
    "useCases": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "x-example": "Starter",
      "description": "Function use cases."
    },
    "runtimes": {
      "type": "array",
      "items": {
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
      },
      "x-example": [],
      "description": "List of runtimes that can be used with this template."
    },
    "instructions": {
      "type": "string",
      "x-example": "For documentation and instructions check out <link>.",
      "description": "Function Template Instructions."
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
      "description": "Function variables."
    },
    "scopes": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "x-example": "users.read",
      "description": "Function scopes."
    }
  },
  "required": [
    "icon",
    "id",
    "name",
    "tagline",
    "permissions",
    "events",
    "cron",
    "timeout",
    "useCases",
    "runtimes",
    "instructions",
    "vcsProvider",
    "providerRepositoryId",
    "providerOwner",
    "providerVersion",
    "variables",
    "scopes"
  ],
  "additionalProperties": {},
  "example": {
    "icon": "icon-lightning-bolt",
    "id": "starter",
    "name": "Starter function",
    "tagline": "A simple function to get started.",
    "permissions": "any",
    "events": "account.create",
    "cron": "0 0 * * *",
    "timeout": 300,
    "useCases": "Starter",
    "runtimes": [],
    "instructions": "For documentation and instructions check out <link>.",
    "vcsProvider": "github",
    "providerRepositoryId": "templates",
    "providerOwner": "appwrite",
    "providerVersion": "main",
    "variables": [],
    "scopes": "users.read"
  },
  "description": "Template Function"
} as const;

export const TemplateFunctionSchema = z.fromJSONSchema(TemplateFunctionJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type TemplateFunction = z.infer<typeof TemplateFunctionSchema>;
