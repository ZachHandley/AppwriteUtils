// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const SmsTemplateJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "x-example": "verification",
      "description": "Template type"
    },
    "locale": {
      "type": "string",
      "x-example": "en_us",
      "description": "Template locale"
    },
    "message": {
      "type": "string",
      "x-example": "Click on the link to verify your account.",
      "description": "Template message"
    }
  },
  "required": [
    "type",
    "locale",
    "message"
  ],
  "additionalProperties": {},
  "example": {
    "type": "verification",
    "locale": "en_us",
    "message": "Click on the link to verify your account."
  },
  "description": "SmsTemplate"
} as const;

export const SmsTemplateSchema = z.fromJSONSchema(SmsTemplateJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type SmsTemplate = z.infer<typeof SmsTemplateSchema>;
