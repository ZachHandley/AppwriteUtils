// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const MfaChallengeJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "$id": {
      "type": "string",
      "x-example": "bb8ea5c16897e",
      "description": "Token ID."
    },
    "$createdAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Token creation date in ISO 8601 format."
    },
    "userId": {
      "type": "string",
      "x-example": "5e5ea5c168bb8",
      "description": "User ID."
    },
    "expire": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Token expiration date in ISO 8601 format."
    }
  },
  "required": [
    "$id",
    "$createdAt",
    "userId",
    "expire"
  ],
  "additionalProperties": {},
  "example": {
    "$id": "bb8ea5c16897e",
    "$createdAt": "2020-10-15T06:38:00.000+00:00",
    "userId": "5e5ea5c168bb8",
    "expire": "2020-10-15T06:38:00.000+00:00"
  },
  "description": "MFA Challenge"
} as const;

export const MfaChallengeSchema = z.fromJSONSchema(MfaChallengeJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type MfaChallenge = z.infer<typeof MfaChallengeSchema>;
