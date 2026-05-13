// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const UsageProjectJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "executionsTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated number of function executions."
    },
    "documentsTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated  number of documents."
    },
    "rowsTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated  number of rows."
    },
    "databasesTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated number of databases."
    },
    "databasesStorageTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated sum of databases storage size (in bytes)."
    },
    "usersTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated number of users."
    },
    "filesStorageTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated sum of files storage size (in bytes)."
    },
    "functionsStorageTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated sum of functions storage size (in bytes)."
    },
    "buildsStorageTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated sum of builds storage size (in bytes)."
    },
    "deploymentsStorageTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated sum of deployments storage size (in bytes)."
    },
    "bucketsTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated number of buckets."
    },
    "executionsMbSecondsTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated number of function executions mbSeconds."
    },
    "buildsMbSecondsTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated number of function builds mbSeconds."
    },
    "databasesReadsTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total number of databases reads."
    },
    "databasesWritesTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total number of databases writes."
    },
    "requests": {
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
      "description": "Aggregated  number of requests per period."
    },
    "network": {
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
      "description": "Aggregated number of consumed bandwidth per period."
    },
    "users": {
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
      "description": "Aggregated number of users per period."
    },
    "executions": {
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
      "description": "Aggregated number of executions per period."
    },
    "executionsBreakdown": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "resourceId": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "x-example": "5e5ea5c16897e",
            "description": "Resource ID."
          },
          "name": {
            "type": "string",
            "x-example": "Documents",
            "description": "Resource name."
          },
          "value": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 1,
            "description": "The value of this metric at the timestamp."
          },
          "estimate": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "x-example": 1,
            "description": "The estimated value of this metric at the end of the period."
          }
        },
        "required": [
          "name",
          "value"
        ],
        "additionalProperties": {},
        "example": {
          "resourceId": "5e5ea5c16897e",
          "name": "Documents",
          "value": 1,
          "estimate": 1
        },
        "description": "Metric Breakdown"
      },
      "x-example": [],
      "description": "Aggregated breakdown in totals of executions by functions."
    },
    "bucketsBreakdown": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "resourceId": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "x-example": "5e5ea5c16897e",
            "description": "Resource ID."
          },
          "name": {
            "type": "string",
            "x-example": "Documents",
            "description": "Resource name."
          },
          "value": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 1,
            "description": "The value of this metric at the timestamp."
          },
          "estimate": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "x-example": 1,
            "description": "The estimated value of this metric at the end of the period."
          }
        },
        "required": [
          "name",
          "value"
        ],
        "additionalProperties": {},
        "example": {
          "resourceId": "5e5ea5c16897e",
          "name": "Documents",
          "value": 1,
          "estimate": 1
        },
        "description": "Metric Breakdown"
      },
      "x-example": [],
      "description": "Aggregated breakdown in totals of usage by buckets."
    },
    "databasesStorageBreakdown": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "resourceId": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "x-example": "5e5ea5c16897e",
            "description": "Resource ID."
          },
          "name": {
            "type": "string",
            "x-example": "Documents",
            "description": "Resource name."
          },
          "value": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 1,
            "description": "The value of this metric at the timestamp."
          },
          "estimate": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "x-example": 1,
            "description": "The estimated value of this metric at the end of the period."
          }
        },
        "required": [
          "name",
          "value"
        ],
        "additionalProperties": {},
        "example": {
          "resourceId": "5e5ea5c16897e",
          "name": "Documents",
          "value": 1,
          "estimate": 1
        },
        "description": "Metric Breakdown"
      },
      "x-example": [],
      "description": "An array of the aggregated breakdown of storage usage by databases."
    },
    "executionsMbSecondsBreakdown": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "resourceId": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "x-example": "5e5ea5c16897e",
            "description": "Resource ID."
          },
          "name": {
            "type": "string",
            "x-example": "Documents",
            "description": "Resource name."
          },
          "value": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 1,
            "description": "The value of this metric at the timestamp."
          },
          "estimate": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "x-example": 1,
            "description": "The estimated value of this metric at the end of the period."
          }
        },
        "required": [
          "name",
          "value"
        ],
        "additionalProperties": {},
        "example": {
          "resourceId": "5e5ea5c16897e",
          "name": "Documents",
          "value": 1,
          "estimate": 1
        },
        "description": "Metric Breakdown"
      },
      "x-example": [],
      "description": "Aggregated breakdown in totals of execution mbSeconds by functions."
    },
    "buildsMbSecondsBreakdown": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "resourceId": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "x-example": "5e5ea5c16897e",
            "description": "Resource ID."
          },
          "name": {
            "type": "string",
            "x-example": "Documents",
            "description": "Resource name."
          },
          "value": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 1,
            "description": "The value of this metric at the timestamp."
          },
          "estimate": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "x-example": 1,
            "description": "The estimated value of this metric at the end of the period."
          }
        },
        "required": [
          "name",
          "value"
        ],
        "additionalProperties": {},
        "example": {
          "resourceId": "5e5ea5c16897e",
          "name": "Documents",
          "value": 1,
          "estimate": 1
        },
        "description": "Metric Breakdown"
      },
      "x-example": [],
      "description": "Aggregated breakdown in totals of build mbSeconds by functions."
    },
    "functionsStorageBreakdown": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "resourceId": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "x-example": "5e5ea5c16897e",
            "description": "Resource ID."
          },
          "name": {
            "type": "string",
            "x-example": "Documents",
            "description": "Resource name."
          },
          "value": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 1,
            "description": "The value of this metric at the timestamp."
          },
          "estimate": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "x-example": 1,
            "description": "The estimated value of this metric at the end of the period."
          }
        },
        "required": [
          "name",
          "value"
        ],
        "additionalProperties": {},
        "example": {
          "resourceId": "5e5ea5c16897e",
          "name": "Documents",
          "value": 1,
          "estimate": 1
        },
        "description": "Metric Breakdown"
      },
      "x-example": [],
      "description": "Aggregated breakdown in totals of functions storage size (in bytes)."
    },
    "authPhoneTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated number of phone auth."
    },
    "authPhoneEstimate": {
      "type": "number",
      "x-example": 0,
      "description": "Estimated total aggregated cost of phone auth."
    },
    "authPhoneCountryBreakdown": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "resourceId": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "x-example": "5e5ea5c16897e",
            "description": "Resource ID."
          },
          "name": {
            "type": "string",
            "x-example": "Documents",
            "description": "Resource name."
          },
          "value": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991,
            "x-example": 1,
            "description": "The value of this metric at the timestamp."
          },
          "estimate": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "x-example": 1,
            "description": "The estimated value of this metric at the end of the period."
          }
        },
        "required": [
          "name",
          "value"
        ],
        "additionalProperties": {},
        "example": {
          "resourceId": "5e5ea5c16897e",
          "name": "Documents",
          "value": 1,
          "estimate": 1
        },
        "description": "Metric Breakdown"
      },
      "x-example": [],
      "description": "Aggregated breakdown in totals of phone auth by country."
    },
    "databasesReads": {
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
    "databasesWrites": {
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
    },
    "imageTransformations": {
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
      "description": "An array of aggregated number of image transformations."
    },
    "imageTransformationsTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated number of image transformations."
    }
  },
  "required": [
    "executionsTotal",
    "documentsTotal",
    "rowsTotal",
    "databasesTotal",
    "databasesStorageTotal",
    "usersTotal",
    "filesStorageTotal",
    "functionsStorageTotal",
    "buildsStorageTotal",
    "deploymentsStorageTotal",
    "bucketsTotal",
    "executionsMbSecondsTotal",
    "buildsMbSecondsTotal",
    "databasesReadsTotal",
    "databasesWritesTotal",
    "requests",
    "network",
    "users",
    "executions",
    "executionsBreakdown",
    "bucketsBreakdown",
    "databasesStorageBreakdown",
    "executionsMbSecondsBreakdown",
    "buildsMbSecondsBreakdown",
    "functionsStorageBreakdown",
    "authPhoneTotal",
    "authPhoneEstimate",
    "authPhoneCountryBreakdown",
    "databasesReads",
    "databasesWrites",
    "imageTransformations",
    "imageTransformationsTotal"
  ],
  "additionalProperties": {},
  "example": {
    "executionsTotal": 0,
    "documentsTotal": 0,
    "rowsTotal": 0,
    "databasesTotal": 0,
    "databasesStorageTotal": 0,
    "usersTotal": 0,
    "filesStorageTotal": 0,
    "functionsStorageTotal": 0,
    "buildsStorageTotal": 0,
    "deploymentsStorageTotal": 0,
    "bucketsTotal": 0,
    "executionsMbSecondsTotal": 0,
    "buildsMbSecondsTotal": 0,
    "databasesReadsTotal": 0,
    "databasesWritesTotal": 0,
    "requests": [],
    "network": [],
    "users": [],
    "executions": [],
    "executionsBreakdown": [],
    "bucketsBreakdown": [],
    "databasesStorageBreakdown": [],
    "executionsMbSecondsBreakdown": [],
    "buildsMbSecondsBreakdown": [],
    "functionsStorageBreakdown": [],
    "authPhoneTotal": 0,
    "authPhoneEstimate": 0,
    "authPhoneCountryBreakdown": [],
    "databasesReads": [],
    "databasesWrites": [],
    "imageTransformations": [],
    "imageTransformationsTotal": 0
  },
  "description": "UsageProject"
} as const;

export const UsageProjectSchema = z.fromJSONSchema(UsageProjectJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type UsageProject = z.infer<typeof UsageProjectSchema>;
