import { Client } from "node-appwrite";
import type { AppwriteConfig } from "appwrite-utils";
import { AdapterFactory } from "../adapters/AdapterFactory.js";
import type { DatabaseAdapter } from "../adapters/DatabaseAdapter.js";
import { logger } from "../shared/logging.js";

/**
 * Factory for creating authenticated Appwrite clients and database adapters.
 *
 * This factory provides a clean separation of concerns by taking pre-configured
 * AppwriteConfig objects (with authentication already resolved by ConfigManager)
 * and creating the necessary client and adapter instances.
 *
 * Key features:
 * - Takes pre-authenticated config from ConfigManager
 * - Creates client with appropriate authentication method
 * - Creates adapter with automatic version detection
 * - Leverages AdapterFactory's internal caching for performance
 *
 * @example
 * ```typescript
 * const configManager = ConfigManager.getInstance();
 * const config = await configManager.loadConfig();
 *
 * // Config already has session or API key resolved
 * const { client, adapter } = await ClientFactory.createFromConfig(config);
 * ```
 */
export class ClientFactory {
  /**
   * Create authenticated client and database adapter from configuration.
   *
   * This method expects the config to have authentication already resolved:
   * - Either `sessionCookie` is set (from ConfigManager's session loading)
   * - Or `appwriteKey` is set (from config file or CLI overrides)
   *
   * The ConfigManager handles all session discovery and authentication priority,
   * so this factory simply applies the resolved authentication to the client.
   *
   * @param config - AppwriteConfig with resolved authentication
   * @returns Object containing authenticated client and database adapter
   * @throws Error if no authentication method is available in config
   *
   * @example
   * ```typescript
   * const config = await ConfigManager.getInstance().loadConfig();
   * const { client, adapter } = await ClientFactory.createFromConfig(config);
   *
   * // Client is now authenticated and ready to use
   * const databases = new Databases(client);
   * const collections = await adapter.listCollections(databaseId);
   * ```
   */
  public static async createFromConfig(
    config: AppwriteConfig
  ): Promise<{ client: Client; adapter: DatabaseAdapter }> {
    logger.debug("Creating client from config", {
      prefix: "ClientFactory",
      hasSession: !!config.sessionCookie,
      hasApiKey: !!config.appwriteKey,
      endpoint: config.appwriteEndpoint,
      project: config.appwriteProject,
    });

    // Create base client with endpoint and project
    const client = new Client()
      .setEndpoint(config.appwriteEndpoint)
      .setProject(config.appwriteProject);

    // Apply authentication (priority already resolved by ConfigManager)
    if (config.sessionCookie) {
      // Session authentication (from ConfigManager's session loading)
      client.setSession(config.sessionCookie);
      logger.debug("Applied session authentication to client", {
        prefix: "ClientFactory",
        email: config.sessionMetadata?.email,
      });
    } else if (config.appwriteKey) {
      // API key authentication (from config file or overrides)
      client.setKey(config.appwriteKey);
      logger.debug("Applied API key authentication to client", {
        prefix: "ClientFactory",
      });
    } else {
      // No authentication available - this should have been caught by ConfigManager
      const error = new Error(
        "No authentication method available in configuration.\n\n" +
        "This should have been resolved by ConfigManager during config loading.\n" +
        "Expected either:\n" +
        "  - config.sessionCookie (from session authentication)\n" +
        "  - config.appwriteKey (from config file or CLI overrides)\n\n" +
        "Suggestion: Ensure ConfigManager.loadConfig() was called before ClientFactory.createFromConfig()."
      );
      logger.error("Failed to create client - no authentication", { prefix: "ClientFactory" });
      throw error;
    }

    // Create adapter with version detection
    // AdapterFactory uses internal caching, so repeated calls are fast
    logger.debug("Creating database adapter", {
      prefix: "ClientFactory",
      apiMode: config.apiMode || "auto",
    });

    const { adapter } = await AdapterFactory.createFromConfig(config);

    logger.debug("Client and adapter created successfully", {
      prefix: "ClientFactory",
      adapterType: adapter.getApiMode(),
    });

    return { client, adapter };
  }

  /**
   * Create client and adapter from individual parameters.
   *
   * This is a lower-level method for cases where you don't have a full
   * AppwriteConfig object. For most use cases, prefer createFromConfig().
   *
   * @param endpoint - Appwrite endpoint URL
   * @param project - Appwrite project ID
   * @param options - Authentication and API mode options
   * @returns Object containing authenticated client and database adapter
   * @throws Error if no authentication method is provided
   *
   * @example
   * ```typescript
   * const { client, adapter } = await ClientFactory.create(
   *   "https://cloud.appwrite.io/v1",
   *   "my-project-id",
   *   {
   *     apiKey: "my-api-key",
   *     apiMode: "auto"
   *   }
   * );
   * ```
   */
  public static async create(
    endpoint: string,
    project: string,
    options: {
      apiKey?: string;
      sessionCookie?: string;
      apiMode?: "auto" | "legacy" | "tablesdb";
    } = {}
  ): Promise<{ client: Client; adapter: DatabaseAdapter }> {
    logger.debug("Creating client from parameters", {
      prefix: "ClientFactory",
      hasSession: !!options.sessionCookie,
      hasApiKey: !!options.apiKey,
      endpoint,
      project,
    });

    // Create minimal config object
    const config: AppwriteConfig = {
      appwriteEndpoint: endpoint,
      appwriteProject: project,
      appwriteKey: options.apiKey || "",
      sessionCookie: options.sessionCookie,
      apiMode: options.apiMode || "auto",
      // Minimal required fields
      appwriteClient: null,
      authMethod: options.sessionCookie ? "session" : "apikey",
      enableBackups: false,
      backupInterval: 0,
      backupRetention: 0,
      enableBackupCleanup: false,
      enableMockData: false,
      documentBucketId: "",
      usersCollectionName: "",
      databases: [],
      buckets: [],
      functions: [],
      logging: {
        enabled: false,
        level: "info",
        console: false,
      },
    };

    // Use main createFromConfig method
    return this.createFromConfig(config);
  }
}
