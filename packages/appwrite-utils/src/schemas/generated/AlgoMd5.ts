// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const AlgoMd5JsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "x-example": "md5",
      "description": "Algo type."
    }
  },
  "required": [
    "type"
  ],
  "additionalProperties": {},
  "example": {
    "type": "md5"
  },
  "description": "AlgoMD5"
} as const;

export const AlgoMd5Schema = z.fromJSONSchema(AlgoMd5JsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type AlgoMd5 = z.infer<typeof AlgoMd5Schema>;
