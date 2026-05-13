// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const MembershipListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of memberships that matched your query."
    },
    "memberships": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "$id": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "Membership ID."
          },
          "$createdAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Membership creation date in ISO 8601 format."
          },
          "$updatedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Membership update date in ISO 8601 format."
          },
          "userId": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "User ID."
          },
          "userName": {
            "type": "string",
            "x-example": "John Doe",
            "description": "User name. Hide this attribute by toggling membership privacy in the Console."
          },
          "userEmail": {
            "type": "string",
            "x-example": "john@appwrite.io",
            "description": "User email address. Hide this attribute by toggling membership privacy in the Console."
          },
          "teamId": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "Team ID."
          },
          "teamName": {
            "type": "string",
            "x-example": "VIP",
            "description": "Team name."
          },
          "invited": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Date, the user has been invited to join the team in ISO 8601 format."
          },
          "joined": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Date, the user has accepted the invitation to join the team in ISO 8601 format."
          },
          "confirm": {
            "type": "boolean",
            "x-example": false,
            "description": "User confirmation status, true if the user has joined the team or false otherwise."
          },
          "mfa": {
            "type": "boolean",
            "x-example": false,
            "description": "Multi factor authentication status, true if the user has MFA enabled or false otherwise. Hide this attribute by toggling membership privacy in the Console."
          },
          "roles": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "x-example": [
              "owner"
            ],
            "description": "User list of roles"
          }
        },
        "required": [
          "$id",
          "$createdAt",
          "$updatedAt",
          "userId",
          "userName",
          "userEmail",
          "teamId",
          "teamName",
          "invited",
          "joined",
          "confirm",
          "mfa",
          "roles"
        ],
        "additionalProperties": {},
        "example": {
          "$id": "5e5ea5c16897e",
          "$createdAt": "2020-10-15T06:38:00.000+00:00",
          "$updatedAt": "2020-10-15T06:38:00.000+00:00",
          "userId": "5e5ea5c16897e",
          "userName": "John Doe",
          "userEmail": "john@appwrite.io",
          "teamId": "5e5ea5c16897e",
          "teamName": "VIP",
          "invited": "2020-10-15T06:38:00.000+00:00",
          "joined": "2020-10-15T06:38:00.000+00:00",
          "confirm": false,
          "mfa": false,
          "roles": [
            "owner"
          ]
        },
        "description": "Membership"
      },
      "x-example": "",
      "description": "List of memberships."
    }
  },
  "required": [
    "total",
    "memberships"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "memberships": ""
  },
  "description": "Memberships List"
} as const;

export const MembershipListSchema = z.fromJSONSchema(MembershipListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type MembershipList = z.infer<typeof MembershipListSchema>;
