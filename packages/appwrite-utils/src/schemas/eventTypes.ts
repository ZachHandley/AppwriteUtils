import { z } from "zod";

/**
 * Valid event types for Appwrite Functions
 * These correspond to database and collection events that can trigger functions
 */
export const EventTypeSchema = z.enum([
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
]);

/**
 * Common database event patterns for documents
 */
export const DocumentEventTypeSchema = z.enum([
  "create",
  "delete",
  "update", 
  "upsert"
]);

export type EventType = z.infer<typeof EventTypeSchema>;
export type DocumentEventType = z.infer<typeof DocumentEventTypeSchema>;