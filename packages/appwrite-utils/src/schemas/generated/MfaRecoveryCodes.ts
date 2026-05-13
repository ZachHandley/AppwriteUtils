// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const MfaRecoveryCodesJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "recoveryCodes": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "x-example": [
        "a3kf0-s0cl2",
        "s0co1-as98s"
      ],
      "description": "Recovery codes."
    }
  },
  "required": [
    "recoveryCodes"
  ],
  "additionalProperties": {},
  "example": {
    "recoveryCodes": [
      "a3kf0-s0cl2",
      "s0co1-as98s"
    ]
  },
  "description": "MFA Recovery Codes"
} as const;

export const MfaRecoveryCodesSchema = z.fromJSONSchema(MfaRecoveryCodesJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type MfaRecoveryCodes = z.infer<typeof MfaRecoveryCodesSchema>;
