// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const SubscriberListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of subscribers that matched your query."
    },
    "subscribers": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "$id": {
            "type": "string",
            "x-example": "259125845563242502",
            "description": "Subscriber ID."
          },
          "$createdAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Subscriber creation time in ISO 8601 format."
          },
          "$updatedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Subscriber update date in ISO 8601 format."
          },
          "targetId": {
            "type": "string",
            "x-example": "259125845563242502",
            "description": "Target ID."
          },
          "target": {
            "type": "object",
            "properties": {},
            "additionalProperties": {},
            "x-example": {
              "$id": "259125845563242502",
              "$createdAt": "2020-10-15T06:38:00.000+00:00",
              "$updatedAt": "2020-10-15T06:38:00.000+00:00",
              "providerType": "email",
              "providerId": "259125845563242502",
              "name": "ageon-app-email",
              "identifier": "random-mail@email.org",
              "userId": "5e5ea5c16897e"
            },
            "description": "Target."
          },
          "userId": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "Topic ID."
          },
          "userName": {
            "type": "string",
            "x-example": "Aegon Targaryen",
            "description": "User Name."
          },
          "topicId": {
            "type": "string",
            "x-example": "259125845563242502",
            "description": "Topic ID."
          },
          "providerType": {
            "type": "string",
            "x-example": "email",
            "description": "The target provider type. Can be one of the following: `email`, `sms` or `push`."
          }
        },
        "required": [
          "$id",
          "$createdAt",
          "$updatedAt",
          "targetId",
          "target",
          "userId",
          "userName",
          "topicId",
          "providerType"
        ],
        "additionalProperties": {},
        "example": {
          "$id": "259125845563242502",
          "$createdAt": "2020-10-15T06:38:00.000+00:00",
          "$updatedAt": "2020-10-15T06:38:00.000+00:00",
          "targetId": "259125845563242502",
          "target": {
            "$id": "259125845563242502",
            "$createdAt": "2020-10-15T06:38:00.000+00:00",
            "$updatedAt": "2020-10-15T06:38:00.000+00:00",
            "providerType": "email",
            "providerId": "259125845563242502",
            "name": "ageon-app-email",
            "identifier": "random-mail@email.org",
            "userId": "5e5ea5c16897e"
          },
          "userId": "5e5ea5c16897e",
          "userName": "Aegon Targaryen",
          "topicId": "259125845563242502",
          "providerType": "email"
        },
        "description": "Subscriber"
      },
      "x-example": "",
      "description": "List of subscribers."
    }
  },
  "required": [
    "total",
    "subscribers"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "subscribers": ""
  },
  "description": "Subscriber list"
} as const;

export const SubscriberListSchema = z.fromJSONSchema(SubscriberListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type SubscriberList = z.infer<typeof SubscriberListSchema>;
