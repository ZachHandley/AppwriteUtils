// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const AlgoBcryptJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "x-example": "bcrypt",
      "description": "Algo type."
    }
  },
  "required": [
    "type"
  ],
  "additionalProperties": {},
  "example": {
    "type": "bcrypt"
  },
  "description": "AlgoBcrypt"
} as const;

export const AlgoBcryptSchema = z.fromJSONSchema(AlgoBcryptJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type AlgoBcrypt = z.infer<typeof AlgoBcryptSchema>;
