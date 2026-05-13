// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const AnyJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {},
  "additionalProperties": {},
  "example": [],
  "description": "Any"
} as const;

export const AnySchema = z.fromJSONSchema(AnyJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Any = z.infer<typeof AnySchema>;
