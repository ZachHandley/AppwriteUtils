import type { DatabaseAdapter } from "appwrite-utils-helpers";
import { logger } from 'appwrite-utils-helpers';
import { tryAwaitWithRetry } from "appwrite-utils-helpers";
import { Query, ID } from "node-appwrite";
import {
	OPERATIONS_TABLE_ID,
	OPERATIONS_TABLE_NAME,
	type OperationRecord,
	type OperationStatus,
	OperationRecordSchema,
} from "./operationsTableSchema.js";

/**
 * Operations Table Manager
 *
 * Manages dynamic operations tracking tables in each database.
 * Creates _appwrite_operations table on-demand for tracking imports, exports, transfers, etc.
 */

/**
 * Checks if operations table exists in database
 */
async function tableExists(
	db: DatabaseAdapter,
	databaseId: string,
): Promise<boolean> {
	try {
		await db.getTable({ databaseId, tableId: OPERATIONS_TABLE_ID });
		return true;
	} catch (error) {
		return false;
	}
}

/**
 * Creates the operations tracking table in the specified database
 * Table is created with underscore prefix to indicate it's a system table
 */
export async function createOperationsTable(
	db: DatabaseAdapter,
	databaseId: string,
): Promise<void> {
	// Check if table already exists
	const exists = await tableExists(db, databaseId);
	if (exists) {
		logger.debug("Operations table already exists", {
			databaseId,
			tableId: OPERATIONS_TABLE_ID,
		});
		return;
	}

	logger.info("Creating operations tracking table", {
		databaseId,
		tableId: OPERATIONS_TABLE_ID,
	});

	// Create table
	await tryAwaitWithRetry(async () => {
		await db.createTable({
			databaseId,
			id: OPERATIONS_TABLE_ID,
			name: OPERATIONS_TABLE_NAME,
		});
	});

	// Create attributes with retry logic
	const attributes = [
		{
			key: "operationType",
			type: "string",
			size: 50,
			required: true,
		},
		{
			key: "targetCollection",
			type: "string",
			size: 50,
			required: false,
		},
		{
			key: "status",
			type: "enum",
			elements: ["pending", "in_progress", "completed", "failed", "cancelled"],
			required: true,
			default: "pending",
		},
		{
			key: "progress",
			type: "integer",
			required: true,
			default: 0,
		},
		{
			key: "total",
			type: "integer",
			required: true,
			default: 0,
		},
		{
			key: "data",
			type: "string",
			size: 1048576, // 1MB for serialized data
			required: false,
		},
		{
			key: "error",
			type: "string",
			size: 10000,
			required: false,
		},
	];

	for (const attr of attributes) {
		await tryAwaitWithRetry(async () => {
			await db.createAttribute({
				databaseId,
				tableId: OPERATIONS_TABLE_ID,
				...attr,
			});
		});
	}

	logger.info("Operations tracking table created successfully", {
		databaseId,
		tableId: OPERATIONS_TABLE_ID,
		attributes: attributes.length,
	});
}

/**
 * Finds an existing operation or creates a new one
 * Useful for resuming interrupted operations
 */
