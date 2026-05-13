// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const MfaFactorsJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "totp": {
      "type": "boolean",
      "x-example": true,
      "description": "Can TOTP be used for MFA challenge for this account."
    },
    "phone": {
      "type": "boolean",
      "x-example": true,
      "description": "Can phone (SMS) be used for MFA challenge for this account."
    },
    "email": {
      "type": "boolean",
      "x-example": true,
      "description": "Can email be used for MFA challenge for this account."
    },
    "recoveryCode": {
      "type": "boolean",
      "x-example": true,
      "description": "Can recovery code be used for MFA challenge for this account."
    }
  },
  "required": [
    "totp",
    "phone",
    "email",
    "recoveryCode"
  ],
  "additionalProperties": {},
  "example": {
    "totp": true,
    "phone": true,
    "email": true,
    "recoveryCode": true
  },
  "description": "MFAFactors"
} as const;

export const MfaFactorsSchema = z.fromJSONSchema(MfaFactorsJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type MfaFactors = z.infer<typeof MfaFactorsSchema>;
