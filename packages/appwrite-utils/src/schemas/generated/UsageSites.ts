// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const UsageSitesJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "range": {
      "type": "string",
      "x-example": "30d",
      "description": "Time range of the usage stats."
    },
    "deploymentsTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated number of functions deployments."
    },
    "deploymentsStorageTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated sum of functions deployment storage."
    },
    "buildsTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated number of functions build."
    },
    "buildsStorageTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "total aggregated sum of functions build storage."
    },
    "buildsTimeTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated sum of functions build compute time."
    },
    "buildsMbSecondsTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated sum of functions build mbSeconds."
    },
    "executionsTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total  aggregated number of functions execution."
    },
    "executionsTimeTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated sum of functions  execution compute time."
    },
    "executionsMbSecondsTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated sum of functions execution mbSeconds."
    },
    "deployments": {
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
      "description": "Aggregated number of functions deployment per period."
    },
    "deploymentsStorage": {
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
      "description": "Aggregated number of  functions deployment storage per period."
    },
    "buildsSuccessTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated number of successful function builds."
    },
    "buildsFailedTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated number of failed function builds."
    },
    "builds": {
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
      "description": "Aggregated number of functions build per period."
    },
    "buildsStorage": {
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
      "description": "Aggregated sum of functions build storage per period."
    },
    "buildsTime": {
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
      "description": "Aggregated sum of  functions build compute time per period."
    },
    "buildsMbSeconds": {
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
      "description": "Aggregated sum of functions build mbSeconds per period."
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
      "description": "Aggregated number of  functions execution per period."
    },
    "executionsTime": {
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
      "description": "Aggregated number of functions execution compute time per period."
    },
    "executionsMbSeconds": {
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
      "description": "Aggregated number of functions mbSeconds per period."
    },
    "buildsSuccess": {
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
      "description": "Aggregated number of successful function builds per period."
    },
    "buildsFailed": {
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
      "description": "Aggregated number of failed function builds per period."
    },
    "sitesTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated number of sites."
    },
    "sites": {
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
      "description": "Aggregated number of sites per period."
    },
    "requestsTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated number of requests."
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
      "description": "Aggregated number of requests per period."
    },
    "inboundTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated inbound bandwidth."
    },
    "inbound": {
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
      "description": "Aggregated number of inbound bandwidth per period."
    },
    "outboundTotal": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991,
      "x-example": 0,
      "description": "Total aggregated outbound bandwidth."
    },
    "outbound": {
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
      "description": "Aggregated number of outbound bandwidth per period."
    }
  },
  "required": [
    "range",
    "deploymentsTotal",
    "deploymentsStorageTotal",
    "buildsTotal",
    "buildsStorageTotal",
    "buildsTimeTotal",
    "buildsMbSecondsTotal",
    "executionsTotal",
    "executionsTimeTotal",
    "executionsMbSecondsTotal",
    "deployments",
    "deploymentsStorage",
    "buildsSuccessTotal",
    "buildsFailedTotal",
    "builds",
    "buildsStorage",
    "buildsTime",
    "buildsMbSeconds",
    "executions",
    "executionsTime",
    "executionsMbSeconds",
    "buildsSuccess",
    "buildsFailed",
    "sitesTotal",
    "sites",
    "requestsTotal",
    "requests",
    "inboundTotal",
    "inbound",
    "outboundTotal",
    "outbound"
  ],
  "additionalProperties": {},
  "example": {
    "range": "30d",
    "deploymentsTotal": 0,
    "deploymentsStorageTotal": 0,
    "buildsTotal": 0,
    "buildsStorageTotal": 0,
    "buildsTimeTotal": 0,
    "buildsMbSecondsTotal": 0,
    "executionsTotal": 0,
    "executionsTimeTotal": 0,
    "executionsMbSecondsTotal": 0,
    "deployments": [],
    "deploymentsStorage": [],
    "buildsSuccessTotal": 0,
    "buildsFailedTotal": 0,
    "builds": [],
    "buildsStorage": [],
    "buildsTime": [],
    "buildsMbSeconds": [],
    "executions": [],
    "executionsTime": [],
    "executionsMbSeconds": [],
    "buildsSuccess": [],
    "buildsFailed": [],
    "sitesTotal": 0,
    "sites": [],
    "requestsTotal": 0,
    "requests": [],
    "inboundTotal": 0,
    "inbound": [],
    "outboundTotal": 0,
    "outbound": []
  },
  "description": "UsageSites"
} as const;

export const UsageSitesSchema = z.fromJSONSchema(UsageSitesJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type UsageSites = z.infer<typeof UsageSitesSchema>;
