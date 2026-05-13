// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const AlgoPhpassJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "x-example": "phpass",
      "description": "Algo type."
    }
  },
  "required": [
    "type"
  ],
  "additionalProperties": {},
  "example": {
    "type": "phpass"
  },
  "description": "AlgoPHPass"
} as const;

export const AlgoPhpassSchema = z.fromJSONSchema(AlgoPhpassJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type AlgoPhpass = z.infer<typeof AlgoPhpassSchema>;
