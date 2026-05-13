// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const BranchJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "x-example": "main",
      "description": "Branch Name."
    }
  },
  "required": [
    "name"
  ],
  "additionalProperties": {},
  "example": {
    "name": "main"
  },
  "description": "Branch"
} as const;

export const BranchSchema = z.fromJSONSchema(BranchJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Branch = z.infer<typeof BranchSchema>;
