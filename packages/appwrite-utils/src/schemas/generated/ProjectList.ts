// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const ProjectListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of projects that matched your query."
    },
    "projects": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "$id": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "Project ID."
          },
          "$createdAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Project creation date in ISO 8601 format."
          },
          "$updatedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Project update date in ISO 8601 format."
          },
          "name": {
            "type": "string",
            "x-example": "New Project",
            "description": "Project name."
          },
          "description": {
            "type": "string",
            "x-example": "This is a new project.",
            "description": "Project description."
          },
          "teamId": {
            "type": "string",
            "x-example": "1592981250",
            "description": "Project team ID."
          },
          "logo": {
            "type": "string",
            "x-example": "5f5c451b403cb",
            "description": "Project logo file ID."
          },
          "url": {
            "type": "string",
            "x-example": "5f5c451b403cb",
            "description": "Project website URL."
          },
          "legalName": {
            "type": "string",
            "x-example": "Company LTD.",
            "description": "Company legal name."
          },
          "legalCountry": {
            "type": "string",
            "x-example": "US",
            "description": "Country code in [ISO 3166-1](http://en.wikipedia.org/wiki/ISO_3166-1) two-character format."
          },
          "legalState": {
            "type": "string",
            "x-example": "New York",
            "description": "State name."
          },
          "legalCity": {
            "type": "string",
            "x-example": "New York City.",
            "description": "City name."
          },
          "legalAddress": {
            "type": "string",
            "x-example": "620 Eighth Avenue, New York, NY 10018",
            "description": "Company Address."
          },
          "legalTaxId": {
            "type": "string",
            "x-example": "131102020",
            "description": "Company Tax ID."
          },
          "authDuration": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 60,
            "description": "Session duration in seconds."
          },
          "authLimit": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 100,
            "description": "Max users allowed. 0 is unlimited."
          },
          "authSessionsLimit": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 10,
            "description": "Max sessions allowed per user. 100 maximum."
          },
          "authPasswordHistory": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 5,
            "description": "Max allowed passwords in the history list per user. Max passwords limit allowed in history is 20. Use 0 for disabling password history."
          },
          "authPasswordDictionary": {
            "type": "boolean",
            "x-example": true,
            "description": "Whether or not to check user's password against most commonly used passwords."
          },
          "authPersonalDataCheck": {
            "type": "boolean",
            "x-example": true,
            "description": "Whether or not to check the user password for similarity with their personal data."
          },
          "authMockNumbers": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "phone": {
                  "type": "string",
                  "x-example": "+1612842323",
                  "description": "Mock phone number for testing phone authentication. Useful for testing phone authentication without sending an SMS."
                },
                "otp": {
                  "type": "string",
                  "x-example": "123456",
                  "description": "Mock OTP for the number. "
                }
              },
              "required": [
                "phone",
                "otp"
              ],
              "additionalProperties": {},
              "example": {
                "phone": "+1612842323",
                "otp": "123456"
              },
              "description": "Mock Number"
            },
            "x-example": [
              {}
            ],
            "description": "An array of mock numbers and their corresponding verification codes (OTPs)."
          },
          "authSessionAlerts": {
            "type": "boolean",
            "x-example": true,
            "description": "Whether or not to send session alert emails to users."
          },
          "authMembershipsUserName": {
            "type": "boolean",
            "x-example": true,
            "description": "Whether or not to show user names in the teams membership response."
          },
          "authMembershipsUserEmail": {
            "type": "boolean",
            "x-example": true,
            "description": "Whether or not to show user emails in the teams membership response."
          },
          "authMembershipsMfa": {
            "type": "boolean",
            "x-example": true,
            "description": "Whether or not to show user MFA status in the teams membership response."
          },
          "authInvalidateSessions": {
            "type": "boolean",
            "x-example": true,
            "description": "Whether or not all existing sessions should be invalidated on password change"
          },
          "oAuthProviders": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "key": {
                  "type": "string",
                  "x-example": "github",
                  "description": "Auth Provider."
                },
                "name": {
                  "type": "string",
                  "x-example": "GitHub",
                  "description": "Auth Provider name."
                },
                "appId": {
                  "type": "string",
                  "x-example": "259125845563242502",
                  "description": "OAuth 2.0 application ID."
                },
                "secret": {
                  "type": "string",
                  "x-example": "Bpw_g9c2TGXxfgLshDbSaL8tsCcqgczQ",
                  "description": "OAuth 2.0 application secret. Might be JSON string if provider requires extra configuration."
                },
                "enabled": {
                  "type": "boolean",
                  "x-example": "",
                  "description": "Auth Provider is active and can be used to create session."
                }
              },
              "required": [
                "key",
                "name",
                "appId",
                "secret",
                "enabled"
              ],
              "additionalProperties": {},
              "example": {
                "key": "github",
                "name": "GitHub",
                "appId": "259125845563242502",
                "secret": "Bpw_g9c2TGXxfgLshDbSaL8tsCcqgczQ",
                "enabled": ""
              },
              "description": "AuthProvider"
            },
            "x-example": [
              {}
            ],
            "description": "List of Auth Providers."
          },
          "platforms": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "$id": {
                  "type": "string",
                  "x-example": "5e5ea5c16897e",
                  "description": "Platform ID."
                },
                "$createdAt": {
                  "type": "string",
                  "x-example": "2020-10-15T06:38:00.000+00:00",
                  "description": "Platform creation date in ISO 8601 format."
                },
                "$updatedAt": {
                  "type": "string",
                  "x-example": "2020-10-15T06:38:00.000+00:00",
                  "description": "Platform update date in ISO 8601 format."
                },
                "name": {
                  "type": "string",
                  "x-example": "My Web App",
                  "description": "Platform name."
                },
                "type": {
                  "type": "string",
                  "enum": [
                    "web",
                    "flutter-web",
                    "flutter-ios",
                    "flutter-android",
                    "flutter-linux",
                    "flutter-macos",
                    "flutter-windows",
                    "apple-ios",
                    "apple-macos",
                    "apple-watchos",
                    "apple-tvos",
                    "android",
                    "unity",
                    "react-native-ios",
                    "react-native-android"
                  ],
                  "x-example": "web",
                  "description": "Platform type. Possible values are: web, flutter-web, flutter-ios, flutter-android, flutter-linux, flutter-macos, flutter-windows, apple-ios, apple-macos, apple-watchos, apple-tvos, android, unity, react-native-ios, react-native-android."
                },
                "key": {
                  "type": "string",
                  "x-example": "com.company.appname",
                  "description": "Platform Key. iOS bundle ID or Android package name.  Empty string for other platforms."
                },
                "store": {
                  "type": "string",
                  "x-example": "",
                  "description": "App store or Google Play store ID."
                },
                "hostname": {
                  "type": "string",
                  "x-example": "app.example.com",
                  "description": "Web app hostname. Empty string for other platforms."
                },
                "httpUser": {
                  "type": "string",
                  "x-example": "username",
                  "description": "HTTP basic authentication username."
                },
                "httpPass": {
                  "type": "string",
                  "x-example": "password",
                  "description": "HTTP basic authentication password."
                }
              },
              "required": [
                "$id",
                "$createdAt",
                "$updatedAt",
                "name",
                "type",
                "key",
                "store",
                "hostname",
                "httpUser",
                "httpPass"
              ],
              "additionalProperties": {},
              "example": {
                "$id": "5e5ea5c16897e",
                "$createdAt": "2020-10-15T06:38:00.000+00:00",
                "$updatedAt": "2020-10-15T06:38:00.000+00:00",
                "name": "My Web App",
                "type": "web",
                "key": "com.company.appname",
                "store": "",
                "hostname": "app.example.com",
                "httpUser": "username",
                "httpPass": "password"
              },
              "description": "Platform"
            },
            "x-example": {},
            "description": "List of Platforms."
          },
          "webhooks": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "$id": {
                  "type": "string",
                  "x-example": "5e5ea5c16897e",
                  "description": "Webhook ID."
                },
                "$createdAt": {
                  "type": "string",
                  "x-example": "2020-10-15T06:38:00.000+00:00",
                  "description": "Webhook creation date in ISO 8601 format."
                },
                "$updatedAt": {
                  "type": "string",
                  "x-example": "2020-10-15T06:38:00.000+00:00",
                  "description": "Webhook update date in ISO 8601 format."
                },
                "name": {
                  "type": "string",
                  "x-example": "My Webhook",
                  "description": "Webhook name."
                },
                "url": {
                  "type": "string",
                  "x-example": "https://example.com/webhook",
                  "description": "Webhook URL endpoint."
                },
                "events": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "x-example": [
                    "databases.tables.update",
                    "databases.collections.update"
                  ],
                  "description": "Webhook trigger events."
                },
                "security": {
                  "type": "boolean",
                  "x-example": true,
                  "description": "Indicated if SSL / TLS Certificate verification is enabled."
                },
                "httpUser": {
                  "type": "string",
                  "x-example": "username",
                  "description": "HTTP basic authentication username."
                },
                "httpPass": {
                  "type": "string",
                  "x-example": "password",
                  "description": "HTTP basic authentication password."
                },
                "signatureKey": {
                  "type": "string",
                  "x-example": "ad3d581ca230e2b7059c545e5a",
                  "description": "Signature key which can be used to validated incoming"
                },
                "enabled": {
                  "type": "boolean",
                  "x-example": true,
                  "description": "Indicates if this webhook is enabled."
                },
                "logs": {
                  "type": "string",
                  "x-example": "Failed to connect to remote server.",
                  "description": "Webhook error logs from the most recent failure."
                },
                "attempts": {
                  "type": "integer",
                  "minimum": -9007199254740991,
                  "maximum": 9007199254740991,
                  "x-example": 10,
                  "description": "Number of consecutive failed webhook attempts."
                }
              },
              "required": [
                "$id",
                "$createdAt",
                "$updatedAt",
                "name",
                "url",
                "events",
                "security",
                "httpUser",
                "httpPass",
                "signatureKey",
                "enabled",
                "logs",
                "attempts"
              ],
              "additionalProperties": {},
              "example": {
                "$id": "5e5ea5c16897e",
                "$createdAt": "2020-10-15T06:38:00.000+00:00",
                "$updatedAt": "2020-10-15T06:38:00.000+00:00",
                "name": "My Webhook",
                "url": "https://example.com/webhook",
                "events": [
                  "databases.tables.update",
                  "databases.collections.update"
                ],
                "security": true,
                "httpUser": "username",
                "httpPass": "password",
                "signatureKey": "ad3d581ca230e2b7059c545e5a",
                "enabled": true,
                "logs": "Failed to connect to remote server.",
                "attempts": 10
              },
              "description": "Webhook"
            },
            "x-example": {},
            "description": "List of Webhooks."
          },
          "keys": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "$id": {
                  "type": "string",
                  "x-example": "5e5ea5c16897e",
                  "description": "Key ID."
                },
                "$createdAt": {
                  "type": "string",
                  "x-example": "2020-10-15T06:38:00.000+00:00",
                  "description": "Key creation date in ISO 8601 format."
                },
                "$updatedAt": {
                  "type": "string",
                  "x-example": "2020-10-15T06:38:00.000+00:00",
                  "description": "Key update date in ISO 8601 format."
                },
                "name": {
                  "type": "string",
                  "x-example": "My API Key",
                  "description": "Key name."
                },
                "expire": {
                  "type": "string",
                  "x-example": "2020-10-15T06:38:00.000+00:00",
                  "description": "Key expiration date in ISO 8601 format."
                },
                "scopes": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "x-example": "users.read",
                  "description": "Allowed permission scopes."
                },
                "secret": {
                  "type": "string",
                  "x-example": "919c2d18fb5d4...a2ae413da83346ad2",
                  "description": "Secret key."
                },
                "accessedAt": {
                  "type": "string",
                  "x-example": "2020-10-15T06:38:00.000+00:00",
                  "description": "Most recent access date in ISO 8601 format. This attribute is only updated again after 24 hours."
                },
                "sdks": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "x-example": "appwrite:flutter",
                  "description": "List of SDK user agents that used this key."
                }
              },
              "required": [
                "$id",
                "$createdAt",
                "$updatedAt",
                "name",
                "expire",
                "scopes",
                "secret",
                "accessedAt",
                "sdks"
              ],
              "additionalProperties": {},
              "example": {
                "$id": "5e5ea5c16897e",
                "$createdAt": "2020-10-15T06:38:00.000+00:00",
                "$updatedAt": "2020-10-15T06:38:00.000+00:00",
                "name": "My API Key",
                "expire": "2020-10-15T06:38:00.000+00:00",
                "scopes": "users.read",
                "secret": "919c2d18fb5d4...a2ae413da83346ad2",
                "accessedAt": "2020-10-15T06:38:00.000+00:00",
                "sdks": "appwrite:flutter"
              },
              "description": "Key"
            },
            "x-example": {},
            "description": "List of API Keys."
          },
          "devKeys": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "$id": {
                  "type": "string",
                  "x-example": "5e5ea5c16897e",
                  "description": "Key ID."
                },
                "$createdAt": {
                  "type": "string",
                  "x-example": "2020-10-15T06:38:00.000+00:00",
                  "description": "Key creation date in ISO 8601 format."
                },
                "$updatedAt": {
                  "type": "string",
                  "x-example": "2020-10-15T06:38:00.000+00:00",
                  "description": "Key update date in ISO 8601 format."
                },
                "name": {
                  "type": "string",
                  "x-example": "Dev API Key",
                  "description": "Key name."
                },
                "expire": {
                  "type": "string",
                  "x-example": "2020-10-15T06:38:00.000+00:00",
                  "description": "Key expiration date in ISO 8601 format."
                },
                "secret": {
                  "type": "string",
                  "x-example": "919c2d18fb5d4...a2ae413da83346ad2",
                  "description": "Secret key."
                },
                "accessedAt": {
                  "type": "string",
                  "x-example": "2020-10-15T06:38:00.000+00:00",
                  "description": "Most recent access date in ISO 8601 format. This attribute is only updated again after 24 hours."
                },
                "sdks": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "x-example": "appwrite:flutter",
                  "description": "List of SDK user agents that used this key."
                }
              },
              "required": [
                "$id",
                "$createdAt",
                "$updatedAt",
                "name",
                "expire",
                "secret",
                "accessedAt",
                "sdks"
              ],
              "additionalProperties": {},
              "example": {
                "$id": "5e5ea5c16897e",
                "$createdAt": "2020-10-15T06:38:00.000+00:00",
                "$updatedAt": "2020-10-15T06:38:00.000+00:00",
                "name": "Dev API Key",
                "expire": "2020-10-15T06:38:00.000+00:00",
                "secret": "919c2d18fb5d4...a2ae413da83346ad2",
                "accessedAt": "2020-10-15T06:38:00.000+00:00",
                "sdks": "appwrite:flutter"
              },
              "description": "DevKey"
            },
            "x-example": {},
            "description": "List of dev keys."
          },
          "smtpEnabled": {
            "type": "boolean",
            "x-example": false,
            "description": "Status for custom SMTP"
          },
          "smtpSenderName": {
            "type": "string",
            "x-example": "John Appwrite",
            "description": "SMTP sender name"
          },
          "smtpSenderEmail": {
            "type": "string",
            "x-example": "john@appwrite.io",
            "description": "SMTP sender email"
          },
          "smtpReplyTo": {
            "type": "string",
            "x-example": "support@appwrite.io",
            "description": "SMTP reply to email"
          },
          "smtpHost": {
            "type": "string",
            "x-example": "mail.appwrite.io",
            "description": "SMTP server host name"
          },
          "smtpPort": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 25,
            "description": "SMTP server port"
          },
          "smtpUsername": {
            "type": "string",
            "x-example": "emailuser",
            "description": "SMTP server username"
          },
          "smtpPassword": {
            "type": "string",
            "x-example": "securepassword",
            "description": "SMTP server password"
          },
          "smtpSecure": {
            "type": "string",
            "x-example": "tls",
            "description": "SMTP server secure protocol"
          },
          "pingCount": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 1,
            "description": "Number of times the ping was received for this project."
          },
          "pingedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Last ping datetime in ISO 8601 format."
          },
          "authEmailPassword": {
            "type": "boolean",
            "x-example": true,
            "description": "Email/Password auth method status"
          },
          "authUsersAuthMagicURL": {
            "type": "boolean",
            "x-example": true,
            "description": "Magic URL auth method status"
          },
          "authEmailOtp": {
            "type": "boolean",
            "x-example": true,
            "description": "Email (OTP) auth method status"
          },
          "authAnonymous": {
            "type": "boolean",
            "x-example": true,
            "description": "Anonymous auth method status"
          },
          "authInvites": {
            "type": "boolean",
            "x-example": true,
            "description": "Invites auth method status"
          },
          "authJWT": {
            "type": "boolean",
            "x-example": true,
            "description": "JWT auth method status"
          },
          "authPhone": {
            "type": "boolean",
            "x-example": true,
            "description": "Phone auth method status"
          },
          "serviceStatusForAccount": {
            "type": "boolean",
            "x-example": true,
            "description": "Account service status"
          },
          "serviceStatusForAvatars": {
            "type": "boolean",
            "x-example": true,
            "description": "Avatars service status"
          },
          "serviceStatusForDatabases": {
            "type": "boolean",
            "x-example": true,
            "description": "Databases (legacy) service status"
          },
          "serviceStatusForTablesdb": {
            "type": "boolean",
            "x-example": true,
            "description": "TablesDB service status"
          },
          "serviceStatusForLocale": {
            "type": "boolean",
            "x-example": true,
            "description": "Locale service status"
          },
          "serviceStatusForHealth": {
            "type": "boolean",
            "x-example": true,
            "description": "Health service status"
          },
          "serviceStatusForStorage": {
            "type": "boolean",
            "x-example": true,
            "description": "Storage service status"
          },
          "serviceStatusForTeams": {
            "type": "boolean",
            "x-example": true,
            "description": "Teams service status"
          },
          "serviceStatusForUsers": {
            "type": "boolean",
            "x-example": true,
            "description": "Users service status"
          },
          "serviceStatusForSites": {
            "type": "boolean",
            "x-example": true,
            "description": "Sites service status"
          },
          "serviceStatusForFunctions": {
            "type": "boolean",
            "x-example": true,
            "description": "Functions service status"
          },
          "serviceStatusForGraphql": {
            "type": "boolean",
            "x-example": true,
            "description": "GraphQL service status"
          },
          "serviceStatusForMessaging": {
            "type": "boolean",
            "x-example": true,
            "description": "Messaging service status"
          }
        },
        "required": [
          "$id",
          "$createdAt",
          "$updatedAt",
          "name",
          "description",
          "teamId",
          "logo",
          "url",
          "legalName",
          "legalCountry",
          "legalState",
          "legalCity",
          "legalAddress",
          "legalTaxId",
          "authDuration",
          "authLimit",
          "authSessionsLimit",
          "authPasswordHistory",
          "authPasswordDictionary",
          "authPersonalDataCheck",
          "authMockNumbers",
          "authSessionAlerts",
          "authMembershipsUserName",
          "authMembershipsUserEmail",
          "authMembershipsMfa",
          "authInvalidateSessions",
          "oAuthProviders",
          "platforms",
          "webhooks",
          "keys",
          "devKeys",
          "smtpEnabled",
          "smtpSenderName",
          "smtpSenderEmail",
          "smtpReplyTo",
          "smtpHost",
          "smtpPort",
          "smtpUsername",
          "smtpPassword",
          "smtpSecure",
          "pingCount",
          "pingedAt",
          "authEmailPassword",
          "authUsersAuthMagicURL",
          "authEmailOtp",
          "authAnonymous",
          "authInvites",
          "authJWT",
          "authPhone",
          "serviceStatusForAccount",
          "serviceStatusForAvatars",
          "serviceStatusForDatabases",
          "serviceStatusForTablesdb",
          "serviceStatusForLocale",
          "serviceStatusForHealth",
          "serviceStatusForStorage",
          "serviceStatusForTeams",
          "serviceStatusForUsers",
          "serviceStatusForSites",
          "serviceStatusForFunctions",
          "serviceStatusForGraphql",
          "serviceStatusForMessaging"
        ],
        "additionalProperties": {},
        "example": {
          "$id": "5e5ea5c16897e",
          "$createdAt": "2020-10-15T06:38:00.000+00:00",
          "$updatedAt": "2020-10-15T06:38:00.000+00:00",
          "name": "New Project",
          "description": "This is a new project.",
          "teamId": "1592981250",
          "logo": "5f5c451b403cb",
          "url": "5f5c451b403cb",
          "legalName": "Company LTD.",
          "legalCountry": "US",
          "legalState": "New York",
          "legalCity": "New York City.",
          "legalAddress": "620 Eighth Avenue, New York, NY 10018",
          "legalTaxId": "131102020",
          "authDuration": 60,
          "authLimit": 100,
          "authSessionsLimit": 10,
          "authPasswordHistory": 5,
          "authPasswordDictionary": true,
          "authPersonalDataCheck": true,
          "authMockNumbers": [
            {}
          ],
          "authSessionAlerts": true,
          "authMembershipsUserName": true,
          "authMembershipsUserEmail": true,
          "authMembershipsMfa": true,
          "authInvalidateSessions": true,
          "oAuthProviders": [
            {}
          ],
          "platforms": {},
          "webhooks": {},
          "keys": {},
          "devKeys": {},
          "smtpEnabled": false,
          "smtpSenderName": "John Appwrite",
          "smtpSenderEmail": "john@appwrite.io",
          "smtpReplyTo": "support@appwrite.io",
          "smtpHost": "mail.appwrite.io",
          "smtpPort": 25,
          "smtpUsername": "emailuser",
          "smtpPassword": "securepassword",
          "smtpSecure": "tls",
          "pingCount": 1,
          "pingedAt": "2020-10-15T06:38:00.000+00:00",
          "authEmailPassword": true,
          "authUsersAuthMagicURL": true,
          "authEmailOtp": true,
          "authAnonymous": true,
          "authInvites": true,
          "authJWT": true,
          "authPhone": true,
          "serviceStatusForAccount": true,
          "serviceStatusForAvatars": true,
          "serviceStatusForDatabases": true,
          "serviceStatusForTablesdb": true,
          "serviceStatusForLocale": true,
          "serviceStatusForHealth": true,
          "serviceStatusForStorage": true,
          "serviceStatusForTeams": true,
          "serviceStatusForUsers": true,
          "serviceStatusForSites": true,
          "serviceStatusForFunctions": true,
          "serviceStatusForGraphql": true,
          "serviceStatusForMessaging": true
        },
        "description": "Project"
      },
      "x-example": "",
      "description": "List of projects."
    }
  },
  "required": [
    "total",
    "projects"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "projects": ""
  },
  "description": "Projects List"
} as const;

export const ProjectListSchema = z.fromJSONSchema(ProjectListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type ProjectList = z.infer<typeof ProjectListSchema>;
