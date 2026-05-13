// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const EmailTemplateJsonSchema = {
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
    },
    "senderName": {
      "type": "string",
      "x-example": "My User",
      "description": "Name of the sender"
    },
    "senderEmail": {
      "type": "string",
      "x-example": "mail@appwrite.io",
      "description": "Email of the sender"
    },
    "replyTo": {
      "type": "string",
      "x-example": "emails@appwrite.io",
      "description": "Reply to email address"
    },
    "subject": {
      "type": "string",
      "x-example": "Please verify your email address",
      "description": "Email subject"
    }
  },
  "required": [
    "type",
    "locale",
    "message",
    "senderName",
    "senderEmail",
    "replyTo",
    "subject"
  ],
  "additionalProperties": {},
  "example": {
    "type": "verification",
    "locale": "en_us",
    "message": "Click on the link to verify your account.",
    "senderName": "My User",
    "senderEmail": "mail@appwrite.io",
    "replyTo": "emails@appwrite.io",
    "subject": "Please verify your email address"
  },
  "description": "EmailTemplate"
} as const;

export const EmailTemplateSchema = z.fromJSONSchema(EmailTemplateJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type EmailTemplate = z.infer<typeof EmailTemplateSchema>;
