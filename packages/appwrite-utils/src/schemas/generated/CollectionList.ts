// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const CollectionListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of collections that matched your query."
    },
    "collections": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "$id": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "Collection ID."
          },
          "$createdAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Collection creation date in ISO 8601 format."
          },
          "$updatedAt": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "Collection update date in ISO 8601 format."
          },
          "$permissions": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "x-example": [
              "read(\"any\")"
            ],
            "description": "Collection permissions. [Learn more about permissions](https://appwrite.io/docs/permissions)."
          },
          "databaseId": {
            "type": "string",
            "x-example": "5e5ea5c16897e",
            "description": "Database ID."
          },
          "name": {
            "type": "string",
            "x-example": "My Collection",
            "description": "Collection name."
          },
          "enabled": {
            "type": "boolean",
            "x-example": false,
            "description": "Collection enabled. Can be 'enabled' or 'disabled'. When disabled, the collection is inaccessible to users, but remains accessible to Server SDKs using API keys."
          },
          "documentSecurity": {
            "type": "boolean",
            "x-example": true,
            "description": "Whether document-level permissions are enabled. [Learn more about permissions](https://appwrite.io/docs/permissions)."
          },
          "attributes": {
            "type": "array",
            "items": {
              "anyOf": [
                {
                  "type": "object",
                  "properties": {
                    "key": {
                      "type": "string",
                      "x-example": "isEnabled",
                      "description": "Attribute Key."
                    },
                    "type": {
                      "type": "string",
                      "x-example": "boolean",
                      "description": "Attribute type."
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "available",
                        "processing",
                        "deleting",
                        "stuck",
                        "failed"
                      ],
                      "x-example": "available",
                      "x-enum-name": "AttributeStatus",
                      "description": "Attribute status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
                    },
                    "error": {
                      "type": "string",
                      "x-example": "string",
                      "description": "Error message. Displays error generated on failure of creating or deleting an attribute."
                    },
                    "required": {
                      "type": "boolean",
                      "x-example": true,
                      "description": "Is attribute required?"
                    },
                    "array": {
                      "anyOf": [
                        {
                          "type": "boolean"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": false,
                      "description": "Is attribute an array?"
                    },
                    "$createdAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute creation date in ISO 8601 format."
                    },
                    "$updatedAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute update date in ISO 8601 format."
                    },
                    "default": {
                      "anyOf": [
                        {
                          "type": "boolean"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": false,
                      "description": "Default value for attribute when not provided. Cannot be set when attribute is required."
                    }
                  },
                  "required": [
                    "key",
                    "type",
                    "status",
                    "error",
                    "required",
                    "$createdAt",
                    "$updatedAt"
                  ],
                  "additionalProperties": {},
                  "example": {
                    "key": "isEnabled",
                    "type": "boolean",
                    "status": "available",
                    "error": "string",
                    "required": true,
                    "array": false,
                    "$createdAt": "2020-10-15T06:38:00.000+00:00",
                    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
                    "default": false
                  },
                  "description": "AttributeBoolean"
                },
                {
                  "type": "object",
                  "properties": {
                    "key": {
                      "type": "string",
                      "x-example": "count",
                      "description": "Attribute Key."
                    },
                    "type": {
                      "type": "string",
                      "x-example": "integer",
                      "description": "Attribute type."
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "available",
                        "processing",
                        "deleting",
                        "stuck",
                        "failed"
                      ],
                      "x-example": "available",
                      "x-enum-name": "AttributeStatus",
                      "description": "Attribute status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
                    },
                    "error": {
                      "type": "string",
                      "x-example": "string",
                      "description": "Error message. Displays error generated on failure of creating or deleting an attribute."
                    },
                    "required": {
                      "type": "boolean",
                      "x-example": true,
                      "description": "Is attribute required?"
                    },
                    "array": {
                      "anyOf": [
                        {
                          "type": "boolean"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": false,
                      "description": "Is attribute an array?"
                    },
                    "$createdAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute creation date in ISO 8601 format."
                    },
                    "$updatedAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute update date in ISO 8601 format."
                    },
                    "min": {
                      "anyOf": [
                        {
                          "type": "integer",
                          "minimum": -9007199254740991,
                          "maximum": 9007199254740991
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": 1,
                      "description": "Minimum value to enforce for new documents."
                    },
                    "max": {
                      "anyOf": [
                        {
                          "type": "integer",
                          "minimum": -9007199254740991,
                          "maximum": 9007199254740991
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": 10,
                      "description": "Maximum value to enforce for new documents."
                    },
                    "default": {
                      "anyOf": [
                        {
                          "type": "integer",
                          "minimum": -9007199254740991,
                          "maximum": 9007199254740991
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": 10,
                      "description": "Default value for attribute when not provided. Cannot be set when attribute is required."
                    }
                  },
                  "required": [
                    "key",
                    "type",
                    "status",
                    "error",
                    "required",
                    "$createdAt",
                    "$updatedAt"
                  ],
                  "additionalProperties": {},
                  "example": {
                    "key": "count",
                    "type": "integer",
                    "status": "available",
                    "error": "string",
                    "required": true,
                    "array": false,
                    "$createdAt": "2020-10-15T06:38:00.000+00:00",
                    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
                    "min": 1,
                    "max": 10,
                    "default": 10
                  },
                  "description": "AttributeInteger"
                },
                {
                  "type": "object",
                  "properties": {
                    "key": {
                      "type": "string",
                      "x-example": "percentageCompleted",
                      "description": "Attribute Key."
                    },
                    "type": {
                      "type": "string",
                      "x-example": "double",
                      "description": "Attribute type."
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "available",
                        "processing",
                        "deleting",
                        "stuck",
                        "failed"
                      ],
                      "x-example": "available",
                      "x-enum-name": "AttributeStatus",
                      "description": "Attribute status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
                    },
                    "error": {
                      "type": "string",
                      "x-example": "string",
                      "description": "Error message. Displays error generated on failure of creating or deleting an attribute."
                    },
                    "required": {
                      "type": "boolean",
                      "x-example": true,
                      "description": "Is attribute required?"
                    },
                    "array": {
                      "anyOf": [
                        {
                          "type": "boolean"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": false,
                      "description": "Is attribute an array?"
                    },
                    "$createdAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute creation date in ISO 8601 format."
                    },
                    "$updatedAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute update date in ISO 8601 format."
                    },
                    "min": {
                      "anyOf": [
                        {
                          "type": "number"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": 1.5,
                      "description": "Minimum value to enforce for new documents."
                    },
                    "max": {
                      "anyOf": [
                        {
                          "type": "number"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": 10.5,
                      "description": "Maximum value to enforce for new documents."
                    },
                    "default": {
                      "anyOf": [
                        {
                          "type": "number"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": 2.5,
                      "description": "Default value for attribute when not provided. Cannot be set when attribute is required."
                    }
                  },
                  "required": [
                    "key",
                    "type",
                    "status",
                    "error",
                    "required",
                    "$createdAt",
                    "$updatedAt"
                  ],
                  "additionalProperties": {},
                  "example": {
                    "key": "percentageCompleted",
                    "type": "double",
                    "status": "available",
                    "error": "string",
                    "required": true,
                    "array": false,
                    "$createdAt": "2020-10-15T06:38:00.000+00:00",
                    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
                    "min": 1.5,
                    "max": 10.5,
                    "default": 2.5
                  },
                  "description": "AttributeFloat"
                },
                {
                  "type": "object",
                  "properties": {
                    "key": {
                      "type": "string",
                      "x-example": "userEmail",
                      "description": "Attribute Key."
                    },
                    "type": {
                      "type": "string",
                      "x-example": "string",
                      "description": "Attribute type."
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "available",
                        "processing",
                        "deleting",
                        "stuck",
                        "failed"
                      ],
                      "x-example": "available",
                      "x-enum-name": "AttributeStatus",
                      "description": "Attribute status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
                    },
                    "error": {
                      "type": "string",
                      "x-example": "string",
                      "description": "Error message. Displays error generated on failure of creating or deleting an attribute."
                    },
                    "required": {
                      "type": "boolean",
                      "x-example": true,
                      "description": "Is attribute required?"
                    },
                    "array": {
                      "anyOf": [
                        {
                          "type": "boolean"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": false,
                      "description": "Is attribute an array?"
                    },
                    "$createdAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute creation date in ISO 8601 format."
                    },
                    "$updatedAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute update date in ISO 8601 format."
                    },
                    "format": {
                      "type": "string",
                      "x-example": "email",
                      "description": "String format."
                    },
                    "default": {
                      "anyOf": [
                        {
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": "default@example.com",
                      "description": "Default value for attribute when not provided. Cannot be set when attribute is required."
                    }
                  },
                  "required": [
                    "key",
                    "type",
                    "status",
                    "error",
                    "required",
                    "$createdAt",
                    "$updatedAt",
                    "format"
                  ],
                  "additionalProperties": {},
                  "example": {
                    "key": "userEmail",
                    "type": "string",
                    "status": "available",
                    "error": "string",
                    "required": true,
                    "array": false,
                    "$createdAt": "2020-10-15T06:38:00.000+00:00",
                    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
                    "format": "email",
                    "default": "default@example.com"
                  },
                  "description": "AttributeEmail"
                },
                {
                  "type": "object",
                  "properties": {
                    "key": {
                      "type": "string",
                      "x-example": "status",
                      "description": "Attribute Key."
                    },
                    "type": {
                      "type": "string",
                      "x-example": "string",
                      "description": "Attribute type."
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "available",
                        "processing",
                        "deleting",
                        "stuck",
                        "failed"
                      ],
                      "x-example": "available",
                      "x-enum-name": "AttributeStatus",
                      "description": "Attribute status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
                    },
                    "error": {
                      "type": "string",
                      "x-example": "string",
                      "description": "Error message. Displays error generated on failure of creating or deleting an attribute."
                    },
                    "required": {
                      "type": "boolean",
                      "x-example": true,
                      "description": "Is attribute required?"
                    },
                    "array": {
                      "anyOf": [
                        {
                          "type": "boolean"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": false,
                      "description": "Is attribute an array?"
                    },
                    "$createdAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute creation date in ISO 8601 format."
                    },
                    "$updatedAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute update date in ISO 8601 format."
                    },
                    "elements": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      },
                      "x-example": "element",
                      "description": "Array of elements in enumerated type."
                    },
                    "format": {
                      "type": "string",
                      "x-example": "enum",
                      "description": "String format."
                    },
                    "default": {
                      "anyOf": [
                        {
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": "element",
                      "description": "Default value for attribute when not provided. Cannot be set when attribute is required."
                    }
                  },
                  "required": [
                    "key",
                    "type",
                    "status",
                    "error",
                    "required",
                    "$createdAt",
                    "$updatedAt",
                    "elements",
                    "format"
                  ],
                  "additionalProperties": {},
                  "example": {
                    "key": "status",
                    "type": "string",
                    "status": "available",
                    "error": "string",
                    "required": true,
                    "array": false,
                    "$createdAt": "2020-10-15T06:38:00.000+00:00",
                    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
                    "elements": "element",
                    "format": "enum",
                    "default": "element"
                  },
                  "description": "AttributeEnum"
                },
                {
                  "type": "object",
                  "properties": {
                    "key": {
                      "type": "string",
                      "x-example": "githubUrl",
                      "description": "Attribute Key."
                    },
                    "type": {
                      "type": "string",
                      "x-example": "string",
                      "description": "Attribute type."
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "available",
                        "processing",
                        "deleting",
                        "stuck",
                        "failed"
                      ],
                      "x-example": "available",
                      "x-enum-name": "AttributeStatus",
                      "description": "Attribute status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
                    },
                    "error": {
                      "type": "string",
                      "x-example": "string",
                      "description": "Error message. Displays error generated on failure of creating or deleting an attribute."
                    },
                    "required": {
                      "type": "boolean",
                      "x-example": true,
                      "description": "Is attribute required?"
                    },
                    "array": {
                      "anyOf": [
                        {
                          "type": "boolean"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": false,
                      "description": "Is attribute an array?"
                    },
                    "$createdAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute creation date in ISO 8601 format."
                    },
                    "$updatedAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute update date in ISO 8601 format."
                    },
                    "format": {
                      "type": "string",
                      "x-example": "url",
                      "description": "String format."
                    },
                    "default": {
                      "anyOf": [
                        {
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": "http://example.com",
                      "description": "Default value for attribute when not provided. Cannot be set when attribute is required."
                    }
                  },
                  "required": [
                    "key",
                    "type",
                    "status",
                    "error",
                    "required",
                    "$createdAt",
                    "$updatedAt",
                    "format"
                  ],
                  "additionalProperties": {},
                  "example": {
                    "key": "githubUrl",
                    "type": "string",
                    "status": "available",
                    "error": "string",
                    "required": true,
                    "array": false,
                    "$createdAt": "2020-10-15T06:38:00.000+00:00",
                    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
                    "format": "url",
                    "default": "http://example.com"
                  },
                  "description": "AttributeURL"
                },
                {
                  "type": "object",
                  "properties": {
                    "key": {
                      "type": "string",
                      "x-example": "ipAddress",
                      "description": "Attribute Key."
                    },
                    "type": {
                      "type": "string",
                      "x-example": "string",
                      "description": "Attribute type."
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "available",
                        "processing",
                        "deleting",
                        "stuck",
                        "failed"
                      ],
                      "x-example": "available",
                      "x-enum-name": "AttributeStatus",
                      "description": "Attribute status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
                    },
                    "error": {
                      "type": "string",
                      "x-example": "string",
                      "description": "Error message. Displays error generated on failure of creating or deleting an attribute."
                    },
                    "required": {
                      "type": "boolean",
                      "x-example": true,
                      "description": "Is attribute required?"
                    },
                    "array": {
                      "anyOf": [
                        {
                          "type": "boolean"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": false,
                      "description": "Is attribute an array?"
                    },
                    "$createdAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute creation date in ISO 8601 format."
                    },
                    "$updatedAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute update date in ISO 8601 format."
                    },
                    "format": {
                      "type": "string",
                      "x-example": "ip",
                      "description": "String format."
                    },
                    "default": {
                      "anyOf": [
                        {
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": "192.0.2.0",
                      "description": "Default value for attribute when not provided. Cannot be set when attribute is required."
                    }
                  },
                  "required": [
                    "key",
                    "type",
                    "status",
                    "error",
                    "required",
                    "$createdAt",
                    "$updatedAt",
                    "format"
                  ],
                  "additionalProperties": {},
                  "example": {
                    "key": "ipAddress",
                    "type": "string",
                    "status": "available",
                    "error": "string",
                    "required": true,
                    "array": false,
                    "$createdAt": "2020-10-15T06:38:00.000+00:00",
                    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
                    "format": "ip",
                    "default": "192.0.2.0"
                  },
                  "description": "AttributeIP"
                },
                {
                  "type": "object",
                  "properties": {
                    "key": {
                      "type": "string",
                      "x-example": "birthDay",
                      "description": "Attribute Key."
                    },
                    "type": {
                      "type": "string",
                      "x-example": "datetime",
                      "description": "Attribute type."
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "available",
                        "processing",
                        "deleting",
                        "stuck",
                        "failed"
                      ],
                      "x-example": "available",
                      "x-enum-name": "AttributeStatus",
                      "description": "Attribute status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
                    },
                    "error": {
                      "type": "string",
                      "x-example": "string",
                      "description": "Error message. Displays error generated on failure of creating or deleting an attribute."
                    },
                    "required": {
                      "type": "boolean",
                      "x-example": true,
                      "description": "Is attribute required?"
                    },
                    "array": {
                      "anyOf": [
                        {
                          "type": "boolean"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": false,
                      "description": "Is attribute an array?"
                    },
                    "$createdAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute creation date in ISO 8601 format."
                    },
                    "$updatedAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute update date in ISO 8601 format."
                    },
                    "format": {
                      "type": "string",
                      "x-example": "datetime",
                      "description": "ISO 8601 format."
                    },
                    "default": {
                      "anyOf": [
                        {
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Default value for attribute when not provided. Only null is optional"
                    }
                  },
                  "required": [
                    "key",
                    "type",
                    "status",
                    "error",
                    "required",
                    "$createdAt",
                    "$updatedAt",
                    "format"
                  ],
                  "additionalProperties": {},
                  "example": {
                    "key": "birthDay",
                    "type": "datetime",
                    "status": "available",
                    "error": "string",
                    "required": true,
                    "array": false,
                    "$createdAt": "2020-10-15T06:38:00.000+00:00",
                    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
                    "format": "datetime",
                    "default": "2020-10-15T06:38:00.000+00:00"
                  },
                  "description": "AttributeDatetime"
                },
                {
                  "type": "object",
                  "properties": {
                    "key": {
                      "type": "string",
                      "x-example": "fullName",
                      "description": "Attribute Key."
                    },
                    "type": {
                      "type": "string",
                      "x-example": "string",
                      "description": "Attribute type."
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "available",
                        "processing",
                        "deleting",
                        "stuck",
                        "failed"
                      ],
                      "x-example": "available",
                      "x-enum-name": "AttributeStatus",
                      "description": "Attribute status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
                    },
                    "error": {
                      "type": "string",
                      "x-example": "string",
                      "description": "Error message. Displays error generated on failure of creating or deleting an attribute."
                    },
                    "required": {
                      "type": "boolean",
                      "x-example": true,
                      "description": "Is attribute required?"
                    },
                    "array": {
                      "anyOf": [
                        {
                          "type": "boolean"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": false,
                      "description": "Is attribute an array?"
                    },
                    "$createdAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute creation date in ISO 8601 format."
                    },
                    "$updatedAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute update date in ISO 8601 format."
                    },
                    "relatedCollection": {
                      "type": "string",
                      "x-example": "collection",
                      "description": "The ID of the related collection."
                    },
                    "relationType": {
                      "type": "string",
                      "x-example": "oneToOne|oneToMany|manyToOne|manyToMany",
                      "description": "The type of the relationship."
                    },
                    "twoWay": {
                      "type": "boolean",
                      "x-example": false,
                      "description": "Is the relationship two-way?"
                    },
                    "twoWayKey": {
                      "type": "string",
                      "x-example": "string",
                      "description": "The key of the two-way relationship."
                    },
                    "onDelete": {
                      "type": "string",
                      "x-example": "restrict|cascade|setNull",
                      "description": "How deleting the parent document will propagate to child documents."
                    },
                    "side": {
                      "type": "string",
                      "x-example": "parent|child",
                      "description": "Whether this is the parent or child side of the relationship"
                    }
                  },
                  "required": [
                    "key",
                    "type",
                    "status",
                    "error",
                    "required",
                    "$createdAt",
                    "$updatedAt",
                    "relatedCollection",
                    "relationType",
                    "twoWay",
                    "twoWayKey",
                    "onDelete",
                    "side"
                  ],
                  "additionalProperties": {},
                  "example": {
                    "key": "fullName",
                    "type": "string",
                    "status": "available",
                    "error": "string",
                    "required": true,
                    "array": false,
                    "$createdAt": "2020-10-15T06:38:00.000+00:00",
                    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
                    "relatedCollection": "collection",
                    "relationType": "oneToOne|oneToMany|manyToOne|manyToMany",
                    "twoWay": false,
                    "twoWayKey": "string",
                    "onDelete": "restrict|cascade|setNull",
                    "side": "parent|child"
                  },
                  "description": "AttributeRelationship"
                },
                {
                  "type": "object",
                  "properties": {
                    "key": {
                      "type": "string",
                      "x-example": "fullName",
                      "description": "Attribute Key."
                    },
                    "type": {
                      "type": "string",
                      "x-example": "string",
                      "description": "Attribute type."
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "available",
                        "processing",
                        "deleting",
                        "stuck",
                        "failed"
                      ],
                      "x-example": "available",
                      "x-enum-name": "AttributeStatus",
                      "description": "Attribute status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
                    },
                    "error": {
                      "type": "string",
                      "x-example": "string",
                      "description": "Error message. Displays error generated on failure of creating or deleting an attribute."
                    },
                    "required": {
                      "type": "boolean",
                      "x-example": true,
                      "description": "Is attribute required?"
                    },
                    "array": {
                      "anyOf": [
                        {
                          "type": "boolean"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": false,
                      "description": "Is attribute an array?"
                    },
                    "$createdAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute creation date in ISO 8601 format."
                    },
                    "$updatedAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute update date in ISO 8601 format."
                    },
                    "default": {
                      "anyOf": [
                        {
                          "type": "array",
                          "items": {}
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": [
                        0,
                        0
                      ],
                      "description": "Default value for attribute when not provided. Cannot be set when attribute is required."
                    }
                  },
                  "required": [
                    "key",
                    "type",
                    "status",
                    "error",
                    "required",
                    "$createdAt",
                    "$updatedAt"
                  ],
                  "additionalProperties": {},
                  "example": {
                    "key": "fullName",
                    "type": "string",
                    "status": "available",
                    "error": "string",
                    "required": true,
                    "array": false,
                    "$createdAt": "2020-10-15T06:38:00.000+00:00",
                    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
                    "default": [
                      0,
                      0
                    ]
                  },
                  "description": "AttributePoint"
                },
                {
                  "type": "object",
                  "properties": {
                    "key": {
                      "type": "string",
                      "x-example": "fullName",
                      "description": "Attribute Key."
                    },
                    "type": {
                      "type": "string",
                      "x-example": "string",
                      "description": "Attribute type."
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "available",
                        "processing",
                        "deleting",
                        "stuck",
                        "failed"
                      ],
                      "x-example": "available",
                      "x-enum-name": "AttributeStatus",
                      "description": "Attribute status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
                    },
                    "error": {
                      "type": "string",
                      "x-example": "string",
                      "description": "Error message. Displays error generated on failure of creating or deleting an attribute."
                    },
                    "required": {
                      "type": "boolean",
                      "x-example": true,
                      "description": "Is attribute required?"
                    },
                    "array": {
                      "anyOf": [
                        {
                          "type": "boolean"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": false,
                      "description": "Is attribute an array?"
                    },
                    "$createdAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute creation date in ISO 8601 format."
                    },
                    "$updatedAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute update date in ISO 8601 format."
                    },
                    "default": {
                      "anyOf": [
                        {
                          "type": "array",
                          "items": {}
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": [
                        [
                          0,
                          0
                        ],
                        [
                          1,
                          1
                        ]
                      ],
                      "description": "Default value for attribute when not provided. Cannot be set when attribute is required."
                    }
                  },
                  "required": [
                    "key",
                    "type",
                    "status",
                    "error",
                    "required",
                    "$createdAt",
                    "$updatedAt"
                  ],
                  "additionalProperties": {},
                  "example": {
                    "key": "fullName",
                    "type": "string",
                    "status": "available",
                    "error": "string",
                    "required": true,
                    "array": false,
                    "$createdAt": "2020-10-15T06:38:00.000+00:00",
                    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
                    "default": [
                      [
                        0,
                        0
                      ],
                      [
                        1,
                        1
                      ]
                    ]
                  },
                  "description": "AttributeLine"
                },
                {
                  "type": "object",
                  "properties": {
                    "key": {
                      "type": "string",
                      "x-example": "fullName",
                      "description": "Attribute Key."
                    },
                    "type": {
                      "type": "string",
                      "x-example": "string",
                      "description": "Attribute type."
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "available",
                        "processing",
                        "deleting",
                        "stuck",
                        "failed"
                      ],
                      "x-example": "available",
                      "x-enum-name": "AttributeStatus",
                      "description": "Attribute status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
                    },
                    "error": {
                      "type": "string",
                      "x-example": "string",
                      "description": "Error message. Displays error generated on failure of creating or deleting an attribute."
                    },
                    "required": {
                      "type": "boolean",
                      "x-example": true,
                      "description": "Is attribute required?"
                    },
                    "array": {
                      "anyOf": [
                        {
                          "type": "boolean"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": false,
                      "description": "Is attribute an array?"
                    },
                    "$createdAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute creation date in ISO 8601 format."
                    },
                    "$updatedAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute update date in ISO 8601 format."
                    },
                    "default": {
                      "anyOf": [
                        {
                          "type": "array",
                          "items": {}
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": [
                        [
                          [
                            0,
                            0
                          ],
                          [
                            0,
                            10
                          ]
                        ],
                        [
                          [
                            10,
                            10
                          ],
                          [
                            0,
                            0
                          ]
                        ]
                      ],
                      "description": "Default value for attribute when not provided. Cannot be set when attribute is required."
                    }
                  },
                  "required": [
                    "key",
                    "type",
                    "status",
                    "error",
                    "required",
                    "$createdAt",
                    "$updatedAt"
                  ],
                  "additionalProperties": {},
                  "example": {
                    "key": "fullName",
                    "type": "string",
                    "status": "available",
                    "error": "string",
                    "required": true,
                    "array": false,
                    "$createdAt": "2020-10-15T06:38:00.000+00:00",
                    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
                    "default": [
                      [
                        [
                          0,
                          0
                        ],
                        [
                          0,
                          10
                        ]
                      ],
                      [
                        [
                          10,
                          10
                        ],
                        [
                          0,
                          0
                        ]
                      ]
                    ]
                  },
                  "description": "AttributePolygon"
                },
                {
                  "type": "object",
                  "properties": {
                    "key": {
                      "type": "string",
                      "x-example": "fullName",
                      "description": "Attribute Key."
                    },
                    "type": {
                      "type": "string",
                      "x-example": "string",
                      "description": "Attribute type."
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "available",
                        "processing",
                        "deleting",
                        "stuck",
                        "failed"
                      ],
                      "x-example": "available",
                      "x-enum-name": "AttributeStatus",
                      "description": "Attribute status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
                    },
                    "error": {
                      "type": "string",
                      "x-example": "string",
                      "description": "Error message. Displays error generated on failure of creating or deleting an attribute."
                    },
                    "required": {
                      "type": "boolean",
                      "x-example": true,
                      "description": "Is attribute required?"
                    },
                    "array": {
                      "anyOf": [
                        {
                          "type": "boolean"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": false,
                      "description": "Is attribute an array?"
                    },
                    "$createdAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute creation date in ISO 8601 format."
                    },
                    "$updatedAt": {
                      "type": "string",
                      "x-example": "2020-10-15T06:38:00.000+00:00",
                      "description": "Attribute update date in ISO 8601 format."
                    },
                    "size": {
                      "type": "integer",
                      "minimum": -9007199254740991,
                      "maximum": 9007199254740991,
                      "x-example": 128,
                      "description": "Attribute size."
                    },
                    "default": {
                      "anyOf": [
                        {
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": "default",
                      "description": "Default value for attribute when not provided. Cannot be set when attribute is required."
                    },
                    "encrypt": {
                      "anyOf": [
                        {
                          "type": "boolean"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "x-example": false,
                      "description": "Defines whether this attribute is encrypted or not."
                    }
                  },
                  "required": [
                    "key",
                    "type",
                    "status",
                    "error",
                    "required",
                    "$createdAt",
                    "$updatedAt",
                    "size"
                  ],
                  "additionalProperties": {},
                  "example": {
                    "key": "fullName",
                    "type": "string",
                    "status": "available",
                    "error": "string",
                    "required": true,
                    "array": false,
                    "$createdAt": "2020-10-15T06:38:00.000+00:00",
                    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
                    "size": 128,
                    "default": "default",
                    "encrypt": false
                  },
                  "description": "AttributeString"
                }
              ]
            },
            "x-example": {},
            "description": "Collection attributes."
          },
          "indexes": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "$id": {
                  "type": "string",
                  "x-example": "5e5ea5c16897e",
                  "description": "Index ID."
                },
                "$createdAt": {
                  "type": "string",
                  "x-example": "2020-10-15T06:38:00.000+00:00",
                  "description": "Index creation date in ISO 8601 format."
                },
                "$updatedAt": {
                  "type": "string",
                  "x-example": "2020-10-15T06:38:00.000+00:00",
                  "description": "Index update date in ISO 8601 format."
                },
                "key": {
                  "type": "string",
                  "x-example": "index1",
                  "description": "Index key."
                },
                "type": {
                  "type": "string",
                  "x-example": "primary",
                  "description": "Index type."
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "available",
                    "processing",
                    "deleting",
                    "stuck",
                    "failed"
                  ],
                  "x-example": "available",
                  "description": "Index status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
                },
                "error": {
                  "type": "string",
                  "x-example": "string",
                  "description": "Error message. Displays error generated on failure of creating or deleting an index."
                },
                "attributes": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "x-example": [],
                  "description": "Index attributes."
                },
                "lengths": {
                  "type": "array",
                  "items": {
                    "type": "integer",
                    "minimum": -9007199254740991,
                    "maximum": 9007199254740991
                  },
                  "x-example": [],
                  "description": "Index attributes length."
                },
                "orders": {
                  "anyOf": [
                    {
                      "type": "array",
                      "items": {
                        "type": "string"
                      }
                    },
                    {
                      "type": "null"
                    }
                  ],
                  "x-example": [],
                  "description": "Index orders."
                }
              },
              "required": [
                "$id",
                "$createdAt",
                "$updatedAt",
                "key",
                "type",
                "status",
                "error",
                "attributes",
                "lengths"
              ],
              "additionalProperties": {},
              "example": {
                "$id": "5e5ea5c16897e",
                "$createdAt": "2020-10-15T06:38:00.000+00:00",
                "$updatedAt": "2020-10-15T06:38:00.000+00:00",
                "key": "index1",
                "type": "primary",
                "status": "available",
                "error": "string",
                "attributes": [],
                "lengths": [],
                "orders": []
              },
              "description": "Index"
            },
            "x-example": {},
            "description": "Collection indexes."
          }
        },
        "required": [
          "$id",
          "$createdAt",
          "$updatedAt",
          "$permissions",
          "databaseId",
          "name",
          "enabled",
          "documentSecurity",
          "attributes",
          "indexes"
        ],
        "additionalProperties": {},
        "example": {
          "$id": "5e5ea5c16897e",
          "$createdAt": "2020-10-15T06:38:00.000+00:00",
          "$updatedAt": "2020-10-15T06:38:00.000+00:00",
          "$permissions": [
            "read(\"any\")"
          ],
          "databaseId": "5e5ea5c16897e",
          "name": "My Collection",
          "enabled": false,
          "documentSecurity": true,
          "attributes": {},
          "indexes": {}
        },
        "description": "Collection"
      },
      "x-example": "",
      "description": "List of collections."
    }
  },
  "required": [
    "total",
    "collections"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "collections": ""
  },
  "description": "Collections List"
} as const;

export const CollectionListSchema = z.fromJSONSchema(CollectionListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type CollectionList = z.infer<typeof CollectionListSchema>;
