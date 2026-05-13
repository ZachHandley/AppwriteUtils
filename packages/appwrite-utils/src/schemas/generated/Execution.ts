// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const ExecutionJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "$id": {
      "type": "string",
      "x-example": "5e5ea5c16897e",
      "description": "Execution ID."
    },
    "$createdAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Execution creation date in ISO 8601 format."
    },
    "$updatedAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Execution update date in ISO 8601 format."
    },
    "$permissions": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "x-example": [
        "any"
      ],
      "description": "Execution roles."
    },
    "functionId": {
      "type": "string",
      "x-example": "5e5ea6g16897e",
      "description": "Function ID."
    },
    "deploymentId": {
      "type": "string",
      "x-example": "5e5ea5c16897e",
      "description": "Function's deployment ID used to create the execution."
    },
    "trigger": {
      "type": "string",
      "enum": [
        "http",
        "schedule",
        "event"
      ],
      "x-example": "http",
      "description": "The trigger that caused the function to execute. Possible values can be: `http`, `schedule`, or `event`."
    },
    "status": {
      "type": "string",
      "enum": [
        "waiting",
        "processing",
        "completed",
        "failed",
        "scheduled"
      ],
      "x-example": "processing",
      "description": "The status of the function execution. Possible values can be: `waiting`, `processing`, `completed`, `failed`, or `scheduled`."
    },
    "requestMethod": {
      "type": "string",
      "x-example": "GET",
      "description": "HTTP request method type."
    },
    "requestPath": {
      "type": "string",
      "x-example": "/articles?id=5",
      "description": "HTTP request path and query."
    },
    "requestHeaders": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "x-example": "Content-Type",
            "description": "Header name."
          },
          "value": {
            "type": "string",
            "x-example": "application/json",
            "description": "Header value."
          }
        },
        "required": [
          "name",
          "value"
        ],
        "additionalProperties": {},
        "example": {
          "name": "Content-Type",
          "value": "application/json"
        },
        "description": "Headers"
      },
      "x-example": [
        {
          "Content-Type": "application/json"
        }
      ],
      "description": "HTTP request headers as a key-value object. This will return only whitelisted headers. All headers are returned if execution is created as synchronous."
    },
    "responseStatusCode": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 200,
      "description": "HTTP response status code."
    },
    "responseBody": {
      "type": "string",
      "x-example": "",
      "description": "HTTP response body. This will return empty unless execution is created as synchronous."
    },
    "responseHeaders": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "x-example": "Content-Type",
            "description": "Header name."
          },
          "value": {
            "type": "string",
            "x-example": "application/json",
            "description": "Header value."
          }
        },
        "required": [
          "name",
          "value"
        ],
        "additionalProperties": {},
        "example": {
          "name": "Content-Type",
          "value": "application/json"
        },
        "description": "Headers"
      },
      "x-example": [
        {
          "Content-Type": "application/json"
        }
      ],
      "description": "HTTP response headers as a key-value object. This will return only whitelisted headers. All headers are returned if execution is created as synchronous."
    },
    "logs": {
      "type": "string",
      "x-example": "",
      "description": "Function logs. Includes the last 4,000 characters. This will return an empty string unless the response is returned using an API key or as part of a webhook payload."
    },
    "errors": {
      "type": "string",
      "x-example": "",
      "description": "Function errors. Includes the last 4,000 characters. This will return an empty string unless the response is returned using an API key or as part of a webhook payload."
    },
    "duration": {
      "type": "number",
      "x-example": 0.4,
      "description": "Resource(function/site) execution duration in seconds."
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
      "description": "The scheduled time for execution. If left empty, execution will be queued immediately."
    }
  },
  "required": [
    "$id",
    "$createdAt",
    "$updatedAt",
    "$permissions",
    "functionId",
    "deploymentId",
    "trigger",
    "status",
    "requestMethod",
    "requestPath",
    "requestHeaders",
    "responseStatusCode",
    "responseBody",
    "responseHeaders",
    "logs",
    "errors",
    "duration"
  ],
  "additionalProperties": {},
  "example": {
    "$id": "5e5ea5c16897e",
    "$createdAt": "2020-10-15T06:38:00.000+00:00",
    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
    "$permissions": [
      "any"
    ],
    "functionId": "5e5ea6g16897e",
    "deploymentId": "5e5ea5c16897e",
    "trigger": "http",
    "status": "processing",
    "requestMethod": "GET",
    "requestPath": "/articles?id=5",
    "requestHeaders": [
      {
        "Content-Type": "application/json"
      }
    ],
    "responseStatusCode": 200,
    "responseBody": "",
    "responseHeaders": [
      {
        "Content-Type": "application/json"
      }
    ],
    "logs": "",
    "errors": "",
    "duration": 0.4,
    "scheduledAt": "2020-10-15T06:38:00.000+00:00"
  },
  "description": "Execution"
} as const;

export const ExecutionSchema = z.fromJSONSchema(ExecutionJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Execution = z.infer<typeof ExecutionSchema>;
