// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const MetricJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
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
} as const;

export const MetricSchema = z.fromJSONSchema(MetricJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Metric = z.infer<typeof MetricSchema>;
