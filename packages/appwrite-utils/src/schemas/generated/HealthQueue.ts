// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const HealthQueueJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "size": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 8,
      "description": "Amount of actions in the queue."
    }
  },
  "required": [
    "size"
  ],
  "additionalProperties": {},
  "example": {
    "size": 8
  },
  "description": "Health Queue"
} as const;

export const HealthQueueSchema = z.fromJSONSchema(HealthQueueJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type HealthQueue = z.infer<typeof HealthQueueSchema>;
