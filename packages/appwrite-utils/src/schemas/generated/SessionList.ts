// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const SessionListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of sessions that matched your query."
    },
    "sessions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "$id": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "Session ID."
          },
          "$createdAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Session creation date in ISO 8601 format."
          },
          "$updatedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Session update date in ISO 8601 format."
          },
          "userId": {
            "type": "string",
            "x-example": "5e5bb8c16897e",
            "description": "User ID."
          },
          "expire": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Session expiration date in ISO 8601 format."
          },
          "provider": {
            "type": "string",
            "x-example": "email",
            "description": "Session Provider."
          },
          "providerUid": {
            "type": "string",
            "x-example": "user@example.com",
            "description": "Session Provider User ID."
          },
          "providerAccessToken": {
            "type": "string",
            "x-example": "MTQ0NjJkZmQ5OTM2NDE1ZTZjNGZmZjI3",
            "description": "Session Provider Access Token."
          },
          "providerAccessTokenExpiry": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "The date of when the access token expires in ISO 8601 format."
          },
          "providerRefreshToken": {
            "type": "string",
            "x-example": "MTQ0NjJkZmQ5OTM2NDE1ZTZjNGZmZjI3",
            "description": "Session Provider Refresh Token."
          },
          "ip": {
            "type": "string",
            "x-example": "127.0.0.1",
            "description": "IP in use when the session was created."
          },
          "osCode": {
            "type": "string",
            "x-example": "Mac",
            "description": "Operating system code name. View list of [available options](https://github.com/appwrite/appwrite/blob/master/docs/lists/os.json)."
          },
          "osName": {
            "type": "string",
            "x-example": "Mac",
            "description": "Operating system name."
          },
          "osVersion": {
            "type": "string",
            "x-example": "Mac",
            "description": "Operating system version."
          },
          "clientType": {
            "type": "string",
            "x-example": "browser",
            "description": "Client type."
          },
          "clientCode": {
            "type": "string",
            "x-example": "CM",
            "description": "Client code name. View list of [available options](https://github.com/appwrite/appwrite/blob/master/docs/lists/clients.json)."
          },
          "clientName": {
            "type": "string",
            "x-example": "Chrome Mobile iOS",
            "description": "Client name."
          },
          "clientVersion": {
            "type": "string",
            "x-example": "84.0",
            "description": "Client version."
          },
          "clientEngine": {
            "type": "string",
            "x-example": "WebKit",
            "description": "Client engine name."
          },
          "clientEngineVersion": {
            "type": "string",
            "x-example": "605.1.15",
            "description": "Client engine name."
          },
          "deviceName": {
            "type": "string",
            "x-example": "smartphone",
            "description": "Device name."
          },
          "deviceBrand": {
            "type": "string",
            "x-example": "Google",
            "description": "Device brand name."
          },
          "deviceModel": {
            "type": "string",
            "x-example": "Nexus 5",
            "description": "Device model name."
          },
          "countryCode": {
            "type": "string",
            "x-example": "US",
            "description": "Country two-character ISO 3166-1 alpha code."
          },
          "countryName": {
            "type": "string",
            "x-example": "United States",
            "description": "Country name."
          },
          "current": {
            "type": "boolean",
            "x-example": true,
            "description": "Returns true if this the current user session."
          },
          "factors": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "x-example": [
              "email"
            ],
            "description": "Returns a list of active session factors."
          },
          "secret": {
            "type": "string",
            "x-example": "5e5bb8c16897e",
            "description": "Secret used to authenticate the user. Only included if the request was made with an API key"
          },
          "mfaUpdatedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Most recent date in ISO 8601 format when the session successfully passed MFA challenge."
          }
        },
        "required": [
          "$id",
          "$createdAt",
          "$updatedAt",
          "userId",
          "expire",
          "provider",
          "providerUid",
          "providerAccessToken",
          "providerAccessTokenExpiry",
          "providerRefreshToken",
          "ip",
          "osCode",
          "osName",
          "osVersion",
          "clientType",
          "clientCode",
          "clientName",
          "clientVersion",
          "clientEngine",
          "clientEngineVersion",
          "deviceName",
          "deviceBrand",
          "deviceModel",
          "countryCode",
          "countryName",
          "current",
          "factors",
          "secret",
          "mfaUpdatedAt"
        ],
        "additionalProperties": {},
        "example": {
          "$id": "5e5ea5c16897e",
          "$createdAt": "2020-10-15T06:38:00.000+00:00",
          "$updatedAt": "2020-10-15T06:38:00.000+00:00",
          "userId": "5e5bb8c16897e",
          "expire": "2020-10-15T06:38:00.000+00:00",
          "provider": "email",
          "providerUid": "user@example.com",
          "providerAccessToken": "MTQ0NjJkZmQ5OTM2NDE1ZTZjNGZmZjI3",
          "providerAccessTokenExpiry": "2020-10-15T06:38:00.000+00:00",
          "providerRefreshToken": "MTQ0NjJkZmQ5OTM2NDE1ZTZjNGZmZjI3",
          "ip": "127.0.0.1",
          "osCode": "Mac",
          "osName": "Mac",
          "osVersion": "Mac",
          "clientType": "browser",
          "clientCode": "CM",
          "clientName": "Chrome Mobile iOS",
          "clientVersion": "84.0",
          "clientEngine": "WebKit",
          "clientEngineVersion": "605.1.15",
          "deviceName": "smartphone",
          "deviceBrand": "Google",
          "deviceModel": "Nexus 5",
          "countryCode": "US",
          "countryName": "United States",
          "current": true,
          "factors": [
            "email"
          ],
          "secret": "5e5bb8c16897e",
          "mfaUpdatedAt": "2020-10-15T06:38:00.000+00:00"
        },
        "description": "Session"
      },
      "x-example": "",
      "description": "List of sessions."
    }
  },
  "required": [
    "total",
    "sessions"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "sessions": ""
  },
  "description": "Sessions List"
} as const;

export const SessionListSchema = z.fromJSONSchema(SessionListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type SessionList = z.infer<typeof SessionListSchema>;
