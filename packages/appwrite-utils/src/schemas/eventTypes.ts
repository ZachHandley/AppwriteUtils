import { z } from "zod";

/**
 * Valid event types for Appwrite Functions
 * These correspond to database, collection/table, and document/row events that can trigger functions
 * Supports both legacy (collections/documents) and new (tables/rows) naming conventions
 */
const eventTypeValues = [
  "buckets.*.create",
  "buckets.*.delete",
  "buckets.*.files.*.create",
  "buckets.*.files.*.delete",
  "buckets.*.files.*.update",
  "collections.*.create",
  "collections.*.delete",
  "collections.*.documents.*.create",
  "collections.*.documents.*.delete", 
  "collections.*.documents.*.update",
  "collections.*.documents.*.upsert",
  "tables.*.create",
  "tables.*.delete",
  "tables.*.rows.*.create",
  "tables.*.rows.*.delete",
  "tables.*.rows.*.update",
  "tables.*.rows.*.upsert",
  "databases.*.create",
  "databases.*.delete",
  "functions.*.deployments.*.create",
  "functions.*.deployments.*.delete",
  "functions.*.deployments.*.update",
  "functions.*.executions.*.create",
  "functions.*.executions.*.delete",
  "functions.*.executions.*.update",
  "teams.*.create",
  "teams.*.delete",
  "teams.*.memberships.*.create",
  "teams.*.memberships.*.delete",
  "teams.*.memberships.*.update",
  "teams.*.update",
  "users.*.create",
  "users.*.delete",
  "users.*.sessions.*.create",
  "users.*.sessions.*.delete",
  "users.*.update",
] as const;

export const EventTypeSchema = z.string().refine(
  (val): val is typeof eventTypeValues[number] => eventTypeValues.includes(val as any),
  { message: "Invalid event type" }
);

/**
 * Common database event patterns for documents/rows
 */
export const DocumentEventTypeSchema = z.enum([
  "create",
  "delete",
  "update", 
  "upsert"
]);

export type EventType = typeof eventTypeValues[number];
export type DocumentEventType = z.infer<typeof DocumentEventTypeSchema>;