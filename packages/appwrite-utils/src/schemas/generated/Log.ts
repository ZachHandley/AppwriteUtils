// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const LogJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "event": {
      "type": "string",
      "x-example": "account.sessions.create",
      "description": "Event name."
    },
    "userId": {
      "type": "string",
      "x-example": "610fc2f985ee0",
      "description": "User ID."
    },
    "userEmail": {
      "type": "string",
      "x-example": "john@appwrite.io",
      "description": "User Email."
    },
    "userName": {
      "type": "string",
      "x-example": "John Doe",
      "description": "User Name."
    },
    "mode": {
      "type": "string",
      "x-example": "admin",
      "description": "API mode when event triggered."
    },
    "ip": {
      "type": "string",
      "x-example": "127.0.0.1",
      "description": "IP session in use when the session was created."
    },
    "time": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Log creation date in ISO 8601 format."
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
    }
  },
  "required": [
    "event",
    "userId",
    "userEmail",
    "userName",
    "mode",
    "ip",
    "time",
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
    "countryName"
  ],
  "additionalProperties": {},
  "example": {
    "event": "account.sessions.create",
    "userId": "610fc2f985ee0",
    "userEmail": "john@appwrite.io",
    "userName": "John Doe",
    "mode": "admin",
    "ip": "127.0.0.1",
    "time": "2020-10-15T06:38:00.000+00:00",
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
    "countryName": "United States"
  },
  "description": "Log"
} as const;

export const LogSchema = z.fromJSONSchema(LogJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Log = z.infer<typeof LogSchema>;
