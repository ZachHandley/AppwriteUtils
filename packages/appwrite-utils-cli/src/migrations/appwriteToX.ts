import { SchemaGenerator } from "../shared/schemaGenerator.js";
import { findYamlConfig } from "../config/yamlConfig.js";
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
import { listBuckets } from "../storage/methods.js";
import { listFunctions, listFunctionDeployments } from "../functions/methods.js";
import { MessageFormatter } from "../shared/messageFormatter.js";

export class AppwriteToX {
  config: AppwriteConfig;
  storage: Storage;
  updatedConfig: AppwriteConfig;
  collToAttributeMap = new Map<string, Attribute[]>();
  appwriteFolderPath: string;

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

  private ensureClientInitialized() {
    if (!this.config.appwriteClient) {
      const client = new Client();
      client
        .setEndpoint(this.config.appwriteEndpoint)
        .setProject(this.config.appwriteProject)
        .setKey(this.config.appwriteKey);
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
    for (const attribute of collection.attributes) {
      const attributeMap = this.collToAttributeMap.get(
        collection.name as string
      );
      const attributeParsed = attributeSchema.parse(attribute);
      this.collToAttributeMap
        .get(collection.name as string)
        ?.push(attributeParsed);
    }
  };

  async appwriteSync(config: AppwriteConfig, databases?: Models.Database[]) {
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
    let updatedConfig: AppwriteConfig = { ...config };

    // Initialize databases array if it doesn't exist
    if (!updatedConfig.databases) {
      updatedConfig.databases = [];
    }

    // Sync remote databases to local config - add missing ones
    MessageFormatter.info(`Syncing ${databases.length} remote databases with local config...`, { prefix: "Migration" });
    let addedCount = 0;
    let updatedCount = 0;

    for (const remoteDb of databases) {
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

    // Loop through each database
    for (const database of databases) {
      // Match bucket to database
      const matchedBucket = allBuckets.buckets.find((bucket) =>
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

      const collections = await fetchAllCollections(database.$id, db);

      // Loop through each collection in the current database
      if (!updatedConfig.collections) {
        updatedConfig.collections = [];
      }
      for (const collection of collections) {
        MessageFormatter.processing(`Processing collection: ${collection.name}`, { prefix: "Migration" });
        const existingCollectionIndex = updatedConfig.collections.findIndex(
          (c) => c.name === collection.name
        );
        // Parse the collection permissions and attributes
        const collPermissions = this.parsePermissionsArray(
          collection.$permissions
        );
        const collAttributes = collection.attributes
          .map((attr: any) => {
            return parseAttribute(attr);
          })
          .filter((attribute: Attribute) =>
            attribute.type === "relationship"
              ? attribute.side !== "child"
              : true
          );
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
              const relatedCollectionPulled = await db.getCollection(
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
        this.collToAttributeMap.set(collection.name, collAttributes);
        const finalIndexes = collection.indexes.map((index: Models.Index) => {
          return {
            ...index,
            orders: index.orders?.filter((order: string) => {
              return order !== null && order;
            }),
          };
        });
        const collIndexes = indexesSchema.parse(finalIndexes) ?? [];

        // Prepare the collection object to be added or updated
        const collToPush = CollectionSchema.parse({
          $id: collection.$id,
          name: collection.name,
          enabled: collection.enabled,
          documentSecurity: collection.documentSecurity,
          $createdAt: collection.$createdAt,
          $updatedAt: collection.$updatedAt,
          $permissions:
            collPermissions.length > 0 ? collPermissions : undefined,
          indexes: collIndexes.length > 0 ? collIndexes : undefined,
          attributes: collAttributes.length > 0 ? collAttributes : undefined,
        });

        if (existingCollectionIndex !== -1) {
          // Update existing collection
          updatedConfig.collections[existingCollectionIndex] = collToPush;
        } else {
          // Add new collection
          updatedConfig.collections.push(collToPush);
        }
      }

      MessageFormatter.success(
        `Processed ${collections.length} collections in ${database.name}`,
        { prefix: "Migration" }
      );
    }
    // Add unmatched buckets as global buckets
    const globalBuckets = allBuckets.buckets.filter(
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

    this.updatedConfig.functions = remoteFunctions.functions.map(
      (func) => ({
        $id: func.$id,
        name: func.name,
        runtime: func.runtime as Runtime,
        execute: func.execute,
        events: func.events || [],
        schedule: func.schedule || "",
        timeout: func.timeout || 15,
        enabled: func.enabled !== false,
        logging: func.logging !== false,
        entrypoint: func.entrypoint || "src/index.ts",
        commands: func.commands || "npm install",
        dirPath: `functions/${func.name}`,
        specification: func.specification as Specification,
      })
    );

    // Make sure to update the config with all changes including databases
    updatedConfig.functions = this.updatedConfig.functions;
    this.updatedConfig = updatedConfig;
    MessageFormatter.success(`Sync completed - ${updatedConfig.databases.length} databases, ${updatedConfig.collections?.length || 0} collections, ${updatedConfig.buckets?.length || 0} buckets, ${updatedConfig.functions?.length || 0} functions`, { prefix: "Migration" });
  }

  async toSchemas(databases?: Models.Database[]) {
    try {
      MessageFormatter.info("Starting sync-from-Appwrite process...", { prefix: "Migration" });
      await this.appwriteSync(this.config, databases);

      const generator = new SchemaGenerator(
        this.updatedConfig,
        this.appwriteFolderPath
      );

      // Check if this is a YAML-based project
      const yamlConfigPath = findYamlConfig(this.appwriteFolderPath);
      const isYamlProject = !!yamlConfigPath;

      if (isYamlProject) {
        MessageFormatter.info("Detected YAML configuration - generating YAML collection definitions", { prefix: "Migration" });
        generator.updateYamlCollections();
        await generator.updateConfig(this.updatedConfig, true);
      } else {
        MessageFormatter.info("Generating TypeScript collection definitions", { prefix: "Migration" });
        generator.updateTsSchemas();
        await generator.updateConfig(this.updatedConfig, false);
      }

      MessageFormatter.info("Generating Zod schemas from synced collections...", { prefix: "Migration" });
      generator.generateSchemas();
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
