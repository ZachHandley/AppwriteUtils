// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const IdentityJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "$id": {
      "type": "string",
      "x-example": "5e5ea5c16897e",
      "description": "Identity ID."
    },
    "$createdAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Identity creation date in ISO 8601 format."
    },
    "$updatedAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Identity update date in ISO 8601 format."
    },
    "userId": {
      "type": "string",
      "x-example": "5e5bb8c16897e",
      "description": "User ID."
    },
    "provider": {
      "type": "string",
      "x-example": "email",
      "description": "Identity Provider."
    },
    "providerUid": {
      "type": "string",
      "x-example": "5e5bb8c16897e",
      "description": "ID of the User in the Identity Provider."
    },
    "providerEmail": {
      "type": "string",
      "x-example": "user@example.com",
      "description": "Email of the User in the Identity Provider."
    },
    "providerAccessToken": {
      "type": "string",
      "x-example": "MTQ0NjJkZmQ5OTM2NDE1ZTZjNGZmZjI3",
      "description": "Identity Provider Access Token."
    },
    "providerAccessTokenExpiry": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "The date of when the access token expires in ISO 8601 format."
    },
    "providerRefreshToken": {
      "type": "string",
      "x-example": "MTQ0NjJkZmQ5OTM2NDE1ZTZjNGZmZjI3",
      "description": "Identity Provider Refresh Token."
    }
  },
  "required": [
    "$id",
    "$createdAt",
    "$updatedAt",
    "userId",
    "provider",
    "providerUid",
    "providerEmail",
    "providerAccessToken",
    "providerAccessTokenExpiry",
    "providerRefreshToken"
  ],
  "additionalProperties": {},
  "example": {
    "$id": "5e5ea5c16897e",
    "$createdAt": "2020-10-15T06:38:00.000+00:00",
    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
    "userId": "5e5bb8c16897e",
    "provider": "email",
    "providerUid": "5e5bb8c16897e",
    "providerEmail": "user@example.com",
    "providerAccessToken": "MTQ0NjJkZmQ5OTM2NDE1ZTZjNGZmZjI3",
    "providerAccessTokenExpiry": "2020-10-15T06:38:00.000+00:00",
    "providerRefreshToken": "MTQ0NjJkZmQ5OTM2NDE1ZTZjNGZmZjI3"
  },
  "description": "Identity"
} as const;

export const IdentitySchema = z.fromJSONSchema(IdentityJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Identity = z.infer<typeof IdentitySchema>;
