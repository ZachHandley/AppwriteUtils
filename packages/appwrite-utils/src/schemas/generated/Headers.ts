// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const HeadersJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "x-example": "Content-Type",
      "description": "Header name."
    },
    "value": {
      "type": "string",
      "x-example": "application/json",
      "description": "Header value."
    }
  },
  "required": [
    "name",
    "value"
  ],
  "additionalProperties": {},
  "example": {
    "name": "Content-Type",
    "value": "application/json"
  },
  "description": "Headers"
} as const;

export const HeadersSchema = z.fromJSONSchema(HeadersJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Headers = z.infer<typeof HeadersSchema>;
