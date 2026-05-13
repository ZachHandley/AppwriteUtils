// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const DeploymentListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of deployments that matched your query."
    },
    "deployments": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "$id": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "Deployment ID."
          },
          "$createdAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Deployment creation date in ISO 8601 format."
          },
          "$updatedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Deployment update date in ISO 8601 format."
          },
          "type": {
            "type": "string",
            "x-example": "vcs",
            "description": "Type of deployment."
          },
          "resourceId": {
            "type": "string",
            "x-example": "5e5ea6g16897e",
            "description": "Resource ID."
          },
          "resourceType": {
            "type": "string",
            "x-example": "functions",
            "description": "Resource type."
          },
          "entrypoint": {
            "type": "string",
            "x-example": "index.js",
            "description": "The entrypoint file to use to execute the deployment code."
          },
          "sourceSize": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 128,
            "description": "The code size in bytes."
          },
          "buildSize": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 128,
            "description": "The build output size in bytes."
          },
          "totalSize": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 128,
            "description": "The total size in bytes (source and build output)."
          },
          "buildId": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "The current build ID."
          },
          "activate": {
            "type": "boolean",
            "x-example": true,
            "description": "Whether the deployment should be automatically activated."
          },
          "screenshotLight": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "Screenshot with light theme preference file ID."
          },
          "screenshotDark": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "Screenshot with dark theme preference file ID."
          },
          "status": {
            "type": "string",
            "enum": [
              "waiting",
              "processing",
              "building",
              "ready",
              "failed"
            ],
            "x-example": "ready",
            "description": "The deployment status. Possible values are \"waiting\", \"processing\", \"building\", \"ready\", and \"failed\"."
          },
          "buildLogs": {
            "type": "string",
            "x-example": "Compiling source files...",
            "description": "The build logs."
          },
          "buildDuration": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 128,
            "description": "The current build time in seconds."
          },
          "providerRepositoryName": {
            "type": "string",
            "x-example": "database",
            "description": "The name of the vcs provider repository"
          },
          "providerRepositoryOwner": {
            "type": "string",
            "x-example": "utopia",
            "description": "The name of the vcs provider repository owner"
          },
          "providerRepositoryUrl": {
            "type": "string",
            "x-example": "https://github.com/vermakhushboo/g4-node-function",
            "description": "The url of the vcs provider repository"
          },
          "providerCommitHash": {
            "type": "string",
            "x-example": "7c3f25d",
            "description": "The commit hash of the vcs commit"
          },
          "providerCommitAuthorUrl": {
            "type": "string",
            "x-example": "https://github.com/vermakhushboo",
            "description": "The url of vcs commit author"
          },
          "providerCommitAuthor": {
            "type": "string",
            "x-example": "Khushboo Verma",
            "description": "The name of vcs commit author"
          },
          "providerCommitMessage": {
            "type": "string",
            "x-example": "Update index.js",
            "description": "The commit message"
          },
          "providerCommitUrl": {
            "type": "string",
            "x-example": "https://github.com/vermakhushboo/g4-node-function/commit/60c0416257a9cbcdd96b2d370c38d8f8d150ccfb",
            "description": "The url of the vcs commit"
          },
          "providerBranch": {
            "type": "string",
            "x-example": "0.7.x",
            "description": "The branch of the vcs repository"
          },
          "providerBranchUrl": {
            "type": "string",
            "x-example": "https://github.com/vermakhushboo/appwrite/tree/0.7.x",
            "description": "The branch of the vcs repository"
          }
        },
        "required": [
          "$id",
          "$createdAt",
          "$updatedAt",
          "type",
          "resourceId",
          "resourceType",
          "entrypoint",
          "sourceSize",
          "buildSize",
          "totalSize",
          "buildId",
          "activate",
          "screenshotLight",
          "screenshotDark",
          "status",
          "buildLogs",
          "buildDuration",
          "providerRepositoryName",
          "providerRepositoryOwner",
          "providerRepositoryUrl",
          "providerCommitHash",
          "providerCommitAuthorUrl",
          "providerCommitAuthor",
          "providerCommitMessage",
          "providerCommitUrl",
          "providerBranch",
          "providerBranchUrl"
        ],
        "additionalProperties": {},
        "example": {
          "$id": "5e5ea5c16897e",
          "$createdAt": "2020-10-15T06:38:00.000+00:00",
          "$updatedAt": "2020-10-15T06:38:00.000+00:00",
          "type": "vcs",
          "resourceId": "5e5ea6g16897e",
          "resourceType": "functions",
          "entrypoint": "index.js",
          "sourceSize": 128,
          "buildSize": 128,
          "totalSize": 128,
          "buildId": "5e5ea5c16897e",
          "activate": true,
          "screenshotLight": "5e5ea5c16897e",
          "screenshotDark": "5e5ea5c16897e",
          "status": "ready",
          "buildLogs": "Compiling source files...",
          "buildDuration": 128,
          "providerRepositoryName": "database",
          "providerRepositoryOwner": "utopia",
          "providerRepositoryUrl": "https://github.com/vermakhushboo/g4-node-function",
          "providerCommitHash": "7c3f25d",
          "providerCommitAuthorUrl": "https://github.com/vermakhushboo",
          "providerCommitAuthor": "Khushboo Verma",
          "providerCommitMessage": "Update index.js",
          "providerCommitUrl": "https://github.com/vermakhushboo/g4-node-function/commit/60c0416257a9cbcdd96b2d370c38d8f8d150ccfb",
          "providerBranch": "0.7.x",
          "providerBranchUrl": "https://github.com/vermakhushboo/appwrite/tree/0.7.x"
        },
        "description": "Deployment"
      },
      "x-example": "",
      "description": "List of deployments."
    }
  },
  "required": [
    "total",
    "deployments"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "deployments": ""
  },
  "description": "Deployments List"
} as const;

export const DeploymentListSchema = z.fromJSONSchema(DeploymentListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type DeploymentList = z.infer<typeof DeploymentListSchema>;
