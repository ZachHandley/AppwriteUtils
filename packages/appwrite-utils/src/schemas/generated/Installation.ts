// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const InstallationJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "$id": {
      "type": "string",
      "x-example": "5e5ea5c16897e",
      "description": "Function ID."
    },
    "$createdAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Function creation date in ISO 8601 format."
    },
    "$updatedAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Function update date in ISO 8601 format."
    },
    "provider": {
      "type": "string",
      "x-example": "github",
      "description": "VCS (Version Control System) provider name."
    },
    "organization": {
      "type": "string",
      "x-example": "appwrite",
      "description": "VCS (Version Control System) organization name."
    },
    "providerInstallationId": {
      "type": "string",
      "x-example": "5322",
      "description": "VCS (Version Control System) installation ID."
    }
  },
  "required": [
    "$id",
    "$createdAt",
    "$updatedAt",
    "provider",
    "organization",
    "providerInstallationId"
  ],
  "additionalProperties": {},
  "example": {
    "$id": "5e5ea5c16897e",
    "$createdAt": "2020-10-15T06:38:00.000+00:00",
    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
    "provider": "github",
    "organization": "appwrite",
    "providerInstallationId": "5322"
  },
  "description": "Installation"
} as const;

export const InstallationSchema = z.fromJSONSchema(InstallationJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Installation = z.infer<typeof InstallationSchema>;
