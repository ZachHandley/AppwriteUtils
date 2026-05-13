// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const HealthCertificateJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "x-example": "/CN=www.google.com",
      "description": "Certificate name"
    },
    "subjectSN": {
      "type": "string",
      "x-example": "",
      "description": "Subject SN"
    },
    "issuerOrganisation": {
      "type": "string",
      "x-example": "",
      "description": "Issuer organisation"
    },
    "validFrom": {
      "type": "string",
      "x-example": "1704200998",
      "description": "Valid from"
    },
    "validTo": {
      "type": "string",
      "x-example": "1711458597",
      "description": "Valid to"
    },
    "signatureTypeSN": {
      "type": "string",
      "x-example": "RSA-SHA256",
      "description": "Signature type SN"
    }
  },
  "required": [
    "name",
    "subjectSN",
    "issuerOrganisation",
    "validFrom",
    "validTo",
    "signatureTypeSN"
  ],
  "additionalProperties": {},
  "example": {
    "name": "/CN=www.google.com",
    "subjectSN": "",
    "issuerOrganisation": "",
    "validFrom": "1704200998",
    "validTo": "1711458597",
    "signatureTypeSN": "RSA-SHA256"
  },
  "description": "Health Certificate"
} as const;

export const HealthCertificateSchema = z.fromJSONSchema(HealthCertificateJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type HealthCertificate = z.infer<typeof HealthCertificateSchema>;
