/**
 * Schema for operation tracking table (_appwrite_operations)
 *
 * This table is created dynamically in each database to track long-running operations
 * like imports, exports, transfers, and backups.
 */

import { z } from "zod";

export interface OperationRecord {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  operationType: string;        // 'import', 'export', 'transfer', 'backup', etc.
  targetTable?: string;    // Optional: which collection is being operated on
  status: OperationStatus;
  progress: number;             // Current progress count
  total: number;                // Total items to process
  data?: any;                   // Optional: serialized operation data
  error?: string;               // Optional: error message if failed
}

export type OperationStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

export const OPERATION_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'failed',
  'cancelled'
] as const;

export const OperationStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'failed',
  'cancelled'
]);

export const OperationRecordSchema = z.object({
  $id: z.string(),
  $createdAt: z.string(),
  $updatedAt: z.string(),
  operationType: z.string(),
  targetTable: z.string().optional(),
  status: OperationStatusSchema,
  progress: z.number(),
  total: z.number(),
  data: z.any().optional(),
  error: z.string().optional()
});

export const OPERATIONS_TABLE_ID = "appwrite_operations";
export const OPERATIONS_TABLE_NAME = "Operations Tracking";
