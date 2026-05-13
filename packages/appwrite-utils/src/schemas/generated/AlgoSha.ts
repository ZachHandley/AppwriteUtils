// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const AlgoShaJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "x-example": "sha",
      "description": "Algo type."
    }
  },
  "required": [
    "type"
  ],
  "additionalProperties": {},
  "example": {
    "type": "sha"
  },
  "description": "AlgoSHA"
} as const;

export const AlgoShaSchema = z.fromJSONSchema(AlgoShaJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type AlgoSha = z.infer<typeof AlgoShaSchema>;
