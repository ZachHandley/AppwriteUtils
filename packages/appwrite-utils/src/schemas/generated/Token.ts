// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const TokenJsonSchema = {
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
    "secret": {
      "type": "string",
      "x-example": "",
      "description": "Token secret key. This will return an empty string unless the response is returned using an API key or as part of a webhook payload."
    },
    "expire": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Token expiration date in ISO 8601 format."
    },
    "phrase": {
      "type": "string",
      "x-example": "Golden Fox",
      "description": "Security phrase of a token. Empty if security phrase was not requested when creating a token. It includes randomly generated phrase which is also sent in the external resource such as email."
    }
  },
  "required": [
    "$id",
    "$createdAt",
    "userId",
    "secret",
    "expire",
    "phrase"
  ],
  "additionalProperties": {},
  "example": {
    "$id": "bb8ea5c16897e",
    "$createdAt": "2020-10-15T06:38:00.000+00:00",
    "userId": "5e5ea5c168bb8",
    "secret": "",
    "expire": "2020-10-15T06:38:00.000+00:00",
    "phrase": "Golden Fox"
  },
  "description": "Token"
} as const;

export const TokenSchema = z.fromJSONSchema(TokenJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Token = z.infer<typeof TokenSchema>;
