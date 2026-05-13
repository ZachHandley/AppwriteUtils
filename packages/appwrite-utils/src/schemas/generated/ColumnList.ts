// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const ColumnListJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 5,
      "description": "Total number of columns in the given table."
    },
    "columns": {
      "type": "array",
      "items": {
        "anyOf": [
          {
            "type": "object",
            "properties": {
              "key": {
                "type": "string",
                "x-example": "isEnabled",
                "description": "Column Key."
              },
              "type": {
                "type": "string",
                "x-example": "boolean",
                "description": "Column type."
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
                "x-enum-name": "ColumnStatus",
                "description": "Column status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
              },
              "error": {
                "type": "string",
                "x-example": "string",
                "description": "Error message. Displays error generated on failure of creating or deleting an column."
              },
              "required": {
                "type": "boolean",
                "x-example": true,
                "description": "Is column required?"
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
                "description": "Is column an array?"
              },
              "$createdAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column creation date in ISO 8601 format."
              },
              "$updatedAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column update date in ISO 8601 format."
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
                "description": "Default value for column when not provided. Cannot be set when column is required."
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
            "description": "ColumnBoolean"
          },
          {
            "type": "object",
            "properties": {
              "key": {
                "type": "string",
                "x-example": "count",
                "description": "Column Key."
              },
              "type": {
                "type": "string",
                "x-example": "integer",
                "description": "Column type."
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
                "x-enum-name": "ColumnStatus",
                "description": "Column status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
              },
              "error": {
                "type": "string",
                "x-example": "string",
                "description": "Error message. Displays error generated on failure of creating or deleting an column."
              },
              "required": {
                "type": "boolean",
                "x-example": true,
                "description": "Is column required?"
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
                "description": "Is column an array?"
              },
              "$createdAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column creation date in ISO 8601 format."
              },
              "$updatedAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column update date in ISO 8601 format."
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
                "description": "Default value for column when not provided. Cannot be set when column is required."
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
            "description": "ColumnInteger"
          },
          {
            "type": "object",
            "properties": {
              "key": {
                "type": "string",
                "x-example": "percentageCompleted",
                "description": "Column Key."
              },
              "type": {
                "type": "string",
                "x-example": "double",
                "description": "Column type."
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
                "x-enum-name": "ColumnStatus",
                "description": "Column status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
              },
              "error": {
                "type": "string",
                "x-example": "string",
                "description": "Error message. Displays error generated on failure of creating or deleting an column."
              },
              "required": {
                "type": "boolean",
                "x-example": true,
                "description": "Is column required?"
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
                "description": "Is column an array?"
              },
              "$createdAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column creation date in ISO 8601 format."
              },
              "$updatedAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column update date in ISO 8601 format."
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
                "description": "Default value for column when not provided. Cannot be set when column is required."
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
            "description": "ColumnFloat"
          },
          {
            "type": "object",
            "properties": {
              "key": {
                "type": "string",
                "x-example": "userEmail",
                "description": "Column Key."
              },
              "type": {
                "type": "string",
                "x-example": "string",
                "description": "Column type."
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
                "x-enum-name": "ColumnStatus",
                "description": "Column status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
              },
              "error": {
                "type": "string",
                "x-example": "string",
                "description": "Error message. Displays error generated on failure of creating or deleting an column."
              },
              "required": {
                "type": "boolean",
                "x-example": true,
                "description": "Is column required?"
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
                "description": "Is column an array?"
              },
              "$createdAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column creation date in ISO 8601 format."
              },
              "$updatedAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column update date in ISO 8601 format."
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
                "description": "Default value for column when not provided. Cannot be set when column is required."
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
            "description": "ColumnEmail"
          },
          {
            "type": "object",
            "properties": {
              "key": {
                "type": "string",
                "x-example": "status",
                "description": "Column Key."
              },
              "type": {
                "type": "string",
                "x-example": "string",
                "description": "Column type."
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
                "x-enum-name": "ColumnStatus",
                "description": "Column status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
              },
              "error": {
                "type": "string",
                "x-example": "string",
                "description": "Error message. Displays error generated on failure of creating or deleting an column."
              },
              "required": {
                "type": "boolean",
                "x-example": true,
                "description": "Is column required?"
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
                "description": "Is column an array?"
              },
              "$createdAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column creation date in ISO 8601 format."
              },
              "$updatedAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column update date in ISO 8601 format."
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
                "description": "Default value for column when not provided. Cannot be set when column is required."
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
            "description": "ColumnEnum"
          },
          {
            "type": "object",
            "properties": {
              "key": {
                "type": "string",
                "x-example": "githubUrl",
                "description": "Column Key."
              },
              "type": {
                "type": "string",
                "x-example": "string",
                "description": "Column type."
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
                "x-enum-name": "ColumnStatus",
                "description": "Column status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
              },
              "error": {
                "type": "string",
                "x-example": "string",
                "description": "Error message. Displays error generated on failure of creating or deleting an column."
              },
              "required": {
                "type": "boolean",
                "x-example": true,
                "description": "Is column required?"
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
                "description": "Is column an array?"
              },
              "$createdAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column creation date in ISO 8601 format."
              },
              "$updatedAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column update date in ISO 8601 format."
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
                "x-example": "https://example.com",
                "description": "Default value for column when not provided. Cannot be set when column is required."
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
              "default": "https://example.com"
            },
            "description": "ColumnURL"
          },
          {
            "type": "object",
            "properties": {
              "key": {
                "type": "string",
                "x-example": "ipAddress",
                "description": "Column Key."
              },
              "type": {
                "type": "string",
                "x-example": "string",
                "description": "Column type."
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
                "x-enum-name": "ColumnStatus",
                "description": "Column status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
              },
              "error": {
                "type": "string",
                "x-example": "string",
                "description": "Error message. Displays error generated on failure of creating or deleting an column."
              },
              "required": {
                "type": "boolean",
                "x-example": true,
                "description": "Is column required?"
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
                "description": "Is column an array?"
              },
              "$createdAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column creation date in ISO 8601 format."
              },
              "$updatedAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column update date in ISO 8601 format."
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
                "description": "Default value for column when not provided. Cannot be set when column is required."
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
            "description": "ColumnIP"
          },
          {
            "type": "object",
            "properties": {
              "key": {
                "type": "string",
                "x-example": "birthDay",
                "description": "Column Key."
              },
              "type": {
                "type": "string",
                "x-example": "datetime",
                "description": "Column type."
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
                "x-enum-name": "ColumnStatus",
                "description": "Column status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
              },
              "error": {
                "type": "string",
                "x-example": "string",
                "description": "Error message. Displays error generated on failure of creating or deleting an column."
              },
              "required": {
                "type": "boolean",
                "x-example": true,
                "description": "Is column required?"
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
                "description": "Is column an array?"
              },
              "$createdAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column creation date in ISO 8601 format."
              },
              "$updatedAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column update date in ISO 8601 format."
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
                "description": "Default value for column when not provided. Only null is optional"
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
            "description": "ColumnDatetime"
          },
          {
            "type": "object",
            "properties": {
              "key": {
                "type": "string",
                "x-example": "fullName",
                "description": "Column Key."
              },
              "type": {
                "type": "string",
                "x-example": "string",
                "description": "Column type."
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
                "x-enum-name": "ColumnStatus",
                "description": "Column status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
              },
              "error": {
                "type": "string",
                "x-example": "string",
                "description": "Error message. Displays error generated on failure of creating or deleting an column."
              },
              "required": {
                "type": "boolean",
                "x-example": true,
                "description": "Is column required?"
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
                "description": "Is column an array?"
              },
              "$createdAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column creation date in ISO 8601 format."
              },
              "$updatedAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column update date in ISO 8601 format."
              },
              "relatedTable": {
                "type": "string",
                "x-example": "table",
                "description": "The ID of the related table."
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
              "relatedTable",
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
              "relatedTable": "table",
              "relationType": "oneToOne|oneToMany|manyToOne|manyToMany",
              "twoWay": false,
              "twoWayKey": "string",
              "onDelete": "restrict|cascade|setNull",
              "side": "parent|child"
            },
            "description": "ColumnRelationship"
          },
          {
            "type": "object",
            "properties": {
              "key": {
                "type": "string",
                "x-example": "fullName",
                "description": "Column Key."
              },
              "type": {
                "type": "string",
                "x-example": "string",
                "description": "Column type."
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
                "x-enum-name": "ColumnStatus",
                "description": "Column status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
              },
              "error": {
                "type": "string",
                "x-example": "string",
                "description": "Error message. Displays error generated on failure of creating or deleting an column."
              },
              "required": {
                "type": "boolean",
                "x-example": true,
                "description": "Is column required?"
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
                "description": "Is column an array?"
              },
              "$createdAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column creation date in ISO 8601 format."
              },
              "$updatedAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column update date in ISO 8601 format."
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
                "description": "Default value for column when not provided. Cannot be set when column is required."
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
            "description": "ColumnPoint"
          },
          {
            "type": "object",
            "properties": {
              "key": {
                "type": "string",
                "x-example": "fullName",
                "description": "Column Key."
              },
              "type": {
                "type": "string",
                "x-example": "string",
                "description": "Column type."
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
                "x-enum-name": "ColumnStatus",
                "description": "Column status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
              },
              "error": {
                "type": "string",
                "x-example": "string",
                "description": "Error message. Displays error generated on failure of creating or deleting an column."
              },
              "required": {
                "type": "boolean",
                "x-example": true,
                "description": "Is column required?"
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
                "description": "Is column an array?"
              },
              "$createdAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column creation date in ISO 8601 format."
              },
              "$updatedAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column update date in ISO 8601 format."
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
                "description": "Default value for column when not provided. Cannot be set when column is required."
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
            "description": "ColumnLine"
          },
          {
            "type": "object",
            "properties": {
              "key": {
                "type": "string",
                "x-example": "fullName",
                "description": "Column Key."
              },
              "type": {
                "type": "string",
                "x-example": "string",
                "description": "Column type."
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
                "x-enum-name": "ColumnStatus",
                "description": "Column status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
              },
              "error": {
                "type": "string",
                "x-example": "string",
                "description": "Error message. Displays error generated on failure of creating or deleting an column."
              },
              "required": {
                "type": "boolean",
                "x-example": true,
                "description": "Is column required?"
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
                "description": "Is column an array?"
              },
              "$createdAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column creation date in ISO 8601 format."
              },
              "$updatedAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column update date in ISO 8601 format."
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
                "description": "Default value for column when not provided. Cannot be set when column is required."
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
            "description": "ColumnPolygon"
          },
          {
            "type": "object",
            "properties": {
              "key": {
                "type": "string",
                "x-example": "fullName",
                "description": "Column Key."
              },
              "type": {
                "type": "string",
                "x-example": "string",
                "description": "Column type."
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
                "x-enum-name": "ColumnStatus",
                "description": "Column status. Possible values: `available`, `processing`, `deleting`, `stuck`, or `failed`"
              },
              "error": {
                "type": "string",
                "x-example": "string",
                "description": "Error message. Displays error generated on failure of creating or deleting an column."
              },
              "required": {
                "type": "boolean",
                "x-example": true,
                "description": "Is column required?"
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
                "description": "Is column an array?"
              },
              "$createdAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column creation date in ISO 8601 format."
              },
              "$updatedAt": {
                "type": "string",
                "x-example": "2020-10-15T06:38:00.000+00:00",
                "description": "Column update date in ISO 8601 format."
              },
              "size": {
                "type": "integer",
                "minimum": -9007199254740991,
                "maximum": 9007199254740991,
                "x-example": 128,
                "description": "Column size."
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
                "description": "Default value for column when not provided. Cannot be set when column is required."
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
                "description": "Defines whether this column is encrypted or not."
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
            "description": "ColumnString"
          }
        ]
      },
      "x-example": "",
      "description": "List of columns."
    }
  },
  "required": [
    "total",
    "columns"
  ],
  "additionalProperties": {},
  "example": {
    "total": 5,
    "columns": ""
  },
  "description": "Columns List"
} as const;

export const ColumnListSchema = z.fromJSONSchema(ColumnListJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type ColumnList = z.infer<typeof ColumnListSchema>;
