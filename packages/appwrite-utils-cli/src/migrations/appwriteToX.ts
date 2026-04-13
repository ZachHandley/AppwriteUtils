import { SchemaGenerator, findYamlConfig } from "appwrite-utils-helpers";
import {
  Client,
  Compression,
  Databases,
  Query,
  Storage,
  type Models,
  type Permission,
} from "node-appwrite";
import { fetchAllCollections } from "../collections/methods.js";
import { fetchAllDatabases } from "../databases/methods.js";
import {
  CollectionSchema,
  attributeSchema,
  type AppwriteConfig,
  AppwriteConfigSchema,
  type ConfigDatabases,
  type Attribute,
  permissionsSchema,
  attributesSchema,
  indexesSchema,
  parseAttribute,
  type Runtime,
  type Specification,
} from "appwrite-utils";
import { getDatabaseFromConfig } from "./afterImportActions.js";
import { getAdapterFromConfig } from "appwrite-utils-helpers";
import { listBuckets } from "../storage/methods.js";
import { listFunctions, listFunctionDeployments, getFunction } from "../functions/methods.js";
import { MessageFormatter } from "appwrite-utils-helpers";
import { isLegacyDatabases } from "appwrite-utils-helpers";
import type { DatabaseAdapter } from "appwrite-utils-helpers";
import type { DatabaseSelection, BucketSelection } from "../shared/selectionDialogs.js";

/**
 * Convert between collection and table terminology based on data structure
 */
function normalizeCollectionOrTable(collection: any): {
  attributes: any[];
  permissions: any[];
  name: string;
  $id: string;
  enabled: boolean;
  indexes?: any[];
} {
  // Check if this is a table (has columns) or collection (has attributes)
  const isTable = collection.columns && Array.isArray(collection.columns);

  if (isTable) {
    // Table structure - convert columns to attributes
    MessageFormatter.debug(`Detected table structure: ${collection.name || collection.tableName}`, { prefix: "Migration" });
    return {
      ...collection,
      attributes: collection.columns || [],
      permissions: collection.$permissions || collection.permissions || [],
      name: collection.name || collection.tableName,
      $id: collection.$id || collection.tableId,
      enabled: collection.enabled ?? true
    };
  } else {
    // Collection structure - use as-is with fallbacks
    MessageFormatter.debug(`Detected collection structure: ${collection.name}`, { prefix: "Migration" });
    return {
      ...collection,
      attributes: collection.attributes || [],
      permissions: collection.$permissions || collection.permissions || [],
      name: collection.name,
      $id: collection.$id,
      enabled: collection.enabled ?? true
    };
  }
}

export class AppwriteToX {
  config: AppwriteConfig;
  storage: Storage;
  updatedConfig: AppwriteConfig;
  collToAttributeMap = new Map<string, Attribute[]>();
  appwriteFolderPath: string;
  adapter?: DatabaseAdapter;
  apiMode?: 'legacy' | 'tablesdb';
  databaseApiModes = new Map<string, 'legacy' | 'tablesdb'>();

  constructor(
    config: AppwriteConfig,
    appwriteFolderPath: string,
    storage: Storage
  ) {
    this.config = config;
    this.updatedConfig = config;
    this.storage = storage;
    this.appwriteFolderPath = appwriteFolderPath;
    this.ensureClientInitialized();
  }

