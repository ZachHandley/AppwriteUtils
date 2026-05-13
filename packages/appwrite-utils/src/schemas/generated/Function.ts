// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const FunctionJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "$id": {
      "type": "string",
      "x-example": "5e5ea5c16897e",
      "description": "Function ID."
    },
    "$createdAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Function creation date in ISO 8601 format."
    },
    "$updatedAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Function update date in ISO 8601 format."
    },
    "execute": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "x-example": "users",
      "description": "Execution permissions."
    },
    "name": {
      "type": "string",
      "x-example": "My Function",
      "description": "Function name."
    },
    "enabled": {
      "type": "boolean",
      "x-example": false,
      "description": "Function enabled."
    },
    "live": {
      "type": "boolean",
      "x-example": false,
      "description": "Is the function deployed with the latest configuration? This is set to false if you've changed an environment variables, entrypoint, commands, or other settings that needs redeploy to be applied. When the value is false, redeploy the function to update it with the latest configuration."
    },
    "logging": {
      "type": "boolean",
      "x-example": false,
      "description": "When disabled, executions will exclude logs and errors, and will be slightly faster."
    },
    "runtime": {
      "type": "string",
      "x-example": "python-3.8",
      "description": "Function execution and build runtime."
    },
    "deploymentId": {
      "type": "string",
      "x-example": "5e5ea5c16897e",
      "description": "Function's active deployment ID."
    },
    "deploymentCreatedAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Active deployment creation date in ISO 8601 format."
    },
    "latestDeploymentId": {
      "type": "string",
      "x-example": "5e5ea5c16897e",
      "description": "Function's latest deployment ID."
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
    "scopes": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "x-example": "users.read",
      "description": "Allowed permission scopes."
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
      "description": "Function variables."
    },
    "events": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "x-example": "account.create",
      "description": "Function trigger events."
    },
    "schedule": {
      "type": "string",
      "x-example": "5 4 * * *",
      "description": "Function execution schedule in CRON format."
    },
    "timeout": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 300,
      "description": "Function execution timeout in seconds."
    },
    "entrypoint": {
      "type": "string",
      "x-example": "index.js",
      "description": "The entrypoint file used to execute the deployment."
    },
    "commands": {
      "type": "string",
      "x-example": "npm install",
      "description": "The build command used to build the deployment."
    },
    "version": {
      "type": "string",
      "x-example": "v2",
      "description": "Version of Open Runtimes used for the function."
    },
    "installationId": {
      "type": "string",
      "x-example": "6m40at4ejk5h2u9s1hboo",
      "description": "Function VCS (Version Control System) installation id."
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
      "x-example": "functions/helloWorld",
      "description": "Path to function in VCS (Version Control System) repository"
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
    }
  },
  "required": [
    "$id",
    "$createdAt",
    "$updatedAt",
    "execute",
    "name",
    "enabled",
    "live",
    "logging",
    "runtime",
    "deploymentId",
    "deploymentCreatedAt",
    "latestDeploymentId",
    "latestDeploymentCreatedAt",
    "latestDeploymentStatus",
    "scopes",
    "vars",
    "events",
    "schedule",
    "timeout",
    "entrypoint",
    "commands",
    "version",
    "installationId",
    "providerRepositoryId",
    "providerBranch",
    "providerRootDirectory",
    "providerSilentMode",
    "specification"
  ],
  "additionalProperties": {},
  "example": {
    "$id": "5e5ea5c16897e",
    "$createdAt": "2020-10-15T06:38:00.000+00:00",
    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
    "execute": "users",
    "name": "My Function",
    "enabled": false,
    "live": false,
    "logging": false,
    "runtime": "python-3.8",
    "deploymentId": "5e5ea5c16897e",
    "deploymentCreatedAt": "2020-10-15T06:38:00.000+00:00",
    "latestDeploymentId": "5e5ea5c16897e",
    "latestDeploymentCreatedAt": "2020-10-15T06:38:00.000+00:00",
    "latestDeploymentStatus": "ready",
    "scopes": "users.read",
    "vars": [],
    "events": "account.create",
    "schedule": "5 4 * * *",
    "timeout": 300,
    "entrypoint": "index.js",
    "commands": "npm install",
    "version": "v2",
    "installationId": "6m40at4ejk5h2u9s1hboo",
    "providerRepositoryId": "appwrite",
    "providerBranch": "main",
    "providerRootDirectory": "functions/helloWorld",
    "providerSilentMode": false,
    "specification": "s-1vcpu-512mb"
  },
  "description": "Function"
} as const;

export const FunctionSchema = z.fromJSONSchema(FunctionJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Function = z.infer<typeof FunctionSchema>;
