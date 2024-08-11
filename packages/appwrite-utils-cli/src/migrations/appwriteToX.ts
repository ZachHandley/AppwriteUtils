import { SchemaGenerator } from "./schemaStrings.js";
import {
  Client,
  Compression,
  Databases,
  Query,
  Storage,
  type Models,
  type Permission,
} from "node-appwrite";
import { fetchAllCollections } from "./collections.js";
import { fetchAllDatabases } from "./databases.js";
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
} from "appwrite-utils";
import { getDatabaseFromConfig } from "./afterImportActions.js";
import { listBuckets } from "../storage/methods.js";

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
      databases = await fetchAllDatabases(db);
    }
    let updatedConfig: AppwriteConfig = { ...config };

    // Fetch all buckets
    const allBuckets = await listBuckets(this.storage);

    // Loop through each database
    for (const database of databases) {
      if (database.name.toLowerCase() === "migrations") {
        continue;
      }

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
        console.log(`Processing collection: ${collection.name}`);
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
          .filter((attribute) =>
            attribute.type === "relationship"
              ? attribute.side !== "child"
              : true
          );
        for (const attribute of collAttributes) {
          if (
            attribute.type === "relationship" &&
            attribute.relatedCollection
          ) {
            console.log(
              `Fetching related collection for ID: ${attribute.relatedCollection}`
            );
            try {
              const relatedCollectionPulled = await db.getCollection(
                database.$id,
                attribute.relatedCollection
              );
              console.log(
                `Fetched Collection Name: ${relatedCollectionPulled.name}`
              );
              attribute.relatedCollection = relatedCollectionPulled.name;
              console.log(
                `Updated attribute.relatedCollection to: ${attribute.relatedCollection}`
              );
            } catch (error) {
              console.log("Error fetching related collection:", error);
            }
          }
        }
        this.collToAttributeMap.set(collection.name, collAttributes);
        const finalIndexes = collection.indexes.map((index) => {
          return {
            ...index,
            orders: index.orders?.filter((order) => {
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

      console.log(
        `Processed ${collections.length} collections in ${database.name}`
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

    this.updatedConfig = updatedConfig;
  }

  async toSchemas(databases?: Models.Database[]) {
    await this.appwriteSync(this.config, databases);
    const generator = new SchemaGenerator(
      this.updatedConfig,
      this.appwriteFolderPath
    );
    generator.updateTsSchemas();
    generator.generateSchemas();
  }
}