export async function findOrCreateOperation(
	db: DatabaseAdapter,
	databaseId: string,
	operationType: string,
	params?: Partial<OperationRecord>,
): Promise<OperationRecord> {
	// Ensure operations table exists
	await createOperationsTable(db, databaseId);

	// Try to find existing pending operation
	try {
		const queries = [
			Query.equal("operationType", operationType),
			Query.equal("status", "pending"),
		];

		if (params?.targetCollection) {
			queries.push(Query.equal("targetCollection", params.targetCollection));
		}

		const response = await db.listRows({
			databaseId,
			tableId: OPERATIONS_TABLE_ID,
			queries,
		});

		if (response.rows && response.rows.length > 0) {
			logger.debug("Found existing operation", {
				operationId: response.rows[0].$id,
				operationType,
			});
			return response.rows[0] as OperationRecord;
		}
	} catch (error) {
		logger.debug("No existing operation found, creating new one", {
			operationType,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	// Create new operation
	const newOperation = {
		operationType,
		targetCollection: params?.targetCollection,
		status: "pending" as OperationStatus,
		progress: params?.progress ?? 0,
		total: params?.total ?? 0,
		data: params?.data ? JSON.stringify(params.data) : undefined,
		error: params?.error,
	};

	const result = await db.createRow({
		databaseId,
		tableId: OPERATIONS_TABLE_ID,
		id: ID.unique(),
		data: newOperation,
	});

	logger.info("Created new operation", {
		operationId: result.data?.$id,
		operationType,
	});

	return result.data as OperationRecord;
}

/**
 * Updates an existing operation record
 */
export async function updateOperation(
	db: DatabaseAdapter,
	databaseId: string,
	operationId: string,
	updates: Partial<OperationRecord>,
): Promise<OperationRecord> {
	// Prepare update data (exclude system fields like $id, $createdAt, $updatedAt)
	const updateData: Record<string, any> = {};

	if (updates.operationType !== undefined)
		updateData.operationType = updates.operationType;
	if (updates.targetCollection !== undefined)
		updateData.targetCollection = updates.targetCollection;
	if (updates.status !== undefined) updateData.status = updates.status;
	if (updates.progress !== undefined) updateData.progress = updates.progress;
	if (updates.total !== undefined) updateData.total = updates.total;
	if (updates.error !== undefined) updateData.error = updates.error;
	if (updates.data !== undefined) {
		updateData.data =
			typeof updates.data === "string"
				? updates.data
				: JSON.stringify(updates.data);
	}

	try {
		const result = await db.updateRow({
			databaseId,
			tableId: OPERATIONS_TABLE_ID,
			id: operationId,
			data: updateData,
		});

		logger.debug("Updated operation", {
			operationId,
			updates: Object.keys(updateData),
		});

		return result.data as OperationRecord;
	} catch (error) {
		logger.error("Failed to update operation", {
			operationId,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

/**
 * Gets a single operation by ID
 */
export async function getOperation(
	db: DatabaseAdapter,
	databaseId: string,
	operationId: string,
): Promise<OperationRecord | null> {
	try {
		const result = await db.getRow({
			databaseId,
			tableId: OPERATIONS_TABLE_ID,
			id: operationId,
		});

		return result.data as OperationRecord;
	} catch (error) {
		logger.debug("Operation not found", {
			operationId,
			error: error instanceof Error ? error.message : String(error),
		});
		return null;
	}
}

/**
 * Cleans up old completed operations
 * @param olderThan - Optional date, defaults to operations older than 7 days
 * @returns Number of operations deleted
 */
export async function cleanupOperations(
	db: DatabaseAdapter,
	databaseId: string,
	olderThan?: Date,
): Promise<number> {
	const cutoffDate =
		olderThan || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
	const cutoffIso = cutoffDate.toISOString();

	try {
		// Query for completed operations older than cutoff
		const response = await db.listRows({
			databaseId,
			tableId: OPERATIONS_TABLE_ID,
			queries: [
				Query.equal("status", ["completed", "failed", "cancelled"]),
				Query.lessThan("$createdAt", cutoffIso),
			],
		});

		if (!response.rows || response.rows.length === 0) {
			logger.debug("No old operations to clean up", { databaseId });
			return 0;
		}

		// Delete in batches
		let deletedCount = 0;
		for (const operation of response.rows) {
			try {
				await db.deleteRow({
					databaseId,
					tableId: OPERATIONS_TABLE_ID,
					id: operation.$id,
				});
				deletedCount++;
			} catch (error) {
				logger.warn("Failed to delete operation", {
					operationId: operation.$id,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		logger.info("Cleaned up old operations", {
			databaseId,
			deletedCount,
			cutoffDate: cutoffIso,
		});

		return deletedCount;
	} catch (error) {
		logger.error("Failed to cleanup operations", {
			databaseId,
			error: error instanceof Error ? error.message : String(error),
		});
		return 0;
	}
}
