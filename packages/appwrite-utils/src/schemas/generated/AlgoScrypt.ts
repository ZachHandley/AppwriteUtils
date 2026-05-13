// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const AlgoScryptJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "x-example": "scrypt",
      "description": "Algo type."
    },
    "costCpu": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 8,
      "description": "CPU complexity of computed hash."
    },
    "costMemory": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 14,
      "description": "Memory complexity of computed hash."
    },
    "costParallel": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 1,
      "description": "Parallelization of computed hash."
    },
    "length": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 64,
      "description": "Length used to compute hash."
    }
  },
  "required": [
    "type",
    "costCpu",
    "costMemory",
    "costParallel",
    "length"
  ],
  "additionalProperties": {},
  "example": {
    "type": "scrypt",
    "costCpu": 8,
    "costMemory": 14,
    "costParallel": 1,
    "length": 64
  },
  "description": "AlgoScrypt"
} as const;

export const AlgoScryptSchema = z.fromJSONSchema(AlgoScryptJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type AlgoScrypt = z.infer<typeof AlgoScryptSchema>;
