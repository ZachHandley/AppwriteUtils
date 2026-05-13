// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const HealthAntivirusJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "version": {
      "type": "string",
      "x-example": "1.0.0",
      "description": "Antivirus version."
    },
    "status": {
      "type": "string",
      "enum": [
        "disabled",
        "offline",
        "online"
      ],
      "x-example": "online",
      "description": "Antivirus status. Possible values are: `disabled`, `offline`, `online`"
    }
  },
  "required": [
    "version",
    "status"
  ],
  "additionalProperties": {},
  "example": {
    "version": "1.0.0",
    "status": "online"
  },
  "description": "Health Antivirus"
} as const;

export const HealthAntivirusSchema = z.fromJSONSchema(HealthAntivirusJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type HealthAntivirus = z.infer<typeof HealthAntivirusSchema>;
