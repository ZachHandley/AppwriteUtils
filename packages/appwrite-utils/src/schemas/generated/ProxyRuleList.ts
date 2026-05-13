// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const ProxyRuleListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of rules that matched your query."
    },
    "rules": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "$id": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "Rule ID."
          },
          "$createdAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Rule creation date in ISO 8601 format."
          },
          "$updatedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Rule update date in ISO 8601 format."
          },
          "domain": {
            "type": "string",
            "x-example": "appwrite.company.com",
            "description": "Domain name."
          },
          "type": {
            "type": "string",
            "x-example": "deployment",
            "description": "Action definition for the rule. Possible values are \"api\", \"deployment\", or \"redirect\""
          },
          "trigger": {
            "type": "string",
            "x-example": "manual",
            "description": "Defines how the rule was created. Possible values are \"manual\" or \"deployment\""
          },
          "redirectUrl": {
            "type": "string",
            "x-example": "https://appwrite.io/docs",
            "description": "URL to redirect to. Used if type is \"redirect\""
          },
          "redirectStatusCode": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 301,
            "description": "Status code to apply during redirect. Used if type is \"redirect\""
          },
          "deploymentId": {
            "type": "string",
            "x-example": "n3u9feiwmf",
            "description": "ID of deployment. Used if type is \"deployment\""
          },
          "deploymentResourceType": {
            "type": "string",
            "enum": [
              "function",
              "site"
            ],
            "x-example": "function",
            "description": "Type of deployment. Possible values are \"function\", \"site\". Used if rule's type is \"deployment\"."
          },
          "deploymentResourceId": {
            "type": "string",
            "x-example": "n3u9feiwmf",
            "description": "ID deployment's resource. Used if type is \"deployment\""
          },
          "deploymentVcsProviderBranch": {
            "type": "string",
            "x-example": "main",
            "description": "Name of Git branch that updates rule. Used if type is \"deployment\""
          },
          "status": {
            "type": "string",
            "enum": [
              "created",
              "verifying",
              "verified",
              "unverified"
            ],
            "x-example": "verified",
            "description": "Domain verification status. Possible values are \"created\", \"verifying\", \"verified\" and \"unverified\""
          },
          "logs": {
            "type": "string",
            "x-example": "Verification of DNS records failed with DNS resolver 8.8.8.8. Domain stage.myapp.com does not have DNS record.",
            "description": "Logs from rule verification or certificate generation. Certificate generation logs are prioritized if both are available."
          },
          "renewAt": {
            "type": "string",
            "x-example": "datetime",
            "description": "Certificate auto-renewal date in ISO 8601 format."
          }
        },
        "required": [
          "$id",
          "$createdAt",
          "$updatedAt",
          "domain",
          "type",
          "trigger",
          "redirectUrl",
          "redirectStatusCode",
          "deploymentId",
          "deploymentResourceType",
          "deploymentResourceId",
          "deploymentVcsProviderBranch",
          "status",
          "logs",
          "renewAt"
        ],
        "additionalProperties": {},
        "example": {
          "$id": "5e5ea5c16897e",
          "$createdAt": "2020-10-15T06:38:00.000+00:00",
          "$updatedAt": "2020-10-15T06:38:00.000+00:00",
          "domain": "appwrite.company.com",
          "type": "deployment",
          "trigger": "manual",
          "redirectUrl": "https://appwrite.io/docs",
          "redirectStatusCode": 301,
          "deploymentId": "n3u9feiwmf",
          "deploymentResourceType": "function",
          "deploymentResourceId": "n3u9feiwmf",
          "deploymentVcsProviderBranch": "main",
          "status": "verified",
          "logs": "Verification of DNS records failed with DNS resolver 8.8.8.8. Domain stage.myapp.com does not have DNS record.",
          "renewAt": "datetime"
        },
        "description": "Rule"
      },
      "x-example": "",
      "description": "List of rules."
    }
  },
  "required": [
    "total",
    "rules"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "rules": ""
  },
  "description": "Rule List"
} as const;

export const ProxyRuleListSchema = z.fromJSONSchema(ProxyRuleListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type ProxyRuleList = z.infer<typeof ProxyRuleListSchema>;
