// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const HealthStatusJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "x-example": "database",
      "description": "Name of the service."
    },
    "ping": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 128,
      "description": "Duration in milliseconds how long the health check took."
    },
    "status": {
      "type": "string",
      "enum": [
        "pass",
        "fail"
      ],
      "x-example": "pass",
      "x-enum-name": "HealthCheckStatus",
      "description": "Service status. Possible values are: `pass`, `fail`"
    }
  },
  "required": [
    "name",
    "ping",
    "status"
  ],
  "additionalProperties": {},
  "example": {
    "name": "database",
    "ping": 128,
    "status": "pass"
  },
  "description": "Health Status"
} as const;

export const HealthStatusSchema = z.fromJSONSchema(HealthStatusJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;
