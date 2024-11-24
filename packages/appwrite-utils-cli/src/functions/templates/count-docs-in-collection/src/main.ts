import { Client, Databases, Query } from "node-appwrite";
import { AppwriteRequest, AppwriteResponse } from "appwrite-utils";
import { requestSchema } from "./request.js";

/**
 * Main function to handle document counting requests.
 * @param {Object} params - The function parameters.
 * @param {Object} params.req - The request object.
 * @param {Object} params.res - The response object.
 * @param {Function} params.log - Logging function.
 * @param {Function} params.error - Error logging function.
 * @returns {Promise<Object>} JSON response with count or error message.
 */
export default async ({ req, res, log, error }: { req: AppwriteRequest, res: AppwriteResponse, log: (message: string) => void, error: (message: string) => void }) => {
  // Initialize Appwrite client
  const client = new Client()
    .setEndpoint(process.env["APPWRITE_FUNCTION_ENDPOINT"]!)
    .setProject(process.env["APPWRITE_FUNCTION_PROJECT_ID"]!)
    .setKey(req.headers["x-appwrite-key"] || "");

  const databases = new Databases(client);

  try {
    if (req.method === "POST") {
      // Parse request body
      const body = requestSchema.safeParse(
        typeof req.body === "string" ? JSON.parse(req.body) : req.body
      );

      if (!body.success) {
        return res.json({ success: false, error: body.error }, 400);
      }

      const { databaseId, collectionId, queries = [] } = body.data;

      log(`Queries: ${JSON.stringify(queries)}`);

      // Count documents in the specified collection
      const count = await countAllDocuments(
        log,
        databases,
        databaseId,
        collectionId,
        queries
      );

      // Return successful response with document count
      return res.json({
        success: true,
        count: count,
      });
    } else {
      // Return error for non-POST requests
      return res.json({ success: false, error: "Method not allowed" }, 405);
    }
  } catch (err) {
    // Log and return any errors
    error(`Error processing request: ${err}`);
    return res.json({ success: false, error: (err as Error).message }, 500);
  }
};

/**
 * Counts all documents in a collection, handling large collections efficiently.
 * @param {Function} log - Logging function.
 * @param {Databases} databases - Appwrite Databases instance.
 * @param {string} databaseId - ID of the database.
 * @param {string} collectionId - ID of the collection.
 * @param {string[]} queries - Array of query strings to filter documents.
 * @param {number} batchSize - Size of batches for processing (default: 1000).
 * @returns {Promise<number>} Total count of documents.
 */
async function countAllDocuments(
  log: any,
  databases: Databases,
  databaseId: string,
  collectionId: string,
  queries: string[] = [],
  batchSize: number = 1000
): Promise<number> {
  // Filter out limit and offset queries
  const initialQueries = queries.filter(
    (q) => !(q.includes("limit") || q.includes("offset"))
  );

  // Initial query to check if total is less than 5000
  const initialResponse = await databases.listDocuments(
    databaseId,
    collectionId,
    [...initialQueries, Query.limit(1)]
  );

  if (initialResponse.total < 5000) {
    log(`Total documents (from initial response): ${initialResponse.total}`);
    return initialResponse.total;
  }

  // If total is 5000 or more, we need to count manually
  let bound = 5000;

  // Exponential search to find an upper bound
  while (true) {
    log(`Querying for offset ${bound}`);
    try {
      const response = await databases.listDocuments(databaseId, collectionId, [
        ...initialQueries,
        Query.limit(1),
        Query.offset(bound),
      ]);

      if (response.documents.length === 0) {
        break;
      }
      bound *= 2;
    } catch (error) {
      break;
    }
  }

  // Binary search to find the exact count
  let low = Math.floor(bound / 2);
  let high = bound;
  let lastValidCount = low;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    log(`Binary search: Querying for offset ${mid}`);

    try {
      const response = await databases.listDocuments(databaseId, collectionId, [
        ...initialQueries,
        Query.limit(1),
        Query.offset(mid),
      ]);

      if (response.documents.length > 0) {
        lastValidCount = mid + 1; // +1 because offset is 0-based
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    } catch (error) {
      high = mid - 1;
    }
  }

  log(`Total documents: ${lastValidCount}`);
  return lastValidCount;
}
