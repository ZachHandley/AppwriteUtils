// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const MessageListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of messages that matched your query."
    },
    "messages": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "$id": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "Message ID."
          },
          "$createdAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Message creation time in ISO 8601 format."
          },
          "$updatedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Message update date in ISO 8601 format."
          },
          "providerType": {
            "type": "string",
            "x-example": "email",
            "description": "Message provider type."
          },
          "topics": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "x-example": [
              "5e5ea5c16897e"
            ],
            "description": "Topic IDs set as recipients."
          },
          "users": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "x-example": [
              "5e5ea5c16897e"
            ],
            "description": "User IDs set as recipients."
          },
          "targets": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "x-example": [
              "5e5ea5c16897e"
            ],
            "description": "Target IDs set as recipients."
          },
          "scheduledAt": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "The scheduled time for message."
          },
          "deliveredAt": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "The time when the message was delivered."
          },
          "deliveryErrors": {
            "anyOf": [
              {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              {
                "type": "null"
              }
            ],
            "x-example": [
              "Failed to send message to target 5e5ea5c16897e: Credentials not valid."
            ],
            "description": "Delivery errors if any."
          },
          "deliveredTotal": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 1,
            "description": "Number of recipients the message was delivered to."
          },
          "data": {
            "type": "object",
            "properties": {},
            "additionalProperties": {},
            "x-example": {
              "subject": "Welcome to Appwrite",
              "content": "Hi there, welcome to Appwrite family."
            },
            "description": "Data of the message."
          },
          "status": {
            "type": "string",
            "enum": [
              "draft",
              "processing",
              "scheduled",
              "sent",
              "failed"
            ],
            "x-example": "Message status can be one of the following: draft, processing, scheduled, sent, or failed.",
            "description": "Status of delivery."
          }
        },
        "required": [
          "$id",
          "$createdAt",
          "$updatedAt",
          "providerType",
          "topics",
          "users",
          "targets",
          "deliveredTotal",
          "data",
          "status"
        ],
        "additionalProperties": {},
        "example": {
          "$id": "5e5ea5c16897e",
          "$createdAt": "2020-10-15T06:38:00.000+00:00",
          "$updatedAt": "2020-10-15T06:38:00.000+00:00",
          "providerType": "email",
          "topics": [
            "5e5ea5c16897e"
          ],
          "users": [
            "5e5ea5c16897e"
          ],
          "targets": [
            "5e5ea5c16897e"
          ],
          "scheduledAt": "2020-10-15T06:38:00.000+00:00",
          "deliveredAt": "2020-10-15T06:38:00.000+00:00",
          "deliveryErrors": [
            "Failed to send message to target 5e5ea5c16897e: Credentials not valid."
          ],
          "deliveredTotal": 1,
          "data": {
            "subject": "Welcome to Appwrite",
            "content": "Hi there, welcome to Appwrite family."
          },
          "status": "Message status can be one of the following: draft, processing, scheduled, sent, or failed."
        },
        "description": "Message"
      },
      "x-example": "",
      "description": "List of messages."
    }
  },
  "required": [
    "total",
    "messages"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "messages": ""
  },
  "description": "Message list"
} as const;

export const MessageListSchema = z.fromJSONSchema(MessageListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type MessageList = z.infer<typeof MessageListSchema>;
