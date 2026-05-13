// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const ConsoleVariablesJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "_APP_DOMAIN_TARGET_CNAME": {
      "type": "string",
      "x-example": "appwrite.io",
      "description": "CNAME target for your Appwrite custom domains."
    },
    "_APP_DOMAIN_TARGET_A": {
      "type": "string",
      "x-example": "127.0.0.1",
      "description": "A target for your Appwrite custom domains."
    },
    "_APP_COMPUTE_BUILD_TIMEOUT": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 900,
      "description": "Maximum build timeout in seconds."
    },
    "_APP_DOMAIN_TARGET_AAAA": {
      "type": "string",
      "x-example": "::1",
      "description": "AAAA target for your Appwrite custom domains."
    },
    "_APP_DOMAIN_TARGET_CAA": {
      "type": "string",
      "x-example": "digicert.com",
      "description": "CAA target for your Appwrite custom domains."
    },
    "_APP_STORAGE_LIMIT": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": "30000000",
      "description": "Maximum file size allowed for file upload in bytes."
    },
    "_APP_COMPUTE_SIZE_LIMIT": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": "30000000",
      "description": "Maximum file size allowed for deployment in bytes."
    },
    "_APP_USAGE_STATS": {
      "type": "string",
      "x-example": "enabled",
      "description": "Defines if usage stats are enabled. This value is set to 'enabled' by default, to disable the usage stats set the value to 'disabled'."
    },
    "_APP_VCS_ENABLED": {
      "type": "boolean",
      "x-example": true,
      "description": "Defines if VCS (Version Control System) is enabled."
    },
    "_APP_DOMAIN_ENABLED": {
      "type": "boolean",
      "x-example": true,
      "description": "Defines if main domain is configured. If so, custom domains can be created."
    },
    "_APP_ASSISTANT_ENABLED": {
      "type": "boolean",
      "x-example": true,
      "description": "Defines if AI assistant is enabled."
    },
    "_APP_DOMAIN_SITES": {
      "type": "string",
      "x-example": "sites.localhost",
      "description": "A domain to use for site URLs."
    },
    "_APP_DOMAIN_FUNCTIONS": {
      "type": "string",
      "x-example": "functions.localhost",
      "description": "A domain to use for function URLs."
    },
    "_APP_OPTIONS_FORCE_HTTPS": {
      "type": "string",
      "x-example": "enabled",
      "description": "Defines if HTTPS is enforced for all requests."
    },
    "_APP_DOMAINS_NAMESERVERS": {
      "type": "string",
      "x-example": "ns1.example.com,ns2.example.com",
      "description": "Comma-separated list of nameservers."
    }
  },
  "required": [
    "_APP_DOMAIN_TARGET_CNAME",
    "_APP_DOMAIN_TARGET_A",
    "_APP_COMPUTE_BUILD_TIMEOUT",
    "_APP_DOMAIN_TARGET_AAAA",
    "_APP_DOMAIN_TARGET_CAA",
    "_APP_STORAGE_LIMIT",
    "_APP_COMPUTE_SIZE_LIMIT",
    "_APP_USAGE_STATS",
    "_APP_VCS_ENABLED",
    "_APP_DOMAIN_ENABLED",
    "_APP_ASSISTANT_ENABLED",
    "_APP_DOMAIN_SITES",
    "_APP_DOMAIN_FUNCTIONS",
    "_APP_OPTIONS_FORCE_HTTPS",
    "_APP_DOMAINS_NAMESERVERS"
  ],
  "additionalProperties": {},
  "example": {
    "_APP_DOMAIN_TARGET_CNAME": "appwrite.io",
    "_APP_DOMAIN_TARGET_A": "127.0.0.1",
    "_APP_COMPUTE_BUILD_TIMEOUT": 900,
    "_APP_DOMAIN_TARGET_AAAA": "::1",
    "_APP_DOMAIN_TARGET_CAA": "digicert.com",
    "_APP_STORAGE_LIMIT": "30000000",
    "_APP_COMPUTE_SIZE_LIMIT": "30000000",
    "_APP_USAGE_STATS": "enabled",
    "_APP_VCS_ENABLED": true,
    "_APP_DOMAIN_ENABLED": true,
    "_APP_ASSISTANT_ENABLED": true,
    "_APP_DOMAIN_SITES": "sites.localhost",
    "_APP_DOMAIN_FUNCTIONS": "functions.localhost",
    "_APP_OPTIONS_FORCE_HTTPS": "enabled",
    "_APP_DOMAINS_NAMESERVERS": "ns1.example.com,ns2.example.com"
  },
  "description": "Console Variables"
} as const;

export const ConsoleVariablesSchema = z.fromJSONSchema(ConsoleVariablesJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type ConsoleVariables = z.infer<typeof ConsoleVariablesSchema>;
