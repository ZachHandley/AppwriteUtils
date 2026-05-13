// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const RuntimeListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of runtimes that matched your query."
    },
    "runtimes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "$id": {
            "type": "string",
            "x-example": "python-3.8",
            "description": "Runtime ID."
          },
          "key": {
            "type": "string",
            "x-example": "python",
            "description": "Parent runtime key."
          },
          "name": {
            "type": "string",
            "x-example": "Python",
            "description": "Runtime Name."
          },
          "version": {
            "type": "string",
            "x-example": "3.8",
            "description": "Runtime version."
          },
          "base": {
            "type": "string",
            "x-example": "python:3.8-alpine",
            "description": "Base Docker image used to build the runtime."
          },
          "image": {
            "type": "string",
            "x-example": "appwrite\\/runtime-for-python:3.8",
            "description": "Image name of Docker Hub."
          },
          "logo": {
            "type": "string",
            "x-example": "python.png",
            "description": "Name of the logo image."
          },
          "supports": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "x-example": "amd64",
            "description": "List of supported architectures."
          }
        },
        "required": [
          "$id",
          "key",
          "name",
          "version",
          "base",
          "image",
          "logo",
          "supports"
        ],
        "additionalProperties": {},
        "example": {
          "$id": "python-3.8",
          "key": "python",
          "name": "Python",
          "version": "3.8",
          "base": "python:3.8-alpine",
          "image": "appwrite\\/runtime-for-python:3.8",
          "logo": "python.png",
          "supports": "amd64"
        },
        "description": "Runtime"
      },
      "x-example": "",
      "description": "List of runtimes."
    }
  },
  "required": [
    "total",
    "runtimes"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "runtimes": ""
  },
  "description": "Runtimes List"
} as const;

export const RuntimeListSchema = z.fromJSONSchema(RuntimeListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type RuntimeList = z.infer<typeof RuntimeListSchema>;
