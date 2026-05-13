// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const InstallationListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of installations that matched your query."
    },
    "installations": {
      "type": "array",
      "items": {
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
      },
      "x-example": "",
      "description": "List of installations."
    }
  },
  "required": [
    "total",
    "installations"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "installations": ""
  },
  "description": "Installations List"
} as const;

export const InstallationListSchema = z.fromJSONSchema(InstallationListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type InstallationList = z.infer<typeof InstallationListSchema>;