  /**
   * Initialize adapter for database operations with API mode detection
   */
  private async initializeAdapter(): Promise<void> {
    if (!this.adapter) {
      try {
        const { adapter, apiMode } = await getAdapterFromConfig(this.config);
        this.adapter = adapter;
        this.apiMode = apiMode;
        MessageFormatter.info(`Initialized database adapter with API mode: ${apiMode}`, { prefix: "Migration" });
      } catch (error) {
        MessageFormatter.warning(
          `Failed to initialize adapter, falling back to legacy client: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { prefix: "Migration" }
        );
        // Fallback to legacy client initialization
        this.ensureClientInitialized();
      }
    }
  }

  private ensureClientInitialized() {
    if (!this.config.appwriteClient) {
      const client = new Client();
      client
        .setEndpoint(this.config.appwriteEndpoint)
        .setProject(this.config.appwriteProject);

      // Only set API key if provided (session auth is alternative)
      if (this.config.appwriteKey) {
        client.setKey(this.config.appwriteKey);
      }

      this.config.appwriteClient = client;
    }
  }

  // Function to parse a single permission string
  parsePermissionString = (permissionString: string) => {
    const match = permissionString.match(/^(\w+)\('([^']+)'\)$/);
    if (!match) {
      throw new Error(`Invalid permission format: ${permissionString}`);
    }
    return {
      permission: match[1],
      target: match[2],
    };
  };

  // Function to parse an array of permission strings
  parsePermissionsArray = (permissions: string[]) => {
    if (permissions.length === 0) {
      return [];
    }
    const parsedPermissions = permissionsSchema.parse(permissions);
    // Validate the parsed permissions using Zod
    return parsedPermissions ?? [];
  };

  updateCollectionConfigAttributes = (collection: Models.Collection) => {
    // Normalize collection/table structure to handle both TablesDB and Legacy formats
    const normalizedCollection = normalizeCollectionOrTable(collection);

    for (const attribute of normalizedCollection.attributes) {
      if (!attribute) {
        MessageFormatter.warning("Skipping null/undefined attribute in updateCollectionConfigAttributes", { prefix: "Migration" });
        continue;
      }
      const attributeParsed = attributeSchema.parse(attribute);
      this.collToAttributeMap
        .get(normalizedCollection.name)
        ?.push(attributeParsed);
    }
  };

  /**
   * Fetch collections/tables using the appropriate adapter or legacy client
   */
  private async fetchCollectionsOrTables(databaseId: string, db: any): Promise<Models.Collection[]> {
    // Try to use adapter first
    if (this.adapter) {
      try {
        const result = await this.adapter.listTables({ databaseId });
        const items = (result as any).tables || result.collections || [];
        MessageFormatter.info(`Fetched ${items.length} items using ${this.apiMode} adapter`, { prefix: "Migration" });
        return items as Models.Collection[];
      } catch (error) {
        MessageFormatter.warning(
          `Adapter fetch failed, falling back to legacy: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { prefix: "Migration" }
        );
      }
    }

    // Fallback to legacy method
    try {
      const collections = await fetchAllCollections(databaseId, db);
      MessageFormatter.info(`Fetched ${collections.length} collections using legacy client`, { prefix: "Migration" });
      return collections;
    } catch (error) {
      MessageFormatter.error(
        "Failed to fetch collections with both adapter and legacy methods",
        error instanceof Error ? error : new Error(String(error)),
        { prefix: "Migration" }
      );
      throw error;
    }
  }

