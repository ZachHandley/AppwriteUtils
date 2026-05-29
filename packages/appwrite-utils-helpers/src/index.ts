// Client utilities for creating authenticated Appwrite clients
export * from "./clients/index.js";

// Official Appwrite CLI runner with auth bridging
export * from "./cli/index.js";

// Configuration management utilities
export * from "./config/index.js";

// Schema utilities for attribute mapping and schema generation
export * from "./schemas/index.js";

// Function utilities for managing Appwrite functions
export * from "./functions/index.js";

// Site utilities for managing Appwrite sites
export * from "./sites/index.js";

// Version detection utilities for API compatibility
export * from "./utils/index.js";

// Database adapters for unified access to legacy and TablesDB APIs
export * from "./adapters/index.js";

// Path resolution utilities
export * from "./paths/index.js";

// Shared utilities for logging, messaging, and error handling
export * from "./shared/index.js";

// Project-level configuration utilities (variables, etc.)
export * from "./projects/index.js";

// Storage utilities for managing buckets and files
export * from "./storage/index.js";

// Team utilities for managing teams and memberships
export * from "./teams/index.js";

// User utilities for managing users, sessions, identities, prefs
export * from "./users/index.js";

// Database sync engine — create/update collections & tables, columns, indexes,
// and the operation queue for deferred relationship resolution. Relocated from
// appwrite-utils-cli so both the CLI and the MCP can drive a config → Appwrite
// push without either package depending on the other.
export * from "./collections/methods.js";
export * from "./collections/columns.js";
export * from "./collections/tableOperations.js";
export * from "./tables/indexManager.js";
export * from "./shared/operationQueue.js";
