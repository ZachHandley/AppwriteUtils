// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const UsageBucketsJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "range": {
      "type": "string",
      "x-example": "30d",
      "description": "Time range of the usage stats."
    },
    "filesTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated number of bucket files."
    },
    "filesStorageTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated number of bucket files storage (in bytes)."
    },
    "files": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "value": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 1,
            "description": "The value of this metric at the timestamp."
          },
          "date": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "The date at which this metric was aggregated in ISO 8601 format."
          }
        },
        "required": [
          "value",
          "date"
        ],
        "additionalProperties": {},
        "example": {
          "value": 1,
          "date": "2020-10-15T06:38:00.000+00:00"
        },
        "description": "Metric"
      },
      "x-example": [],
      "description": "Aggregated  number of bucket files per period."
    },
    "storage": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "value": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 1,
            "description": "The value of this metric at the timestamp."
          },
          "date": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "The date at which this metric was aggregated in ISO 8601 format."
          }
        },
        "required": [
          "value",
          "date"
        ],
        "additionalProperties": {},
        "example": {
          "value": 1,
          "date": "2020-10-15T06:38:00.000+00:00"
        },
        "description": "Metric"
      },
      "x-example": [],
      "description": "Aggregated  number of bucket storage files (in bytes) per period."
    },
    "imageTransformations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "value": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 1,
            "description": "The value of this metric at the timestamp."
          },
          "date": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "The date at which this metric was aggregated in ISO 8601 format."
          }
        },
        "required": [
          "value",
          "date"
        ],
        "additionalProperties": {},
        "example": {
          "value": 1,
          "date": "2020-10-15T06:38:00.000+00:00"
        },
        "description": "Metric"
      },
      "x-example": [],
      "description": "Aggregated number of files transformations per period."
    },
    "imageTransformationsTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated number of files transformations."
    }
  },
  "required": [
    "range",
    "filesTotal",
    "filesStorageTotal",
    "files",
    "storage",
    "imageTransformations",
    "imageTransformationsTotal"
  ],
  "additionalProperties": {},
  "example": {
    "range": "30d",
    "filesTotal": 0,
    "filesStorageTotal": 0,
    "files": [],
    "storage": [],
    "imageTransformations": [],
    "imageTransformationsTotal": 0
  },
  "description": "UsageBuckets"
} as const;

export const UsageBucketsSchema = z.fromJSONSchema(UsageBucketsJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type UsageBuckets = z.infer<typeof UsageBucketsSchema>;
