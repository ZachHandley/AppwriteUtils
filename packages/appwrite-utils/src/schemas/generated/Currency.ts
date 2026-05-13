// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const CurrencyJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "symbol": {
      "type": "string",
      "x-example": "$",
      "description": "Currency symbol."
    },
    "name": {
      "type": "string",
      "x-example": "US dollar",
      "description": "Currency name."
    },
    "symbolNative": {
      "type": "string",
      "x-example": "$",
      "description": "Currency native symbol."
    },
    "decimalDigits": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 2,
      "description": "Number of decimal digits."
    },
    "rounding": {
      "type": "number",
      "x-example": 0,
      "description": "Currency digit rounding."
    },
    "code": {
      "type": "string",
      "x-example": "USD",
      "description": "Currency code in [ISO 4217-1](http://en.wikipedia.org/wiki/ISO_4217) three-character format."
    },
    "namePlural": {
      "type": "string",
      "x-example": "US dollars",
      "description": "Currency plural name"
    }
  },
  "required": [
    "symbol",
    "name",
    "symbolNative",
    "decimalDigits",
    "rounding",
    "code",
    "namePlural"
  ],
  "additionalProperties": {},
  "example": {
    "symbol": "$",
    "name": "US dollar",
    "symbolNative": "$",
    "decimalDigits": 2,
    "rounding": 0,
    "code": "USD",
    "namePlural": "US dollars"
  },
  "description": "Currency"
} as const;

export const CurrencySchema = z.fromJSONSchema(CurrencyJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Currency = z.infer<typeof CurrencySchema>;
