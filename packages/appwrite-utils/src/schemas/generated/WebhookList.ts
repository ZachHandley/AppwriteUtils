// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const WebhookListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of webhooks that matched your query."
    },
    "webhooks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "$id": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "Webhook ID."
          },
          "$createdAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Webhook creation date in ISO 8601 format."
          },
          "$updatedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Webhook update date in ISO 8601 format."
          },
          "name": {
            "type": "string",
            "x-example": "My Webhook",
            "description": "Webhook name."
          },
          "url": {
            "type": "string",
            "x-example": "https://example.com/webhook",
            "description": "Webhook URL endpoint."
          },
          "events": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "x-example": [
              "databases.tables.update",
              "databases.collections.update"
            ],
            "description": "Webhook trigger events."
          },
          "security": {
            "type": "boolean",
            "x-example": true,
            "description": "Indicated if SSL / TLS Certificate verification is enabled."
          },
          "httpUser": {
            "type": "string",
            "x-example": "username",
            "description": "HTTP basic authentication username."
          },
          "httpPass": {
            "type": "string",
            "x-example": "password",
            "description": "HTTP basic authentication password."
          },
          "signatureKey": {
            "type": "string",
            "x-example": "ad3d581ca230e2b7059c545e5a",
            "description": "Signature key which can be used to validated incoming"
          },
          "enabled": {
            "type": "boolean",
            "x-example": true,
            "description": "Indicates if this webhook is enabled."
          },
          "logs": {
            "type": "string",
            "x-example": "Failed to connect to remote server.",
            "description": "Webhook error logs from the most recent failure."
          },
          "attempts": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 10,
            "description": "Number of consecutive failed webhook attempts."
          }
        },
        "required": [
          "$id",
          "$createdAt",
          "$updatedAt",
          "name",
          "url",
          "events",
          "security",
          "httpUser",
          "httpPass",
          "signatureKey",
          "enabled",
          "logs",
          "attempts"
        ],
        "additionalProperties": {},
        "example": {
          "$id": "5e5ea5c16897e",
          "$createdAt": "2020-10-15T06:38:00.000+00:00",
          "$updatedAt": "2020-10-15T06:38:00.000+00:00",
          "name": "My Webhook",
          "url": "https://example.com/webhook",
          "events": [
            "databases.tables.update",
            "databases.collections.update"
          ],
          "security": true,
          "httpUser": "username",
          "httpPass": "password",
          "signatureKey": "ad3d581ca230e2b7059c545e5a",
          "enabled": true,
          "logs": "Failed to connect to remote server.",
          "attempts": 10
        },
        "description": "Webhook"
      },
      "x-example": "",
      "description": "List of webhooks."
    }
  },
  "required": [
    "total",
    "webhooks"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "webhooks": ""
  },
  "description": "Webhooks List"
} as const;

export const WebhookListSchema = z.fromJSONSchema(WebhookListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type WebhookList = z.infer<typeof WebhookListSchema>;
