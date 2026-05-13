// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const AlgoArgon2JsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "x-example": "argon2",
      "description": "Algo type."
    },
    "memoryCost": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 65536,
      "description": "Memory used to compute hash."
    },
    "timeCost": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 4,
      "description": "Amount of time consumed to compute hash"
    },
    "threads": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 3,
      "description": "Number of threads used to compute hash."
    }
  },
  "required": [
    "type",
    "memoryCost",
    "timeCost",
    "threads"
  ],
  "additionalProperties": {},
  "example": {
    "type": "argon2",
    "memoryCost": 65536,
    "timeCost": 4,
    "threads": 3
  },
  "description": "AlgoArgon2"
} as const;

export const AlgoArgon2Schema = z.fromJSONSchema(AlgoArgon2JsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type AlgoArgon2 = z.infer<typeof AlgoArgon2Schema>;
