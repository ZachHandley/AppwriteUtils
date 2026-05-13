// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const HealthTimeJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "remoteTime": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 1639490751,
      "description": "Current unix timestamp on trustful remote server."
    },
    "localTime": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 1639490844,
      "description": "Current unix timestamp of local server where Appwrite runs."
    },
    "diff": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 93,
      "description": "Difference of unix remote and local timestamps in milliseconds."
    }
  },
  "required": [
    "remoteTime",
    "localTime",
    "diff"
  ],
  "additionalProperties": {},
  "example": {
    "remoteTime": 1639490751,
    "localTime": 1639490844,
    "diff": 93
  },
  "description": "Health Time"
} as const;

export const HealthTimeSchema = z.fromJSONSchema(HealthTimeJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type HealthTime = z.infer<typeof HealthTimeSchema>;
