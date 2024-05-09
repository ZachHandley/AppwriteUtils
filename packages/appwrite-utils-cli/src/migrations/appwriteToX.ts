import { SchemaGenerator } from "./schemaStrings.js";
import { Databases, Query, type Models, type Permission } from "node-appwrite";
import { fetchAllCollections } from "./collections.js";
import { fetchAllDatabases } from "./databases.js";
import {
  collectionSchema,
  attributeSchema,
  type AppwriteConfig,
  AppwriteConfigSchema,
  type ConfigDatabases,
  type Attribute,
  permissionsSchema,
  attributesSchema,
  indexesSchema,
} from "./schema.js";
import { getDatabaseFromConfig } from "./afterImportActions.js";

export class AppwriteToX {
  config: AppwriteConfig;
  updatedConfig: AppwriteConfig;
  collToAttributeMap = new Map<string, Attribute[]>();
  appwriteFolderPath: string;

  constructor(config: AppwriteConfig, appwriteFolderPath: string) {
    this.config = config;
    this.updatedConfig = config;
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

  async appwriteSync(config: AppwriteConfig) {
    const db = getDatabaseFromConfig(config);
    const databases = await fetchAllDatabases(db);
    let updatedConfig: AppwriteConfig = { ...config };

    // Loop through each database
    for (const database of databases) {
      if (database.name.toLowerCase() === "migrations") {
        continue;
      }
      const collections = await fetchAllCollections(database.$id, db);

      // Loop through each collection in the current database
      for (const collection of collections) {
        const existingCollectionIndex = updatedConfig.collections.findIndex(
          (c) => c.name === collection.name
        );

        // Parse the collection permissions and attributes
        const collPermissions = this.parsePermissionsArray(
          collection.$permissions
        );
        const collAttributes = attributesSchema
          .parse(
            collection.attributes.map((attr: any) => {
              if (
                attr.type === "string" &&
                attr.format &&
                attr.format.length > 0
              ) {
                return { ...attr, type: attr.format };
              }
              return attr;
            })
          )
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
        const collIndexes = indexesSchema.parse(collection.indexes);

        // Prepare the collection object to be added or updated
        const collToPush = collectionSchema.parse({
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
    this.updatedConfig = updatedConfig;
  }

  async toSchemas() {
    await this.appwriteSync(this.config);
    const generator = new SchemaGenerator(
      this.updatedConfig,
      this.appwriteFolderPath
    );
    generator.updateYamlSchemas();
    generator.generateSchemas();
  }
}
