// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const VcsContentListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of contents that matched your query."
    },
    "contents": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "size": {
            "anyOf": [
              {
                "type": "integer",
                "minimum": -9007199254740991,
                "maximum": 9007199254740991
              },
              {
                "type": "null"
              }
            ],
            "x-example": 1523,
            "description": "Content size in bytes. Only files have size, and for directories, 0 is returned."
          },
          "isDirectory": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ],
            "x-example": true,
            "description": "If a content is a directory. Directories can be used to check nested contents."
          },
          "name": {
            "type": "string",
            "x-example": "Main.java",
            "description": "Name of directory or file."
          }
        },
        "required": [
          "name"
        ],
        "additionalProperties": {},
        "example": {
          "size": 1523,
          "isDirectory": true,
          "name": "Main.java"
        },
        "description": "VcsContents"
      },
      "x-example": "",
      "description": "List of contents."
    }
  },
  "required": [
    "total",
    "contents"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "contents": ""
  },
  "description": "VCS Content List"
} as const;

export const VcsContentListSchema = z.fromJSONSchema(VcsContentListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type VcsContentList = z.infer<typeof VcsContentListSchema>;
