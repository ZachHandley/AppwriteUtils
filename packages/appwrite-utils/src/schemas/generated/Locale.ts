// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const LocaleJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "ip": {
      "type": "string",
      "x-example": "127.0.0.1",
      "description": "User IP address."
    },
    "countryCode": {
      "type": "string",
      "x-example": "US",
      "description": "Country code in [ISO 3166-1](http://en.wikipedia.org/wiki/ISO_3166-1) two-character format"
    },
    "country": {
      "type": "string",
      "x-example": "United States",
      "description": "Country name. This field support localization."
    },
    "continentCode": {
      "type": "string",
      "x-example": "NA",
      "description": "Continent code. A two character continent code \"AF\" for Africa, \"AN\" for Antarctica, \"AS\" for Asia, \"EU\" for Europe, \"NA\" for North America, \"OC\" for Oceania, and \"SA\" for South America."
    },
    "continent": {
      "type": "string",
      "x-example": "North America",
      "description": "Continent name. This field support localization."
    },
    "eu": {
      "type": "boolean",
      "x-example": false,
      "description": "True if country is part of the European Union."
    },
    "currency": {
      "type": "string",
      "x-example": "USD",
      "description": "Currency code in [ISO 4217-1](http://en.wikipedia.org/wiki/ISO_4217) three-character format"
    }
  },
  "required": [
    "ip",
    "countryCode",
    "country",
    "continentCode",
    "continent",
    "eu",
    "currency"
  ],
  "additionalProperties": {},
  "example": {
    "ip": "127.0.0.1",
    "countryCode": "US",
    "country": "United States",
    "continentCode": "NA",
    "continent": "North America",
    "eu": false,
    "currency": "USD"
  },
  "description": "Locale"
} as const;

export const LocaleSchema = z.fromJSONSchema(LocaleJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Locale = z.infer<typeof LocaleSchema>;
