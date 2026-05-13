// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const TargetJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "$id": {
      "type": "string",
      "x-example": "259125845563242502",
      "description": "Target ID."
    },
    "$createdAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Target creation time in ISO 8601 format."
    },
    "$updatedAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Target update date in ISO 8601 format."
    },
    "name": {
      "type": "string",
      "x-example": "Apple iPhone 12",
      "description": "Target Name."
    },
    "userId": {
      "type": "string",
      "x-example": "259125845563242502",
      "description": "User ID."
    },
    "providerId": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "x-example": "259125845563242502",
      "description": "Provider ID."
    },
    "providerType": {
      "type": "string",
      "x-example": "email",
      "description": "The target provider type. Can be one of the following: `email`, `sms` or `push`."
    },
    "identifier": {
      "type": "string",
      "x-example": "token",
      "description": "The target identifier."
    },
    "expired": {
      "type": "boolean",
      "x-example": false,
      "description": "Is the target expired."
    }
  },
  "required": [
    "$id",
    "$createdAt",
    "$updatedAt",
    "name",
    "userId",
    "providerType",
    "identifier",
    "expired"
  ],
  "additionalProperties": {},
  "example": {
    "$id": "259125845563242502",
    "$createdAt": "2020-10-15T06:38:00.000+00:00",
    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
    "name": "Apple iPhone 12",
    "userId": "259125845563242502",
    "providerId": "259125845563242502",
    "providerType": "email",
    "identifier": "token",
    "expired": false
  },
  "description": "Target"
} as const;

export const TargetSchema = z.fromJSONSchema(TargetJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Target = z.infer<typeof TargetSchema>;
