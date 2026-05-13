// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const FileListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of files that matched your query."
    },
    "files": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "$id": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "File ID."
          },
          "bucketId": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "Bucket ID."
          },
          "$createdAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "File creation date in ISO 8601 format."
          },
          "$updatedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "File update date in ISO 8601 format."
          },
          "$permissions": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "x-example": [
              "read(\"any\")"
            ],
            "description": "File permissions. [Learn more about permissions](https://appwrite.io/docs/permissions)."
          },
          "name": {
            "type": "string",
            "x-example": "Pink.png",
            "description": "File name."
          },
          "signature": {
            "type": "string",
            "x-example": "5d529fd02b544198ae075bd57c1762bb",
            "description": "File MD5 signature."
          },
          "mimeType": {
            "type": "string",
            "x-example": "image/png",
            "description": "File mime type."
          },
          "sizeOriginal": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 17890,
            "description": "File original size in bytes."
          },
          "chunksTotal": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 17890,
            "description": "Total number of chunks available"
          },
          "chunksUploaded": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 17890,
            "description": "Total number of chunks uploaded"
          }
        },
        "required": [
          "$id",
          "bucketId",
          "$createdAt",
          "$updatedAt",
          "$permissions",
          "name",
          "signature",
          "mimeType",
          "sizeOriginal",
          "chunksTotal",
          "chunksUploaded"
        ],
        "additionalProperties": {},
        "example": {
          "$id": "5e5ea5c16897e",
          "bucketId": "5e5ea5c16897e",
          "$createdAt": "2020-10-15T06:38:00.000+00:00",
          "$updatedAt": "2020-10-15T06:38:00.000+00:00",
          "$permissions": [
            "read(\"any\")"
          ],
          "name": "Pink.png",
          "signature": "5d529fd02b544198ae075bd57c1762bb",
          "mimeType": "image/png",
          "sizeOriginal": 17890,
          "chunksTotal": 17890,
          "chunksUploaded": 17890
        },
        "description": "File"
      },
      "x-example": "",
      "description": "List of files."
    }
  },
  "required": [
    "total",
    "files"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "files": ""
  },
  "description": "Files List"
} as const;

export const FileListSchema = z.fromJSONSchema(FileListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type FileList = z.infer<typeof FileListSchema>;
