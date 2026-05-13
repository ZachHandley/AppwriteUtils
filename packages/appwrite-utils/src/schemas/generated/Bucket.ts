// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const BucketJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "$id": {
      "type": "string",
      "x-example": "5e5ea5c16897e",
      "description": "Bucket ID."
    },
    "$createdAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Bucket creation time in ISO 8601 format."
    },
    "$updatedAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Bucket update date in ISO 8601 format."
    },
    "$permissions": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "x-example": [
        "read(\"any\")"
      ],
      "description": "Bucket permissions. [Learn more about permissions](https://appwrite.io/docs/permissions)."
    },
    "fileSecurity": {
      "type": "boolean",
      "x-example": true,
      "description": "Whether file-level security is enabled. [Learn more about permissions](https://appwrite.io/docs/permissions)."
    },
    "name": {
      "type": "string",
      "x-example": "Documents",
      "description": "Bucket name."
    },
    "enabled": {
      "type": "boolean",
      "x-example": false,
      "description": "Bucket enabled."
    },
    "maximumFileSize": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 100,
      "description": "Maximum file size supported."
    },
    "allowedFileExtensions": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "x-example": [
        "jpg",
        "png"
      ],
      "description": "Allowed file extensions."
    },
    "compression": {
      "type": "string",
      "x-example": "gzip",
      "description": "Compression algorithm choosen for compression. Will be one of none, [gzip](https://en.wikipedia.org/wiki/Gzip), or [zstd](https://en.wikipedia.org/wiki/Zstd)."
    },
    "encryption": {
      "type": "boolean",
      "x-example": false,
      "description": "Bucket is encrypted."
    },
    "antivirus": {
      "type": "boolean",
      "x-example": false,
      "description": "Virus scanning is enabled."
    },
    "transformations": {
      "type": "boolean",
      "x-example": false,
      "description": "Image transformations are enabled."
    }
  },
  "required": [
    "$id",
    "$createdAt",
    "$updatedAt",
    "$permissions",
    "fileSecurity",
    "name",
    "enabled",
    "maximumFileSize",
    "allowedFileExtensions",
    "compression",
    "encryption",
    "antivirus",
    "transformations"
  ],
  "additionalProperties": {},
  "example": {
    "$id": "5e5ea5c16897e",
    "$createdAt": "2020-10-15T06:38:00.000+00:00",
    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
    "$permissions": [
      "read(\"any\")"
    ],
    "fileSecurity": true,
    "name": "Documents",
    "enabled": false,
    "maximumFileSize": 100,
    "allowedFileExtensions": [
      "jpg",
      "png"
    ],
    "compression": "gzip",
    "encryption": false,
    "antivirus": false,
    "transformations": false
  },
  "description": "Bucket"
} as const;

export const BucketSchema = z.fromJSONSchema(BucketJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Bucket = z.infer<typeof BucketSchema>;
