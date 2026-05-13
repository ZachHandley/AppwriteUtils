// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const ErrorJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "message": {
      "type": "string",
      "x-example": "Not found",
      "description": "Error message."
    },
    "code": {
      "type": "string",
      "x-example": "404",
      "description": "Error code."
    },
    "type": {
      "type": "string",
      "x-example": "not_found",
      "description": "Error type. You can learn more about all the error types at https://appwrite.io/docs/error-codes#errorTypes"
    },
    "version": {
      "type": "string",
      "x-example": "1.0",
      "description": "Server version number."
    }
  },
  "required": [
    "message",
    "code",
    "type",
    "version"
  ],
  "additionalProperties": {},
  "example": {
    "message": "Not found",
    "code": "404",
    "type": "not_found",
    "version": "1.0"
  },
  "description": "Error"
} as const;

export const ErrorSchema = z.fromJSONSchema(ErrorJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Error = z.infer<typeof ErrorSchema>;
