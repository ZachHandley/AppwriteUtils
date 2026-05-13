// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const SpecificationJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "memory": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 512,
      "description": "Memory size in MB."
    },
    "cpus": {
      "type": "number",
      "x-example": 1,
      "description": "Number of CPUs."
    },
    "enabled": {
      "type": "boolean",
      "x-example": true,
      "description": "Is size enabled."
    },
    "slug": {
      "type": "string",
      "x-example": "s-1vcpu-512mb",
      "description": "Size slug."
    }
  },
  "required": [
    "memory",
    "cpus",
    "enabled",
    "slug"
  ],
  "additionalProperties": {},
  "example": {
    "memory": 512,
    "cpus": 1,
    "enabled": true,
    "slug": "s-1vcpu-512mb"
  },
  "description": "Specification"
} as const;

export const SpecificationSchema = z.fromJSONSchema(SpecificationJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Specification = z.infer<typeof SpecificationSchema>;
