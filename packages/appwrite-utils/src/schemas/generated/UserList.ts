// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const UserListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of users that matched your query."
    },
    "users": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "$id": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "User ID."
          },
          "$createdAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "User creation date in ISO 8601 format."
          },
          "$updatedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "User update date in ISO 8601 format."
          },
          "name": {
            "type": "string",
            "x-example": "John Doe",
            "description": "User name."
          },
          "password": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "x-example": "$argon2id$v=19$m=2048,t=4,p=3$aUZjLnliVWRINmFNTWMudg$5S+x+7uA31xFnrHFT47yFwcJeaP0w92L/4LdgrVRXxE",
            "description": "Hashed user password."
          },
          "hash": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "x-example": "argon2",
            "description": "Password hashing algorithm."
          },
          "hashOptions": {
            "anyOf": [
              {
                "type": "object",
                "properties": {},
                "additionalProperties": {}
              },
              {
                "type": "null"
              }
            ],
            "x-example": {},
            "description": "Password hashing algorithm configuration."
          },
          "registration": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "User registration date in ISO 8601 format."
          },
          "status": {
            "type": "boolean",
            "x-example": true,
            "description": "User status. Pass `true` for enabled and `false` for disabled."
          },
          "labels": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "x-example": [
              "vip"
            ],
            "description": "Labels for the user."
          },
          "passwordUpdate": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Password update time in ISO 8601 format."
          },
          "email": {
            "type": "string",
            "x-example": "john@appwrite.io",
            "description": "User email address."
          },
          "phone": {
            "type": "string",
            "x-example": "+4930901820",
            "description": "User phone number in E.164 format."
          },
          "emailVerification": {
            "type": "boolean",
            "x-example": true,
            "description": "Email verification status."
          },
          "phoneVerification": {
            "type": "boolean",
            "x-example": true,
            "description": "Phone verification status."
          },
          "mfa": {
            "type": "boolean",
            "x-example": true,
            "description": "Multi factor authentication status."
          },
          "prefs": {
            "type": "object",
            "properties": {},
            "additionalProperties": {},
            "x-example": {
              "theme": "pink",
              "timezone": "UTC"
            },
            "description": "User preferences as a key-value object"
          },
          "targets": {
            "type": "array",
            "items": {
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
            },
            "x-example": [],
            "description": "A user-owned message receiver. A single user may have multiple e.g. emails, phones, and a browser. Each target is registered with a single provider."
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
          "$updatedAt",
          "name",
          "registration",
          "status",
          "labels",
          "passwordUpdate",
          "email",
          "phone",
          "emailVerification",
          "phoneVerification",
          "mfa",
          "prefs",
          "targets",
          "accessedAt"
        ],
        "additionalProperties": {},
        "example": {
          "$id": "5e5ea5c16897e",
          "$createdAt": "2020-10-15T06:38:00.000+00:00",
          "$updatedAt": "2020-10-15T06:38:00.000+00:00",
          "name": "John Doe",
          "password": "$argon2id$v=19$m=2048,t=4,p=3$aUZjLnliVWRINmFNTWMudg$5S+x+7uA31xFnrHFT47yFwcJeaP0w92L/4LdgrVRXxE",
          "hash": "argon2",
          "hashOptions": {},
          "registration": "2020-10-15T06:38:00.000+00:00",
          "status": true,
          "labels": [
            "vip"
          ],
          "passwordUpdate": "2020-10-15T06:38:00.000+00:00",
          "email": "john@appwrite.io",
          "phone": "+4930901820",
          "emailVerification": true,
          "phoneVerification": true,
          "mfa": true,
          "prefs": {
            "theme": "pink",
            "timezone": "UTC"
          },
          "targets": [],
          "accessedAt": "2020-10-15T06:38:00.000+00:00"
        },
        "description": "User"
      },
      "x-example": "",
      "description": "List of users."
    }
  },
  "required": [
    "total",
    "users"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "users": ""
  },
  "description": "Users List"
} as const;

export const UserListSchema = z.fromJSONSchema(UserListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type UserList = z.infer<typeof UserListSchema>;
