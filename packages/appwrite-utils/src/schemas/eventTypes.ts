import { z } from "zod";
import wcmatch from "wildcard-match";

/**
 * Valid Appwrite event patterns
 * Based on https://appwrite.io/docs/advanced/platform/events
 *
 * Patterns use glob-style wildcards where * matches any ID
 */
const VALID_EVENT_PATTERNS = [
  // Wildcard patterns
  "buckets.*",
  "collections.*",
  "databases.*",
  "functions.*",
  "messages.*",
  "providers.*",
  "tables.*",
  "teams.*",
  "topics.*",
  "users.*",

  // Buckets
  "buckets.*.create",
  "buckets.*.delete",
  "buckets.*.update",
  "buckets.*.files.*",
  "buckets.*.files.*.create",
  "buckets.*.files.*.delete",
  "buckets.*.files.*.update",

  // Collections (legacy)
  "collections.*.create",
  "collections.*.delete",
  "collections.*.documents.*",
  "collections.*.documents.*.create",
  "collections.*.documents.*.delete",
  "collections.*.documents.*.update",
  "collections.*.documents.*.upsert",

  // Tables (new)
  "tables.*.create",
  "tables.*.delete",
  "tables.*.update",
  "tables.*.rows.*",
  "tables.*.rows.*.create",
  "tables.*.rows.*.delete",
  "tables.*.rows.*.update",
  "tables.*.row.*.upsert",
  "tables.*.columns.*",
  "tables.*.columns.*.create",
  "tables.*.columns.*.delete",
  "tables.*.indexes.*",
  "tables.*.indexes.*.create",
  "tables.*.indexes.*.delete",

  // Databases (with tables/collections)
  "databases.*.create",
  "databases.*.delete",
  "databases.*.update",
  "databases.*.tables.*",
  "databases.*.tables.*.create",
  "databases.*.tables.*.delete",
  "databases.*.tables.*.update",
  "databases.*.tables.*.rows.*",
  "databases.*.tables.*.rows.*.create",
  "databases.*.tables.*.rows.*.delete",
  "databases.*.tables.*.rows.*.update",
  "databases.*.tables.*.row.*.upsert",
  "databases.*.tables.*.columns.*",
  "databases.*.tables.*.columns.*.create",
  "databases.*.tables.*.columns.*.delete",
  "databases.*.tables.*.indexes.*",
  "databases.*.tables.*.indexes.*.create",
  "databases.*.tables.*.indexes.*.delete",
  "databases.*.collections.*",
  "databases.*.collections.*.create",
  "databases.*.collections.*.delete",
  "databases.*.collections.*.documents.*",
  "databases.*.collections.*.documents.*.create",
  "databases.*.collections.*.documents.*.delete",
  "databases.*.collections.*.documents.*.update",
  "databases.*.collections.*.documents.*.upsert",

  // Functions
  "functions.*.create",
  "functions.*.delete",
  "functions.*.update",
  "functions.*.deployments.*",
  "functions.*.deployments.*.create",
  "functions.*.deployments.*.delete",
  "functions.*.deployments.*.update",
  "functions.*.executions.*",
  "functions.*.executions.*.create",
  "functions.*.executions.*.delete",
  "functions.*.executions.*.update",

  // Teams
  "teams.*.create",
  "teams.*.delete",
  "teams.*.update",
  "teams.*.update.prefs",
  "teams.*.memberships.*",
  "teams.*.memberships.*.create",
  "teams.*.memberships.*.delete",
  "teams.*.memberships.*.update",
  "teams.*.memberships.*.update.status",

  // Users
  "users.*.create",
  "users.*.delete",
  "users.*.update",
  "users.*.update.email",
  "users.*.update.name",
  "users.*.update.password",
  "users.*.update.prefs",
  "users.*.update.status",
  "users.*.sessions.*",
  "users.*.sessions.*.create",
  "users.*.sessions.*.delete",
  "users.*.recovery.*",
  "users.*.recovery.*.create",
  "users.*.recovery.*.update",
  "users.*.verification.*",
  "users.*.verification.*.create",
  "users.*.verification.*.update",

  // Messaging
  "providers.*.create",
  "providers.*.delete",
  "providers.*.update",
  "topics.*.create",
  "topics.*.delete",
  "topics.*.update",
  "topics.*.subscribers.*.create",
  "topics.*.subscribers.*.delete",
  "messages.*.create",
  "messages.*.delete",
  "messages.*.update",
];

const isValidEvent = wcmatch(VALID_EVENT_PATTERNS, ".");

const validateEventPattern = (event: string): boolean => isValidEvent(event);

export const EventTypeSchema = z.string().refine(
  validateEventPattern,
  { message: "Invalid event type pattern" }
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

export type EventType = string; // Any valid Appwrite event pattern
export type DocumentEventType = z.infer<typeof DocumentEventTypeSchema>;