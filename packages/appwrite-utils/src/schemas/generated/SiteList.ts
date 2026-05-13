// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const SiteListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of sites that matched your query."
    },
    "sites": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "$id": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "Site ID."
          },
          "$createdAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Site creation date in ISO 8601 format."
          },
          "$updatedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Site update date in ISO 8601 format."
          },
          "name": {
            "type": "string",
            "x-example": "My Site",
            "description": "Site name."
          },
          "enabled": {
            "type": "boolean",
            "x-example": false,
            "description": "Site enabled."
          },
          "live": {
            "type": "boolean",
            "x-example": false,
            "description": "Is the site deployed with the latest configuration? This is set to false if you've changed an environment variables, entrypoint, commands, or other settings that needs redeploy to be applied. When the value is false, redeploy the site to update it with the latest configuration."
          },
          "logging": {
            "type": "boolean",
            "x-example": false,
            "description": "When disabled, request logs will exclude logs and errors, and site responses will be slightly faster."
          },
          "framework": {
            "type": "string",
            "x-example": "react",
            "description": "Site framework."
          },
          "deploymentId": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "Site's active deployment ID."
          },
          "deploymentCreatedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Active deployment creation date in ISO 8601 format."
          },
          "deploymentScreenshotLight": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "Screenshot of active deployment with light theme preference file ID."
          },
          "deploymentScreenshotDark": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "Screenshot of active deployment with dark theme preference file ID."
          },
          "latestDeploymentId": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "Site's latest deployment ID."
          },
          "latestDeploymentCreatedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Latest deployment creation date in ISO 8601 format."
          },
          "latestDeploymentStatus": {
            "type": "string",
            "x-example": "ready",
            "description": "Status of latest deployment. Possible values are \"waiting\", \"processing\", \"building\", \"ready\", and \"failed\"."
          },
          "vars": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "$id": {
                  "type": "string",
                  "x-example": "5e5ea5c16897e",
                  "description": "Variable ID."
                },
                "$createdAt": {
                  "type": "string",
                  "x-example": "2020-10-15T06:38:00.000+00:00",
                  "description": "Variable creation date in ISO 8601 format."
                },
                "$updatedAt": {
                  "type": "string",
                  "x-example": "2020-10-15T06:38:00.000+00:00",
                  "description": "Variable creation date in ISO 8601 format."
                },
                "key": {
                  "type": "string",
                  "x-example": "API_KEY",
                  "description": "Variable key."
                },
                "value": {
                  "type": "string",
                  "x-example": "myPa$$word1",
                  "description": "Variable value."
                },
                "secret": {
                  "type": "boolean",
                  "x-example": false,
                  "description": "Variable secret flag. Secret variables can only be updated or deleted, but never read."
                },
                "resourceType": {
                  "type": "string",
                  "x-example": "function",
                  "description": "Service to which the variable belongs. Possible values are \"project\", \"function\""
                },
                "resourceId": {
                  "type": "string",
                  "x-example": "myAwesomeFunction",
                  "description": "ID of resource to which the variable belongs. If resourceType is \"project\", it is empty. If resourceType is \"function\", it is ID of the function."
                }
              },
              "required": [
                "$id",
                "$createdAt",
                "$updatedAt",
                "key",
                "value",
                "secret",
                "resourceType",
                "resourceId"
              ],
              "additionalProperties": {},
              "example": {
                "$id": "5e5ea5c16897e",
                "$createdAt": "2020-10-15T06:38:00.000+00:00",
                "$updatedAt": "2020-10-15T06:38:00.000+00:00",
                "key": "API_KEY",
                "value": "myPa$$word1",
                "secret": false,
                "resourceType": "function",
                "resourceId": "myAwesomeFunction"
              },
              "description": "Variable"
            },
            "x-example": [],
            "description": "Site variables."
          },
          "timeout": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 300,
            "description": "Site request timeout in seconds."
          },
          "installCommand": {
            "type": "string",
            "x-example": "npm install",
            "description": "The install command used to install the site dependencies."
          },
          "buildCommand": {
            "type": "string",
            "x-example": "npm run build",
            "description": "The build command used to build the site."
          },
          "outputDirectory": {
            "type": "string",
            "x-example": "build",
            "description": "The directory where the site build output is located."
          },
          "installationId": {
            "type": "string",
            "x-example": "6m40at4ejk5h2u9s1hboo",
            "description": "Site VCS (Version Control System) installation id."
          },
          "providerRepositoryId": {
            "type": "string",
            "x-example": "appwrite",
            "description": "VCS (Version Control System) Repository ID"
          },
          "providerBranch": {
            "type": "string",
            "x-example": "main",
            "description": "VCS (Version Control System) branch name"
          },
          "providerRootDirectory": {
            "type": "string",
            "x-example": "sites/helloWorld",
            "description": "Path to site in VCS (Version Control System) repository"
          },
          "providerSilentMode": {
            "type": "boolean",
            "x-example": false,
            "description": "Is VCS (Version Control System) connection is in silent mode? When in silence mode, no comments will be posted on the repository pull or merge requests"
          },
          "specification": {
            "type": "string",
            "x-example": "s-1vcpu-512mb",
            "description": "Machine specification for builds and executions."
          },
          "buildRuntime": {
            "type": "string",
            "x-example": "node-22",
            "description": "Site build runtime."
          },
          "adapter": {
            "type": "string",
            "x-example": "static",
            "description": "Site framework adapter."
          },
          "fallbackFile": {
            "type": "string",
            "x-example": "index.html",
            "description": "Name of fallback file to use instead of 404 page. If null, Appwrite 404 page will be displayed."
          }
        },
        "required": [
          "$id",
          "$createdAt",
          "$updatedAt",
          "name",
          "enabled",
          "live",
          "logging",
          "framework",
          "deploymentId",
          "deploymentCreatedAt",
          "deploymentScreenshotLight",
          "deploymentScreenshotDark",
          "latestDeploymentId",
          "latestDeploymentCreatedAt",
          "latestDeploymentStatus",
          "vars",
          "timeout",
          "installCommand",
          "buildCommand",
          "outputDirectory",
          "installationId",
          "providerRepositoryId",
          "providerBranch",
          "providerRootDirectory",
          "providerSilentMode",
          "specification",
          "buildRuntime",
          "adapter",
          "fallbackFile"
        ],
        "additionalProperties": {},
        "example": {
          "$id": "5e5ea5c16897e",
          "$createdAt": "2020-10-15T06:38:00.000+00:00",
          "$updatedAt": "2020-10-15T06:38:00.000+00:00",
          "name": "My Site",
          "enabled": false,
          "live": false,
          "logging": false,
          "framework": "react",
          "deploymentId": "5e5ea5c16897e",
          "deploymentCreatedAt": "2020-10-15T06:38:00.000+00:00",
          "deploymentScreenshotLight": "5e5ea5c16897e",
          "deploymentScreenshotDark": "5e5ea5c16897e",
          "latestDeploymentId": "5e5ea5c16897e",
          "latestDeploymentCreatedAt": "2020-10-15T06:38:00.000+00:00",
          "latestDeploymentStatus": "ready",
          "vars": [],
          "timeout": 300,
          "installCommand": "npm install",
          "buildCommand": "npm run build",
          "outputDirectory": "build",
          "installationId": "6m40at4ejk5h2u9s1hboo",
          "providerRepositoryId": "appwrite",
          "providerBranch": "main",
          "providerRootDirectory": "sites/helloWorld",
          "providerSilentMode": false,
          "specification": "s-1vcpu-512mb",
          "buildRuntime": "node-22",
          "adapter": "static",
          "fallbackFile": "index.html"
        },
        "description": "Site"
      },
      "x-example": "",
      "description": "List of sites."
    }
  },
  "required": [
    "total",
    "sites"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "sites": ""
  },
  "description": "Sites List"
} as const;

export const SiteListSchema = z.fromJSONSchema(SiteListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type SiteList = z.infer<typeof SiteListSchema>;
