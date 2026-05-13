// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const BranchListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of branches that matched your query."
    },
    "branches": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "x-example": "main",
            "description": "Branch Name."
          }
        },
        "required": [
          "name"
        ],
        "additionalProperties": {},
        "example": {
          "name": "main"
        },
        "description": "Branch"
      },
      "x-example": "",
      "description": "List of branches."
    }
  },
  "required": [
    "total",
    "branches"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "branches": ""
  },
  "description": "Branches List"
} as const;

export const BranchListSchema = z.fromJSONSchema(BranchListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type BranchList = z.infer<typeof BranchListSchema>;
