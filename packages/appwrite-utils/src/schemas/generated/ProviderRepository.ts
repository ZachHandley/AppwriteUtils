// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const ProviderRepositoryJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "x-example": "5e5ea5c16897e",
      "description": "VCS (Version Control System) repository ID."
    },
    "name": {
      "type": "string",
      "x-example": "appwrite",
      "description": "VCS (Version Control System) repository name."
    },
    "organization": {
      "type": "string",
      "x-example": "appwrite",
      "description": "VCS (Version Control System) organization name"
    },
    "provider": {
      "type": "string",
      "x-example": "github",
      "description": "VCS (Version Control System) provider name."
    },
    "private": {
      "type": "boolean",
      "x-example": true,
      "description": "Is VCS (Version Control System) repository private?"
    },
    "defaultBranch": {
      "type": "string",
      "x-example": "main",
      "description": "VCS (Version Control System) repository's default branch name."
    },
    "pushedAt": {
      "type": "string",
      "x-example": "datetime",
      "description": "Last commit date in ISO 8601 format."
    },
    "variables": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "x-example": [
        "PORT",
        "NODE_ENV"
      ],
      "description": "Environment variables found in .env files"
    }
  },
  "required": [
    "id",
    "name",
    "organization",
    "provider",
    "private",
    "defaultBranch",
    "pushedAt",
    "variables"
  ],
  "additionalProperties": {},
  "example": {
    "id": "5e5ea5c16897e",
    "name": "appwrite",
    "organization": "appwrite",
    "provider": "github",
    "private": true,
    "defaultBranch": "main",
    "pushedAt": "datetime",
    "variables": [
      "PORT",
      "NODE_ENV"
    ]
  },
  "description": "ProviderRepository"
} as const;

export const ProviderRepositorySchema = z.fromJSONSchema(ProviderRepositoryJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type ProviderRepository = z.infer<typeof ProviderRepositorySchema>;
