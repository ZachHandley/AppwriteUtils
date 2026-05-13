// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const MockNumberJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "phone": {
      "type": "string",
      "x-example": "+1612842323",
      "description": "Mock phone number for testing phone authentication. Useful for testing phone authentication without sending an SMS."
    },
    "otp": {
      "type": "string",
      "x-example": "123456",
      "description": "Mock OTP for the number. "
    }
  },
  "required": [
    "phone",
    "otp"
  ],
  "additionalProperties": {},
  "example": {
    "phone": "+1612842323",
    "otp": "123456"
  },
  "description": "Mock Number"
} as const;

export const MockNumberSchema = z.fromJSONSchema(MockNumberJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type MockNumber = z.infer<typeof MockNumberSchema>;
