// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const ResourceTokenListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of tokens that matched your query."
    },
    "tokens": {
      "type": "array",
      "items": {
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
          "resourceId": {
            "type": "string",
            "x-example": "5e5ea5c168bb8:5e5ea5c168bb8",
            "description": "Resource ID."
          },
          "resourceType": {
            "type": "string",
            "x-example": "files",
            "description": "Resource type."
          },
          "expire": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Token expiration date in ISO 8601 format."
          },
          "secret": {
            "type": "string",
            "x-example": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
            "description": "JWT encoded string."
          },
          "accessedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Most recent access date in ISO 8601 format. This attribute is only updated again after 24 hours."
          }
        },
        "required": [
          "$id",
          "$createdAt",
          "resourceId",
          "resourceType",
          "expire",
          "secret",
          "accessedAt"
        ],
        "additionalProperties": {},
        "example": {
          "$id": "bb8ea5c16897e",
          "$createdAt": "2020-10-15T06:38:00.000+00:00",
          "resourceId": "5e5ea5c168bb8:5e5ea5c168bb8",
          "resourceType": "files",
          "expire": "2020-10-15T06:38:00.000+00:00",
          "secret": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
          "accessedAt": "2020-10-15T06:38:00.000+00:00"
        },
        "description": "ResourceToken"
      },
      "x-example": "",
      "description": "List of tokens."
    }
  },
  "required": [
    "total",
    "tokens"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "tokens": ""
  },
  "description": "Resource Tokens List"
} as const;

export const ResourceTokenListSchema = z.fromJSONSchema(ResourceTokenListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type ResourceTokenList = z.infer<typeof ResourceTokenListSchema>;
