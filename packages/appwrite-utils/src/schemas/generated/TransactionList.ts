// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const TransactionListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of transactions that matched your query."
    },
    "transactions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "$id": {
            "type": "string",
            "x-example": "259125845563242502",
            "description": "Transaction ID."
          },
          "$createdAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Transaction creation time in ISO 8601 format."
          },
          "$updatedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Transaction update date in ISO 8601 format."
          },
          "status": {
            "type": "string",
            "x-example": "pending",
            "description": "Current status of the transaction. One of: pending, committing, committed, rolled_back, failed."
          },
          "operations": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 5,
            "description": "Number of operations in the transaction."
          },
          "expiresAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Expiration time in ISO 8601 format."
          }
        },
        "required": [
          "$id",
          "$createdAt",
          "$updatedAt",
          "status",
          "operations",
          "expiresAt"
        ],
        "additionalProperties": {},
        "example": {
          "$id": "259125845563242502",
          "$createdAt": "2020-10-15T06:38:00.000+00:00",
          "$updatedAt": "2020-10-15T06:38:00.000+00:00",
          "status": "pending",
          "operations": 5,
          "expiresAt": "2020-10-15T06:38:00.000+00:00"
        },
        "description": "Transaction"
      },
      "x-example": "",
      "description": "List of transactions."
    }
  },
  "required": [
    "total",
    "transactions"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "transactions": ""
  },
  "description": "Transaction List"
} as const;

export const TransactionListSchema = z.fromJSONSchema(TransactionListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type TransactionList = z.infer<typeof TransactionListSchema>;
