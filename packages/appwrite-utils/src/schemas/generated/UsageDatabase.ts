// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const UsageDatabaseJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "range": {
      "type": "string",
      "x-example": "30d",
      "description": "Time range of the usage stats."
    },
    "collectionsTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated number of collections."
    },
    "tablesTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated number of tables."
    },
    "documentsTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated number of documents."
    },
    "rowsTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated number of rows."
    },
    "storageTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated number of total storage used in bytes."
    },
    "databaseReadsTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total number of databases reads."
    },
    "databaseWritesTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total number of databases writes."
    },
    "collections": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "value": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 1,
            "description": "The value of this metric at the timestamp."
          },
          "date": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "The date at which this metric was aggregated in ISO 8601 format."
          }
        },
        "required": [
          "value",
          "date"
        ],
        "additionalProperties": {},
        "example": {
          "value": 1,
          "date": "2020-10-15T06:38:00.000+00:00"
        },
        "description": "Metric"
      },
      "x-example": [],
      "description": "Aggregated  number of collections per period."
    },
    "tables": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "value": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 1,
            "description": "The value of this metric at the timestamp."
          },
          "date": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "The date at which this metric was aggregated in ISO 8601 format."
          }
        },
        "required": [
          "value",
          "date"
        ],
        "additionalProperties": {},
        "example": {
          "value": 1,
          "date": "2020-10-15T06:38:00.000+00:00"
        },
        "description": "Metric"
      },
      "x-example": [],
      "description": "Aggregated  number of tables per period."
    },
    "documents": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "value": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 1,
            "description": "The value of this metric at the timestamp."
          },
          "date": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "The date at which this metric was aggregated in ISO 8601 format."
          }
        },
        "required": [
          "value",
          "date"
        ],
        "additionalProperties": {},
        "example": {
          "value": 1,
          "date": "2020-10-15T06:38:00.000+00:00"
        },
        "description": "Metric"
      },
      "x-example": [],
      "description": "Aggregated  number of documents per period."
    },
    "rows": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "value": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 1,
            "description": "The value of this metric at the timestamp."
          },
          "date": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "The date at which this metric was aggregated in ISO 8601 format."
          }
        },
        "required": [
          "value",
          "date"
        ],
        "additionalProperties": {},
        "example": {
          "value": 1,
          "date": "2020-10-15T06:38:00.000+00:00"
        },
        "description": "Metric"
      },
      "x-example": [],
      "description": "Aggregated  number of rows per period."
    },
    "storage": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "value": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 1,
            "description": "The value of this metric at the timestamp."
          },
          "date": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "The date at which this metric was aggregated in ISO 8601 format."
          }
        },
        "required": [
          "value",
          "date"
        ],
        "additionalProperties": {},
        "example": {
          "value": 1,
          "date": "2020-10-15T06:38:00.000+00:00"
        },
        "description": "Metric"
      },
      "x-example": [],
      "description": "Aggregated storage used in bytes per period."
    },
    "databaseReads": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "value": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 1,
            "description": "The value of this metric at the timestamp."
          },
          "date": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "The date at which this metric was aggregated in ISO 8601 format."
          }
        },
        "required": [
          "value",
          "date"
        ],
        "additionalProperties": {},
        "example": {
          "value": 1,
          "date": "2020-10-15T06:38:00.000+00:00"
        },
        "description": "Metric"
      },
      "x-example": [],
      "description": "An array of aggregated number of database reads."
    },
    "databaseWrites": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "value": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 1,
            "description": "The value of this metric at the timestamp."
          },
          "date": {
            "type": "string",
            "x-example": "2020-10-15T06:38:00.000+00:00",
            "description": "The date at which this metric was aggregated in ISO 8601 format."
          }
        },
        "required": [
          "value",
          "date"
        ],
        "additionalProperties": {},
        "example": {
          "value": 1,
          "date": "2020-10-15T06:38:00.000+00:00"
        },
        "description": "Metric"
      },
      "x-example": [],
      "description": "An array of aggregated number of database writes."
    }
  },
  "required": [
    "range",
    "collectionsTotal",
    "tablesTotal",
    "documentsTotal",
    "rowsTotal",
    "storageTotal",
    "databaseReadsTotal",
    "databaseWritesTotal",
    "collections",
    "tables",
    "documents",
    "rows",
    "storage",
    "databaseReads",
    "databaseWrites"
  ],
  "additionalProperties": {},
  "example": {
    "range": "30d",
    "collectionsTotal": 0,
    "tablesTotal": 0,
    "documentsTotal": 0,
    "rowsTotal": 0,
    "storageTotal": 0,
    "databaseReadsTotal": 0,
    "databaseWritesTotal": 0,
    "collections": [],
    "tables": [],
    "documents": [],
    "rows": [],
    "storage": [],
    "databaseReads": [],
    "databaseWrites": []
  },
  "description": "UsageDatabase"
} as const;

export const UsageDatabaseSchema = z.fromJSONSchema(UsageDatabaseJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type UsageDatabase = z.infer<typeof UsageDatabaseSchema>;
