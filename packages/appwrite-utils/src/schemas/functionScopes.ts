import { z } from "zod";

/**
 * Function Scopes for Appwrite
 *
 * User Management:
 * - users.read:     Access to read your project's users
 * - users.write:    Access to create, update, and delete your project's users
 * - sessions.read:  Access to read your project's user sessions
 * - sessions.write: Access to create, update, and delete your project's user sessions
 *
 * Team Management:
 * - teams.read:     Access to read your project's teams
 * - teams.write:    Access to create, update, and delete your project's teams
 *
 * Database Management:
 * - databases.read:     Access to read your project's databases
 * - databases.write:    Access to create, update, and delete your project's databases
 * - collections.read:   Access to read your project's database collections
 * - collections.write:  Access to create, update, and delete your project's database collections
 * - attributes.read:    Access to read your project's database collection's attributes
 * - attributes.write:   Access to create, update, and delete your project's database collection's attributes
 * - indexes.read:       Access to read your project's database collection's indexes
 * - indexes.write:      Access to create, update, and delete your project's database collection's indexes
 * - documents.read:     Access to read your project's database documents
 * - documents.write:    Access to create, update, and delete your project's database documents
 *
 * Storage Management:
 * - files.read:     Access to read your project's storage files and preview images
 * - files.write:    Access to create, update, and delete your project's storage files
 * - buckets.read:   Access to read your project's storage buckets
 * - buckets.write:  Access to create, update, and delete your project's storage buckets
 *
 * Function Management:
 * - functions.read:     Access to read your project's functions and code deployments
 * - functions.write:    Access to create, update, and delete your project's functions and code deployments
 * - execution.read:     Access to read your project's execution logs
 * - execution.write:    Access to execute your project's functions
 *
 * Messaging Managemetn:
 * - messages.read:     Access to read your project's messages
 * - messages.write:    Access to create, update, and delete your project's messages
 * - targets.read:     Access to read your project's message targets
 * - targets.write:    Access to create, update, and delete your project's message targets
 * - providers.read:    Access to read your project's message providers
 * - providers.write:   Access to create, update, and delete your project's message providers
 * - topics.read:       Access to read your project's message topics
 * - topics.write:      Access to create, update, and delete your project's message topics
 * - subscribers.read:  Access to read your project's message subscribers
 * - subscribers.write: Access to create, update, and delete your project's message subscribers
 *
 * Service Access:
 * - locale.read:    Access to your project's Locale service
 * - avatars.read:   Access to your project's Avatars service
 * - health.read:    Access to read your project's health status
 * - migrations.read:  Access to read your project's migration status
 * - migrations.write: Access to create migrations
 * - sites.read:     Access to read your project's sites and deployments
 * - sites.write:    Access to create, update, and delete your project's sites and deployments
 * - log.read:       Access to read your sites's logs
 * - log.write:      Access to delete your site's logs
 * - tokens.read:    Access to read your project's file tokens
 * - tokens.write:   Access to create file tokens
 *
 * Infrastructure:
 * - assistant.read: Access to read the Assistant service
 * - rules.read:       Access to read your project's proxy rules
 * - rules.write:      Access to create, update, and delete your project's proxy rules
 * - vcs.read:        Access to read your project's VCS repositories
 * - vcs.write:       Access to create, update, and delete your project's VCS repositories
 */
export const FunctionScopes = z.enum([
  "users.read",
  "users.write",
  "sessions.read",
  "sessions.write",
  "teams.read",
  "teams.write",
  "databases.read",
  "databases.write",
  "collections.read",
  "collections.write",
  "attributes.read",
  "attributes.write",
  "indexes.read",
  "indexes.write",
  "documents.read",
  "documents.write",
  "files.read",
  "files.write",
  "buckets.read",
  "buckets.write",
  "functions.read",
  "functions.write",
  "execution.read",
  "execution.write",
  "locale.read",
  "avatars.read",
  "health.read",
  "rules.read",
  "rules.write",
  "migrations.read",
  "migrations.write",
  "sites.read",
  "sites.write",
  "log.read",
  "log.write",
  "tokens.read",
  "tokens.write",
  "vcs.read",
  "vcs.write",
  "assistant.read",
  "messages.read",
  "messages.write",
  "targets.read",
  "targets.write",
  "providers.read",
  "providers.write",
  "topics.read",
  "topics.write",
  "subscribers.read",
  "subscribers.write",
]);

export type FunctionScope = z.infer<typeof FunctionScopes>;
