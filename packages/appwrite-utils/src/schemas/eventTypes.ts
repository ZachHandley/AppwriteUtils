import { z } from "zod";

/**
 * Valid event types for Appwrite Functions
 * These correspond to database and collection events that can trigger functions
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
 * Common database event patterns for documents
 */
export const DocumentEventTypeSchema = z.enum([
  "create",
  "delete",
  "update", 
  "upsert"
]);

export type EventType = typeof eventTypeValues[number];
export type DocumentEventType = z.infer<typeof DocumentEventTypeSchema>;