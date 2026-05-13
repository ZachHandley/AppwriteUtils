// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const TopicListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of topics that matched your query."
    },
    "topics": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "$id": {
            "type": "string",
            "x-example": "259125845563242502",
            "description": "Topic ID."
          },
          "$createdAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Topic creation time in ISO 8601 format."
          },
          "$updatedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Topic update date in ISO 8601 format."
          },
          "name": {
            "type": "string",
            "x-example": "events",
            "description": "The name of the topic."
          },
          "emailTotal": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 100,
            "description": "Total count of email subscribers subscribed to the topic."
          },
          "smsTotal": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 100,
            "description": "Total count of SMS subscribers subscribed to the topic."
          },
          "pushTotal": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 100,
            "description": "Total count of push subscribers subscribed to the topic."
          },
          "subscribe": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "x-example": "users",
            "description": "Subscribe permissions."
          }
        },
        "required": [
          "$id",
          "$createdAt",
          "$updatedAt",
          "name",
          "emailTotal",
          "smsTotal",
          "pushTotal",
          "subscribe"
        ],
        "additionalProperties": {},
        "example": {
          "$id": "259125845563242502",
          "$createdAt": "2020-10-15T06:38:00.000+00:00",
          "$updatedAt": "2020-10-15T06:38:00.000+00:00",
          "name": "events",
          "emailTotal": 100,
          "smsTotal": 100,
          "pushTotal": 100,
          "subscribe": "users"
        },
        "description": "Topic"
      },
      "x-example": "",
      "description": "List of topics."
    }
  },
  "required": [
    "total",
    "topics"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "topics": ""
  },
  "description": "Topic list"
} as const;

export const TopicListSchema = z.fromJSONSchema(TopicListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type TopicList = z.infer<typeof TopicListSchema>;
