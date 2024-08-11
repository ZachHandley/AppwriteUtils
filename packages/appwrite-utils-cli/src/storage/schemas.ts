import { z } from "zod";
import {
  attributeSchema,
  type Attribute,
  parseAttribute,
  CollectionCreateSchema,
} from "appwrite-utils";

export const BackupSchema = z.object({
  $id: z.string(),
  $createdAt: z.string(),
  $updatedAt: z.string(),
  database: z.string(),
  collections: z.array(z.string()),
  documents: z
    .array(
      z.object({
        collectionId: z.string(),
        data: z.string(),
      })
    )
    .default([]),
});

export type Backup = z.infer<typeof BackupSchema>;

export const BackupCreateSchema = BackupSchema.omit({
  $id: true,
  $createdAt: true,
  $updatedAt: true,
});

export type BackupCreate = z.infer<typeof BackupCreateSchema>;

export const BatchSchema = z.object({
  $id: z.string(),
  $createdAt: z.string(),
  $updatedAt: z.string(),
  data: z.string().describe("The serialized data for this batch"),
  processed: z
    .boolean()
    .default(false)
    .describe("Whether the batch has been processed"),
});

export type Batch = z.infer<typeof BatchSchema>;

export const BatchCreateSchema = BatchSchema.omit({
  $id: true,
  $createdAt: true,
  $updatedAt: true,
});

export type BatchCreate = z.infer<typeof BatchCreateSchema>;

export const OperationSchema = z.object({
  $id: z.string(),
  $createdAt: z.string(),
  $updatedAt: z.string(),
  operationType: z.string(),
  collectionId: z.string(),
  data: z.any(),
  batches: z.array(z.string()).default([]).optional(),
  progress: z.number(),
  total: z.number(),
  error: z.string(),
  status: z
    .enum([
      "pending",
      "ready",
      "in_progress",
      "completed",
      "error",
      "cancelled",
    ])
    .default("pending"),
});

export type Operation = z.infer<typeof OperationSchema>;

export const OperationCreateSchema = OperationSchema.omit({
  $id: true,
  $createdAt: true,
  $updatedAt: true,
});

export type OperationCreate = z.infer<typeof OperationCreateSchema>;

export const getMigrationCollectionSchemas = () => {
  const currentOperationsAttributes: Attribute[] = [
    parseAttribute({
      key: "operationType",
      type: "string",
      error: "Invalid Operation Type",
      size: 50,
      required: true,
      array: false,
      xdefault: null,
    }),
    attributeSchema.parse({
      key: "collectionId",
      type: "string",
      error: "Invalid Collection Id",
      size: 50,
      array: false,
      xdefault: null,
    }),
    attributeSchema.parse({
      key: "batches",
      type: "string",
      error: "Invalid Batches",
      size: 1073741824,
      array: true,
    }),
    attributeSchema.parse({
      key: "data",
      type: "string",
      error: "Invalid Data",
      size: 1073741824,
    }),
    attributeSchema.parse({
      key: "progress",
      type: "integer",
      error: "Invalid Progress",
      required: true,
      array: false,
    }),
    attributeSchema.parse({
      key: "total",
      type: "integer",
      error: "Invalid Total",
      required: true,
      array: false,
    }),
    attributeSchema.parse({
      key: "error",
      type: "string",
      error: "Operation Error",
      required: false,
      array: false,
    }),
    attributeSchema.parse({
      key: "status",
      type: "enum",
      elements: [
        "pending",
        "ready",
        "in_progress",
        "completed",
        "error",
        "cancelled",
      ],
      error: "Invalid Status",
      array: false,
      xdefault: "pending",
    }),
  ];

  const currentOperationsConfig = CollectionCreateSchema.parse({
    name: "CurrentOperations",
    enabled: true,
    documentSecurity: false,
    attributes: [],
    indexes: [],
  });

  const batchesAttributes: Attribute[] = [
    attributeSchema.parse({
      key: "data",
      type: "string",
      size: 1073741824,
      error: "Invalid Data",
      required: true,
      array: false,
    }),
    attributeSchema.parse({
      key: "processed",
      type: "boolean",
      error: "Invalid Processed",
      required: true,
      array: false,
      xdefault: false,
    }),
  ];

  const batchesConfig = CollectionCreateSchema.parse({
    name: "Batches",
    enabled: true,
    documentSecurity: false,
    attributes: [],
    indexes: [],
  });

  const toReturn = {
    CurrentOperations: {
      collection: currentOperationsConfig,
      attributes: currentOperationsAttributes,
    },
    Batches: {
      collection: batchesConfig,
      attributes: batchesAttributes,
    },
  };
  return toReturn;
};