  /**
   * Get collection/table using the appropriate adapter or legacy client
   */
  private async getCollectionOrTable(databaseId: string, collectionId: string): Promise<Models.Collection> {
    // Try to use adapter first
    if (this.adapter) {
      try {
        const result = await this.adapter.getTable({ databaseId, tableId: collectionId });
        return result as Models.Collection;
      } catch (error) {
        MessageFormatter.warning(
          `Adapter get failed, falling back to legacy: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { prefix: "Migration" }
        );
      }
    }

    // Fallback to legacy method
    const db = getDatabaseFromConfig(this.config);
    return await db.getCollection(databaseId, collectionId);
  }

  /**
   * Detect API mode for a specific database by testing adapter capabilities
   */
  private async detectDatabaseApiMode(databaseId: string): Promise<'legacy' | 'tablesdb'> {
    // If we already detected this database, return cached result
    if (this.databaseApiModes.has(databaseId)) {
      return this.databaseApiModes.get(databaseId)!;
    }

    // If we have a global adapter, use its API mode as default
    if (this.apiMode) {
      this.databaseApiModes.set(databaseId, this.apiMode);
      MessageFormatter.debug(`Using global API mode for database ${databaseId}: ${this.apiMode}`, { prefix: "Migration" });
      return this.apiMode;
    }

    // Default to legacy if no adapter available
    const defaultMode = 'legacy';
    this.databaseApiModes.set(databaseId, defaultMode);
    MessageFormatter.debug(`Defaulting to legacy mode for database ${databaseId}`, { prefix: "Migration" });
    return defaultMode;
  }

  /**
   * Get API mode context for schema generation
   */
  private getSchemaGeneratorApiContext(): any {
    const databaseModes: Record<string, 'legacy' | 'tablesdb'> = {};

    // Get API mode for each database
    for (const db of this.updatedConfig.databases || []) {
      const apiMode = this.databaseApiModes.get(db.$id) || this.apiMode || 'legacy';
      databaseModes[db.$id] = apiMode;
    }

    return {
      apiMode: this.apiMode || 'legacy',
      databaseApiModes: databaseModes,
      adapterMetadata: this.adapter?.getMetadata()
    };
  }

  async appwriteSync(
    config: AppwriteConfig,
    databases?: Models.Database[],
    databaseSelections?: DatabaseSelection[],
    bucketSelections?: BucketSelection[]
  ) {
    // Initialize adapter for proper API mode detection and usage
    await this.initializeAdapter();

    const db = getDatabaseFromConfig(config);
    if (!databases) {
      try {
        MessageFormatter.info("Fetching remote databases...", { prefix: "Migration" });
        databases = await fetchAllDatabases(db);
        MessageFormatter.info(`Found ${databases.length} remote databases`, { prefix: "Migration" });
      } catch (error) {
        MessageFormatter.error(
          "Failed to fetch remote databases",
          error instanceof Error ? error : new Error(String(error)),
          { prefix: "Migration" }
        );
        throw new Error(`Database fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Filter databases based on selection if provided
    let databasesToProcess = databases;
    if (databaseSelections && databaseSelections.length > 0) {
      databasesToProcess = databases?.filter(db =>
        databaseSelections.some(selection => selection.databaseId === db.$id)
      ) || [];
      MessageFormatter.info(`Filtered to ${databasesToProcess.length} selected databases`, { prefix: "Migration" });
    }

    let updatedConfig: AppwriteConfig = { ...config };

    // Initialize databases array if it doesn't exist
    if (!updatedConfig.databases) {
      updatedConfig.databases = [];
    }

    // Sync remote databases to local config - add missing ones
    MessageFormatter.info(`Syncing ${databasesToProcess.length} remote databases with local config...`, { prefix: "Migration" });
    let addedCount = 0;
    let updatedCount = 0;

    for (const remoteDb of databasesToProcess) {
      // Check if this database already exists in the config
      const existingDbIndex = updatedConfig.databases.findIndex(
        (localDb) => localDb.$id === remoteDb.$id
      );

      if (existingDbIndex === -1) {
        // Database doesn't exist locally, add it
        MessageFormatter.success(`Adding new database to config: ${remoteDb.name} (${remoteDb.$id})`, { prefix: "Migration" });
        updatedConfig.databases.push({
          $id: remoteDb.$id,
          name: remoteDb.name,
        });
        addedCount++;
      } else {
        // Database exists, update name if different
        if (updatedConfig.databases[existingDbIndex].name !== remoteDb.name) {
          MessageFormatter.info(`Updating database name: ${updatedConfig.databases[existingDbIndex].name} -> ${remoteDb.name}`, { prefix: "Migration" });
          updatedConfig.databases[existingDbIndex].name = remoteDb.name;
          updatedCount++;
        }
      }
    }

    MessageFormatter.success(`Database sync summary: ${addedCount} added, ${updatedCount} updated, ${updatedConfig.databases.length} total`, { prefix: "Migration" });

    // Fetch all buckets
    const allBuckets = await listBuckets(this.storage);

    // Filter buckets based on selection if provided
    let matchedBuckets = allBuckets.buckets;
    if (bucketSelections && bucketSelections.length > 0) {
      matchedBuckets = allBuckets.buckets.filter(bucket =>
        bucketSelections.some(selection => selection.bucketId === bucket.$id)
      );
      MessageFormatter.info(`Filtered to ${matchedBuckets.length} selected buckets`, { prefix: "Migration" });
    }

    // Loop through each database
    for (const database of databasesToProcess) {
      // Detect API mode for this specific database
      const dbApiMode = await this.detectDatabaseApiMode(database.$id);
      MessageFormatter.info(`Processing database '${database.name}' with API mode: ${dbApiMode}`, { prefix: "Migration" });

      // Match bucket to database (from filtered buckets if selections provided)
      const matchedBucket = matchedBuckets.find((bucket) =>
        bucket.$id.toLowerCase().includes(database.$id.toLowerCase())
      );

      if (matchedBucket) {
        const dbConfig = updatedConfig.databases.find(
          (db) => db.$id === database.$id
        );
        if (dbConfig) {
          dbConfig.bucket = {
            $id: matchedBucket.$id,
            name: matchedBucket.name,
            enabled: matchedBucket.enabled,
            maximumFileSize: matchedBucket.maximumFileSize,
            allowedFileExtensions: matchedBucket.allowedFileExtensions,
            compression: matchedBucket.compression as Compression,
            encryption: matchedBucket.encryption,
            antivirus: matchedBucket.antivirus,
          };
        }
      }

      // Use adapter-aware collection/table fetching with proper API mode detection
      const collections = await this.fetchCollectionsOrTables(database.$id, db);

      // Filter collections based on table selection if provided
      let collectionsToProcess = collections;
      if (databaseSelections && databaseSelections.length > 0) {
        const dbSelection = databaseSelections.find(selection => selection.databaseId === database.$id);
        if (dbSelection && dbSelection.tableIds.length > 0) {
          collectionsToProcess = collections.filter(collection =>
            dbSelection.tableIds.includes(collection.$id)
          );
          MessageFormatter.info(`Filtered to ${collectionsToProcess.length} selected tables for database '${database.name}'`, { prefix: "Migration" });
        }
      }

      // Loop through each collection in the current database
      if (!updatedConfig.collections) {
        updatedConfig.collections = [];
      }

      MessageFormatter.info(`Processing ${collectionsToProcess.length} collections/tables in database '${database.name}'`, { prefix: "Migration" });
      let processedCount = 0;
      let errorCount = 0;

      for (const collection of collectionsToProcess) {
        try {
          if (!collection) {
            MessageFormatter.warning("Skipping null/undefined collection", { prefix: "Migration" });
            errorCount++;
            continue;
          }

          // Normalize collection/table structure to handle both TablesDB and Legacy formats
          const normalizedCollection = normalizeCollectionOrTable(collection);

          MessageFormatter.processing(`Processing ${normalizedCollection.name} (${normalizedCollection.$id})`, { prefix: "Migration" });
          const existingCollectionIndex = updatedConfig.collections.findIndex(
            (c) => c.name === normalizedCollection.name
          );

          // Parse the collection permissions and attributes using normalized structure
          const collPermissions = this.parsePermissionsArray(
            normalizedCollection.permissions
          );

          // Process attributes with proper error handling
          let collAttributes: Attribute[] = [];
          try {
            collAttributes = normalizedCollection.attributes
              .map((attr: any) => {
                if (!attr) {
                  MessageFormatter.warning("Skipping null/undefined attribute", { prefix: "Migration" });
                  return null;
                }
                return parseAttribute(attr);
              })
              .filter((attribute: Attribute | null): attribute is Attribute =>
                attribute !== null &&
                (attribute.type !== "relationship" ? true : attribute.side !== "child")
              );
          } catch (error) {
            MessageFormatter.error(
              `Error processing attributes for ${normalizedCollection.name}`,
              error instanceof Error ? error : new Error(String(error)),
              { prefix: "Migration" }
            );
            // Continue with empty attributes array
            collAttributes = [];
          }

          for (const attribute of collAttributes) {
            if (
              attribute.type === "relationship" &&
              attribute.relatedCollection
            ) {
              MessageFormatter.info(
                `Fetching related collection for ID: ${attribute.relatedCollection}`,
                { prefix: "Migration" }
              );
              try {
                const relatedCollectionPulled = await this.getCollectionOrTable(
                  database.$id,
                  attribute.relatedCollection
                );
                MessageFormatter.info(
                  `Fetched Collection Name: ${relatedCollectionPulled.name}`,
                  { prefix: "Migration" }
                );
                attribute.relatedCollection = relatedCollectionPulled.name;
                MessageFormatter.info(
                  `Updated attribute.relatedCollection to: ${attribute.relatedCollection}`,
                  { prefix: "Migration" }
                );
              } catch (error) {
                MessageFormatter.error(
                  "Error fetching related collection",
                  error instanceof Error ? error : new Error(String(error)),
                  { prefix: "Migration" }
                );
              }
            }
          }
          this.collToAttributeMap.set(normalizedCollection.name, collAttributes);

          // Process indexes with proper error handling using normalized collection
          let collIndexes: any[] = [];
          try {
            const finalIndexes = (normalizedCollection.indexes || collection.indexes || []).map((index: any) => {
              if (!index) {
                MessageFormatter.warning("Skipping null/undefined index", { prefix: "Migration" });
                return null;
              }
              return {
                ...index,
                // Convert TablesDB 'columns' to expected 'attributes' for schema validation
                attributes: index.attributes || index.columns || [],
                orders: index.orders?.filter((order: string) => {
                  return order !== null && order;
                }),
              };
            }).filter((index: any): index is any => index !== null);

            collIndexes = indexesSchema.parse(finalIndexes) ?? [];
          } catch (error) {
            MessageFormatter.error(
              `Error processing indexes for ${normalizedCollection.name}`,
              error instanceof Error ? error : new Error(String(error)),
              { prefix: "Migration" }
            );
            // Continue with empty indexes array
            collIndexes = [];
          }

          // Prepare the collection object to be added or updated using normalized data
          const collToPush = CollectionSchema.parse({
            $id: normalizedCollection.$id,
            name: normalizedCollection.name,
            enabled: normalizedCollection.enabled,
            documentSecurity: collection.documentSecurity, // Use original collection for this field
            $createdAt: collection.$createdAt, // Use original collection for timestamps
            $updatedAt: collection.$updatedAt,
            $permissions:
              collPermissions.length > 0 ? collPermissions : undefined,
            indexes: collIndexes.length > 0 ? collIndexes : undefined,
            attributes: collAttributes.length > 0 ? collAttributes : undefined,
          });

          if (existingCollectionIndex !== -1) {
            // Update existing collection
            updatedConfig.collections[existingCollectionIndex] = collToPush;
            MessageFormatter.debug(`Updated existing collection: ${normalizedCollection.name}`, { prefix: "Migration" });
          } else {
            // Add new collection
            updatedConfig.collections.push(collToPush);
            MessageFormatter.debug(`Added new collection: ${normalizedCollection.name}`, { prefix: "Migration" });
          }

          processedCount++;
        } catch (error) {
          MessageFormatter.error(
            `Error processing collection: ${collection?.name || 'unknown'}`,
            error instanceof Error ? error : new Error(String(error)),
            { prefix: "Migration" }
          );
          errorCount++;
        }
      }

      MessageFormatter.success(
        `Database '${database.name}' processing complete: ${processedCount} collections processed, ${errorCount} errors`,
        { prefix: "Migration" }
      );
    }
    // Add unmatched buckets as global buckets
    // Use filtered buckets if selections provided, otherwise use all buckets
    const sourceBuckets = bucketSelections && bucketSelections.length > 0 ? matchedBuckets : allBuckets.buckets;
    const globalBuckets = sourceBuckets.filter(
      (bucket) =>
        !updatedConfig.databases.some(
          (db) => db.bucket && db.bucket.$id === bucket.$id
        )
    );

    updatedConfig.buckets = globalBuckets.map((bucket) => ({
      $id: bucket.$id,
      name: bucket.name,
      enabled: bucket.enabled,
      maximumFileSize: bucket.maximumFileSize,
      allowedFileExtensions: bucket.allowedFileExtensions,
      compression: bucket.compression as Compression,
      encryption: bucket.encryption,
      antivirus: bucket.antivirus,
    }));

    const remoteFunctions = await listFunctions(this.config.appwriteClient!, [
      Query.limit(1000),
    ]);

    // Fetch full details per function to ensure 'scopes' and other fields are present
    const detailedFunctions: any[] = [];
    for (const f of remoteFunctions.functions) {
      try {
        const full = await getFunction(this.config.appwriteClient!, f.$id);
        detailedFunctions.push(full);
      } catch {
        detailedFunctions.push(f);
      }
    }

    this.updatedConfig.functions = detailedFunctions.map(
      (func: any) => ({
        $id: func.$id,
        name: func.name,
        runtime: func.runtime as Runtime,
        execute: func.execute,
        events: func.events || [],
        schedule: func.schedule || "",
        timeout: func.timeout || 15,
        enabled: func.enabled !== false,
        logging: func.logging !== false,
        entrypoint: func.entrypoint || "src/main.ts",
        commands: func.commands || "npm install",
        scopes: Array.isArray(func.scopes) ? func.scopes : [],
        dirPath: `functions/${func.name}`,
        buildSpecification: func.buildSpecification as Specification,
        runtimeSpecification: func.runtimeSpecification as Specification,
      })
    );

    // Make sure to update the config with all changes including databases
    updatedConfig.functions = this.updatedConfig.functions;
    this.updatedConfig = updatedConfig;
    MessageFormatter.success(`Sync completed - ${updatedConfig.databases.length} databases, ${updatedConfig.collections?.length || 0} collections, ${updatedConfig.buckets?.length || 0} buckets, ${updatedConfig.functions?.length || 0} functions`, { prefix: "Migration" });
  }

  async toSchemas(
    databases?: Models.Database[],
    databaseSelections?: DatabaseSelection[],
    bucketSelections?: BucketSelection[]
  ) {
    try {
      MessageFormatter.info("Starting sync-from-Appwrite process...", { prefix: "Migration" });
      await this.appwriteSync(this.config, databases, databaseSelections, bucketSelections);

      const generator = new SchemaGenerator(
        this.updatedConfig,
        this.appwriteFolderPath
      );

      // Pass API mode context to the schema generator
      const apiContext = this.getSchemaGeneratorApiContext();

      // Extend the config with API mode information for schema generation
      const configWithApiContext = {
        ...this.updatedConfig,
        apiMode: apiContext.apiMode,
        databaseApiModes: apiContext.databaseApiModes,
        adapterMetadata: apiContext.adapterMetadata
      };

      // Check if this is a YAML-based project
      const yamlConfigPath = findYamlConfig(this.appwriteFolderPath);
      const isYamlProject = !!yamlConfigPath;

      if (isYamlProject) {
        MessageFormatter.info("Detected YAML configuration - generating YAML collection definitions", { prefix: "Migration" });
        generator.updateYamlCollections();
        await generator.updateConfig(configWithApiContext, true);
      } else {
        MessageFormatter.info("Generating TypeScript collection definitions", { prefix: "Migration" });
        generator.updateTsSchemas();
        await generator.updateConfig(configWithApiContext, false);
      }

      MessageFormatter.info("Generating Zod schemas from synced collections...", { prefix: "Migration" });
      await generator.generateSchemas();
      MessageFormatter.success("Sync-from-Appwrite process completed successfully", { prefix: "Migration" });
    } catch (error) {
      MessageFormatter.error(
        "Error during sync-from-Appwrite process",
        error instanceof Error ? error : new Error(String(error)),
        { prefix: "Migration" }
      );
      throw error;
    }
  }
}
