// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const AlgoScryptModifiedJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "x-example": "scryptMod",
      "description": "Algo type."
    },
    "salt": {
      "type": "string",
      "x-example": "UxLMreBr6tYyjQ==",
      "description": "Salt used to compute hash."
    },
    "saltSeparator": {
      "type": "string",
      "x-example": "Bw==",
      "description": "Separator used to compute hash."
    },
    "signerKey": {
      "type": "string",
      "x-example": "XyEKE9RcTDeLEsL/RjwPDBv/RqDl8fb3gpYEOQaPihbxf1ZAtSOHCjuAAa7Q3oHpCYhXSN9tizHgVOwn6krflQ==",
      "description": "Key used to compute hash."
    }
  },
  "required": [
    "type",
    "salt",
    "saltSeparator",
    "signerKey"
  ],
  "additionalProperties": {},
  "example": {
    "type": "scryptMod",
    "salt": "UxLMreBr6tYyjQ==",
    "saltSeparator": "Bw==",
    "signerKey": "XyEKE9RcTDeLEsL/RjwPDBv/RqDl8fb3gpYEOQaPihbxf1ZAtSOHCjuAAa7Q3oHpCYhXSN9tizHgVOwn6krflQ=="
  },
  "description": "AlgoScryptModified"
} as const;

export const AlgoScryptModifiedSchema = z.fromJSONSchema(AlgoScryptModifiedJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type AlgoScryptModified = z.infer<typeof AlgoScryptModifiedSchema>;
