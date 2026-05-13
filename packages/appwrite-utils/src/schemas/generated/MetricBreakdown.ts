// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const MetricBreakdownJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "resourceId": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "x-example": "5e5ea5c16897e",
      "description": "Resource ID."
    },
    "name": {
      "type": "string",
      "x-example": "Documents",
      "description": "Resource name."
    },
    "value": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 1,
      "description": "The value of this metric at the timestamp."
    },
    "estimate": {
      "anyOf": [
        {
          "type": "number"
        },
        {
          "type": "null"
        }
      ],
      "x-example": 1,
      "description": "The estimated value of this metric at the end of the period."
    }
  },
  "required": [
    "name",
    "value"
  ],
  "additionalProperties": {},
  "example": {
    "resourceId": "5e5ea5c16897e",
    "name": "Documents",
    "value": 1,
    "estimate": 1
  },
  "description": "Metric Breakdown"
} as const;

export const MetricBreakdownSchema = z.fromJSONSchema(MetricBreakdownJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type MetricBreakdown = z.infer<typeof MetricBreakdownSchema>;
