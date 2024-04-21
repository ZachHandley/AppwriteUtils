import type { ImportDataActions } from "./importDataActions.js";
import {
  AttributeMappingsSchema,
  CollectionCreateSchema,
  importDefSchema,
  type AppwriteConfig,
  type AttributeMappings,
  type ConfigCollection,
  type ConfigDatabase,
  type ImportDef,
  type ImportDefs,
  type RelationshipAttribute,
} from "./schema.js";
import path from "path";
import fs from "fs";
import { convertObjectByAttributeMappings } from "./converters.js";
import { z } from "zod";
import { checkForCollection } from "./collections.js";
import { ID, Users, type Databases } from "node-appwrite";
import { logger } from "./logging.js";
import { findOrCreateOperation, updateOperation } from "./migrationHelper.js";
import { AuthUserCreateSchema } from "../schemas/authUser.js";
import _ from "lodash";
import { UsersController } from "./users.js";
// Define a schema for the structure of collection import data using Zod for validation
export const CollectionImportDataSchema = z.object({
  // Optional collection creation schema
  collection: CollectionCreateSchema.optional(),
  // Array of data objects each containing rawData, finalData, context, and an import definition
  data: z.array(
    z.object({
      rawData: z.any(), // The initial raw data
      finalData: z.any(), // The transformed data ready for import
      context: z.any(), // Additional context for the data transformation
      importDef: importDefSchema.optional(), // The import definition schema
    })
  ),
});

// Infer the TypeScript type from the Zod schema
export type CollectionImportData = z.infer<typeof CollectionImportDataSchema>;

// DataLoader class to handle the loading of data into collections
export class DataLoader {
  // Private member variables to hold configuration and state
  private appwriteFolderPath: string;
  private importDataActions: ImportDataActions;
  private database: Databases;
  private usersController: UsersController;
  private config: AppwriteConfig;
  // Map to hold the import data for each collection by name
  importMap = new Map<string, CollectionImportData>();
  // Map to track old to new ID mappings for each collection, if applicable
  private oldIdToNewIdPerCollectionMap = new Map<string, Map<string, string>>();
  // Map to hold the import operation ID for each collection
  collectionImportOperations = new Map<string, string>();
  // Map to hold the merged user map for relationship resolution
  // Will hold an array of the old user ID's that are mapped to the same new user ID
  // For example, if there are two users with the same email, they will both be mapped to the same new user ID
  // Prevents duplicate users with the other two maps below it and allows me to keep the old ID's
  private mergedUserMap = new Map<string, string[]>();
  // Maps to hold email and phone to user ID mappings for unique-ness in User Accounts
  private emailToUserIdMap = new Map<string, string>();
  private phoneToUserIdMap = new Map<string, string>();

  // Constructor to initialize the DataLoader with necessary configurations
  constructor(
    appwriteFolderPath: string,
    importDataActions: ImportDataActions,
    database: Databases,
    config: AppwriteConfig
  ) {
    this.appwriteFolderPath = appwriteFolderPath;
    this.importDataActions = importDataActions;
    this.database = database;
    this.usersController = new UsersController(config, database);
    this.config = config;
  }

  // Helper method to generate a consistent key for collections
  getCollectionKey(name: string) {
    return name.toLowerCase().replace(" ", "");
  }

  // Method to load data from a file specified in the import definition
  async loadData(importDef: ImportDef): Promise<any[]> {
    // Resolve the file path and check if the file exists
    const filePath = path.resolve(this.appwriteFolderPath, importDef.filePath);
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return [];
    }

    // Read the file and parse the JSON data
    const rawData = fs.readFileSync(filePath, "utf8");
    return importDef.basePath
      ? JSON.parse(rawData)[importDef.basePath]
      : JSON.parse(rawData);
  }

  // Helper method to check if a new ID already exists in the old-to-new ID map
  checkMapValuesForId(newId: string, collectionName: string) {
    const oldIdMap = this.oldIdToNewIdPerCollectionMap.get(collectionName);
    for (const [key, value] of oldIdMap?.entries() || []) {
      if (value === newId) {
        return key;
      }
    }
    return false;
  }

  // Method to generate a unique ID that doesn't conflict with existing IDs
  getTrueUniqueId(collectionName: string) {
    let newId = ID.unique();
    while (this.checkMapValuesForId(newId, collectionName)) {
      newId = ID.unique();
    }
    return newId;
  }

  // Method to create a context object for data transformation
  createContext(
    db: ConfigDatabase,
    collection: ConfigCollection,
    item: any,
    docId: string
  ) {
    return {
      ...item, // Spread the item data for easy access to its properties
      dbId: db.$id,
      dbName: db.name,
      collId: collection.$id,
      collName: collection.name,
      docId: docId,
      createdDoc: {}, // Initially null, to be updated when the document is created
    };
  }

  /**
   * Transforms the given item based on the provided attribute mappings.
   * This method applies conversion rules to the item's attributes as defined in the attribute mappings.
   *
   * @param item - The item to be transformed.
   * @param attributeMappings - The mappings that define how each attribute should be transformed.
   * @returns The transformed item.
   */
  async transformData(
    item: any,
    attributeMappings: AttributeMappings
  ): Promise<any> {
    // Convert the item using the attribute mappings provided
    const convertedItem = convertObjectByAttributeMappings(
      item,
      attributeMappings
    );
    // Run additional converter functions on the converted item, if any
    return this.importDataActions.runConverterFunctions(
      convertedItem,
      attributeMappings
    );
  }

  async setupMaps(dbId: string) {
    // Initialize the users collection in the import map
    this.importMap.set(this.getCollectionKey("users"), {
      data: [],
    });
    for (const db of this.config.databases) {
      if (db.$id !== dbId) {
        continue;
      }
      for (let index = 0; index < this.config.collections.length; index++) {
        const collectionConfig = this.config.collections[index];
        let collection = CollectionCreateSchema.parse(collectionConfig);
        // Check if the collection exists in the database
        const collectionExists = await checkForCollection(
          this.database,
          db.$id,
          collection
        );
        if (!collectionExists) {
          logger.error(`No collection found for ${collection.name}`);
          continue;
        } else if (!collection.name) {
          logger.error(`Collection ${collection.name} has no name`);
          continue;
        }
        // Update the collection ID with the existing one
        collectionConfig.$id = collectionExists.$id;
        collection.$id = collectionExists.$id;
        this.config.collections[index] = collectionConfig;
        // Find or create an import operation for the collection
        const collectionImportOperation = await findOrCreateOperation(
          this.database,
          collection.$id,
          "importData"
        );
        // Store the operation ID in the map
        this.collectionImportOperations.set(
          this.getCollectionKey(collection.name),
          collectionImportOperation.$id
        );
        // Initialize the collection in the import map
        this.importMap.set(this.getCollectionKey(collection.name), {
          collection: collection,
          data: [],
        });
      }
    }
  }

  async getAllUsers() {
    const users = new UsersController(this.config, this.database);
    const allUsers = await users.getAllUsers();
    return allUsers;
  }

  // Main method to start the data loading process for a given database ID
  async start(dbId: string) {
    console.log("---------------------------------");
    console.log(`Starting data setup for database: ${dbId}`);
    console.log("---------------------------------");
    await this.setupMaps(dbId);
    const allUsers = await this.getAllUsers();
    console.log(`Fetched ${allUsers.length} users`);
    // Iterate over the users and setup our maps ahead of time for email and phone
    for (const user of allUsers) {
      if (user.email) {
        this.emailToUserIdMap.set(user.email, user.$id);
      }
      if (user.phone) {
        this.phoneToUserIdMap.set(user.phone, user.$id);
      }
    }
    // Iterate over the configured databases to find the matching one
    for (const db of this.config.databases) {
      if (db.$id !== dbId) {
        continue;
      }
      // Iterate over the configured collections to process each
      for (const collectionConfig of this.config.collections) {
        const collection = collectionConfig;
        // Determine if this is the users collection
        let isUsersCollection =
          this.getCollectionKey(this.config.usersCollectionName) ===
          this.getCollectionKey(collection.name);
        // Process create and update definitions for the collection
        const createDefs = collection.importDefs.filter(
          (def: ImportDef) => def.type === "create" || !def.type
        );
        const updateDefs = collection.importDefs.filter(
          (def: ImportDef) => def.type === "update"
        );
        for (const createDef of createDefs) {
          if (!isUsersCollection) {
            console.log(`${collection.name} is not users collection`);
            await this.prepareCreateData(db, collection, createDef);
          } else {
            // Special handling for users collection if needed
            console.log(`${collection.name} is users collection`);
            await this.prepareUserCollectionCreateData(
              db,
              collection,
              createDef
            );
          }
        }
        for (const updateDef of updateDefs) {
          if (!this.importMap.has(this.getCollectionKey(collection.name))) {
            logger.error(
              `No data found for collection ${collection.name} for updateDef but it says it's supposed to have one...`
            );
            continue;
          }
          // Prepare the update data for the collection
          await this.prepareUpdateData(db, collection, updateDef);
        }
      }
      console.log("Running update references");
      await this.updateReferencesInRelatedCollections();
      console.log("Done running update references");
    }
    // for (const collection of this.config.collections) {
    //   this.resolveDataItemRelationships(collection);
    // }
    console.log("---------------------------------");
    console.log(`Data setup for database: ${dbId} completed`);
    console.log("---------------------------------");
    // this.writeMapsToJsonFile();
  }

  async updateReferencesInRelatedCollections() {
    // Iterate over each collection configuration
    for (const collectionConfig of this.config.collections) {
      const collectionKey = this.getCollectionKey(collectionConfig.name);
      const collectionData = this.importMap.get(collectionKey);
      let isUsersCollection =
        this.getCollectionKey(this.config.usersCollectionName) ===
        this.getCollectionKey(collectionConfig.name);

      if (!collectionData || !collectionData.data) continue;

      // Iterate over each data item in the current collection
      for (const item of collectionData.data) {
        let needsUpdate = false;

        // Check if the current collection has import definitions with idMappings
        if (collectionConfig.importDefs) {
          for (const importDef of collectionConfig.importDefs) {
            if (importDef.idMappings) {
              // Iterate over each idMapping defined for the current import definition
              for (const idMapping of importDef.idMappings) {
                // Use the context for source and target field values
                const oldId = item.context[idMapping.sourceField];
                if (oldId) {
                  let newIdForOldId: string | undefined;
                  if (
                    isUsersCollection &&
                    this.getCollectionKey(idMapping.targetCollection) ===
                      this.getCollectionKey(this.config.usersCollectionName)
                  ) {
                    for (const [
                      newUserId,
                      oldIds,
                    ] of this.mergedUserMap.entries()) {
                      // Check if the oldId is in the list of oldIds
                      // We only care if there's more than one cause all get one
                      if (oldIds.includes(`${oldId}`) && oldIds.length > 1) {
                        newIdForOldId = newUserId;
                        break;
                      }
                    }
                  }
                  if (newIdForOldId) {
                    if (idMapping.fieldToSet) {
                      item.finalData[idMapping.fieldToSet] = newIdForOldId;
                    } else {
                      item.finalData[idMapping.targetField] = newIdForOldId;
                    }
                    console.log(
                      `MERGED USER ID UPDATE: Updated ${oldId} to ${
                        item.finalData[
                          idMapping.fieldToSet || idMapping.targetField
                        ]
                      }`
                    );
                    needsUpdate = true;
                  } else {
                    // Find the target collection's oldIdToNewIdMap
                    const targetCollectionKey = this.getCollectionKey(
                      idMapping.targetCollection
                    );
                    const targetOldIdToNewIdMap =
                      this.oldIdToNewIdPerCollectionMap.get(
                        targetCollectionKey
                      );

                    if (
                      targetOldIdToNewIdMap &&
                      targetOldIdToNewIdMap.has(`${oldId}`)
                    ) {
                      if (idMapping.fieldToSet) {
                        // Update the item's context with the new ID from the target collection
                        item.finalData[idMapping.fieldToSet] =
                          targetOldIdToNewIdMap.get(`${oldId}`);
                      } else {
                        // Update the item's context with the new ID from the target collection
                        item.finalData[idMapping.targetField] =
                          targetOldIdToNewIdMap.get(`${oldId}`);
                      }
                      needsUpdate = true;
                    }
                  }
                }
              }
            }
          }
        }

        // If updates were made, set the updated item back in the importMap
        if (needsUpdate) {
          this.importMap.set(collectionKey, collectionData);
        }
      }
    }
  }

  // async updateReferencesInRelatedCollections() {
  //   // Process each collection defined in the config
  //   for (const collection of this.config.collections) {
  //     // Ensure we handle only those definitions with idMappings and a primaryKeyField defined
  //     for (const importDef of collection.importDefs) {
  //       if (!importDef.idMappings || !importDef.primaryKeyField) continue;

  //       // Load data for this particular import definition
  //       const collectionData = this.importMap.get(
  //         this.getCollectionKey(collection.name)
  //       )?.data;
  //       if (!collectionData) continue;

  //       // Iterate over each item in the collection data
  //       for (const item of collectionData) {
  //         let needsUpdate = false;

  //         // Go through each idMapping defined for the collection
  //         for (const mapping of importDef.idMappings) {
  //           const oldReferenceId =
  //             item[mapping.targetField as keyof typeof item]; // Get the current reference ID from the item
  //           const referenceCollectionMap =
  //             this.oldIdToNewIdPerCollectionMap.get(
  //               this.getCollectionKey(mapping.targetCollection)
  //             );

  //           if (
  //             referenceCollectionMap &&
  //             referenceCollectionMap.has(oldReferenceId)
  //           ) {
  //             // Update the target field with the new reference ID from the mapped collection
  //             item[mapping.sourceField as keyof typeof item] =
  //               referenceCollectionMap.get(oldReferenceId);
  //             needsUpdate = true;
  //             console.log(
  //               `Updated item with ${mapping.sourceField} = ${JSON.stringify(
  //                 item,
  //                 null,
  //                 undefined
  //               )}.`
  //             );
  //           }
  //         }

  //         // Save changes if any reference was updated
  //         if (needsUpdate) {
  //           await this.saveUpdatedItem(
  //             collection.name,
  //             item,
  //             importDef.primaryKeyField
  //           );
  //         }
  //       }
  //     }
  //   }
  // }

  // private writeMapsToJsonFile() {
  //   const outputDir = path.resolve(process.cwd());
  //   const outputFile = path.join(outputDir, "dataLoaderOutput.json");

  //   const dataToWrite = {
  //     dataFromCollections: Array.from(this.importMap.entries()).map(
  //       ([key, value]) => {
  //         return {
  //           collection: key,
  //           data: value.data.map((item: any) => item.finalData),
  //         };
  //       }
  //     ),
  //     // Convert Maps to arrays of entries for serialization
  //     mergedUserMap: Array.from(this.mergedUserMap.entries()),
  //     // emailToUserIdMap: Array.from(this.emailToUserIdMap.entries()),
  //     // phoneToUserIdMap: Array.from(this.phoneToUserIdMap.entries()),
  //   };

  //   // Use JSON.stringify with a replacer function to handle Maps
  //   const replacer = (key: any, value: any) => {
  //     if (value instanceof Map) {
  //       return Array.from(value.entries());
  //     }
  //     return value;
  //   };

  //   fs.writeFile(
  //     outputFile,
  //     JSON.stringify(dataToWrite, replacer, 2),
  //     "utf8",
  //     (err) => {
  //       if (err) {
  //         console.error("Error writing data to JSON file:", err);
  //         return;
  //       }
  //       console.log(`Data successfully written to ${outputFile}`);
  //     }
  //   );
  // }

  /**
   * Prepares user data by checking for duplicates based on email or phone, adding to a duplicate map if found,
   * and then returning the transformed item without user-specific keys.
   *
   * @param item - The raw item to be processed.
   * @param attributeMappings - The attribute mappings for the item.
   * @returns The transformed item with user-specific keys removed.
   */
  async prepareUserData(
    item: any,
    attributeMappings: AttributeMappings,
    primaryKeyField: string,
    newId: string
  ): Promise<any> {
    // Transform the item data based on the attribute mappings
    let transformedItem = await this.transformData(item, attributeMappings);
    const userData = AuthUserCreateSchema.safeParse(transformedItem);
    if (!userData.success) {
      logger.error(
        `Invalid user data: ${JSON.stringify(
          userData.error.errors,
          undefined,
          2
        )}`
      );
      return transformedItem;
    }
    const email = userData.data.email;
    const phone = userData.data.phone;
    let existingId: string | undefined;

    // Check for duplicate email and add to emailToUserIdMap if not found
    if (email && email.length > 0) {
      if (this.emailToUserIdMap.has(email)) {
        logger.error(`Duplicate email found or user exists already: ${email}`);
        existingId = this.emailToUserIdMap.get(email);
      } else {
        this.emailToUserIdMap.set(email, newId);
      }
    }

    // Check for duplicate phone and add to phoneToUserIdMap if not found
    if (phone && phone.length > 0) {
      if (this.phoneToUserIdMap.has(phone)) {
        logger.error(`Duplicate phone found: ${phone}`);
        existingId = this.phoneToUserIdMap.get(phone);
      } else {
        this.phoneToUserIdMap.set(phone, newId);
      }
    }
    if (!existingId) {
      existingId = newId;
    }

    // If existingId is found, add to mergedUserMap
    if (existingId) {
      userData.data.userId = existingId;
      const mergedUsers = this.mergedUserMap.get(existingId) || [];
      mergedUsers.push(`${item[primaryKeyField]}`);
      this.mergedUserMap.set(existingId, mergedUsers);
      transformedItem["userId"] = existingId;
      transformedItem["docId"] = existingId;
    }

    // Remove user-specific keys from the transformed item
    const userKeys = ["email", "phone", "name", "labels", "prefs"];
    userKeys.forEach((key) => {
      if (transformedItem.hasOwnProperty(key)) {
        delete transformedItem[key];
      }
    });
    const usersMap = this.importMap.get(this.getCollectionKey("users"));
    if (usersMap) {
      usersMap.data.push({
        rawData: item,
        finalData: userData.data,
      });
    }
    const userDataToAdd = {
      rawData: item,
      finalData: userData.data,
    };
    this.importMap.set(this.getCollectionKey("users"), {
      data: [...(usersMap?.data || []), userDataToAdd],
    });

    return [transformedItem, existingId, userDataToAdd];
  }

  /**
   * Prepares the data for creating user collection documents.
   * This involves loading the data, transforming it according to the import definition,
   * and handling the creation of new unique IDs for each item.
   *
   * @param db - The database configuration.
   * @param collection - The collection configuration.
   * @param importDef - The import definition containing the attribute mappings and other relevant info.
   */
  async prepareUserCollectionCreateData(
    db: ConfigDatabase,
    collection: ConfigCollection,
    importDef: ImportDef
  ): Promise<void> {
    // Load the raw data based on the import definition
    const rawData = await this.loadData(importDef);
    const operationId = this.collectionImportOperations.get(
      this.getCollectionKey(collection.name)
    );
    // Initialize a new map for old ID to new ID mappings
    const oldIdToNewIdMap = new Map<string, string>();
    // Retrieve or initialize the collection-specific old ID to new ID map
    const collectionOldIdToNewIdMap =
      this.oldIdToNewIdPerCollectionMap.get(
        this.getCollectionKey(collection.name)
      ) ||
      this.oldIdToNewIdPerCollectionMap
        .set(this.getCollectionKey(collection.name), oldIdToNewIdMap)
        .get(this.getCollectionKey(collection.name));
    console.log(
      `${collection.name} -- collectionOldIdToNewIdMap: ${collectionOldIdToNewIdMap}`
    );
    if (!operationId) {
      throw new Error(
        `No import operation found for collection ${collection.name}`
      );
    }
    await updateOperation(this.database, operationId, {
      status: "ready",
      total: rawData.length,
    });
    // Retrieve the current user data and the current collection data from the import map
    const currentUserData = this.importMap.get(this.getCollectionKey("users"));
    const currentData = this.importMap.get(
      this.getCollectionKey(collection.name)
    );
    // Log errors if the necessary data is not found in the import map
    if (!currentUserData) {
      logger.error(
        `No data found for collection ${"users"} for createDef but it says it's supposed to have one...`
      );
      return;
    } else if (!currentData) {
      logger.error(
        `No data found for collection ${collection.name} for createDef but it says it's supposed to have one...`
      );
      return;
    }
    // Iterate through each item in the raw data
    for (const item of rawData) {
      // Prepare user data, check for duplicates, and remove user-specific keys
      let [transformedItem, existingId, userData] = await this.prepareUserData(
        item,
        importDef.attributeMappings,
        importDef.primaryKeyField,
        this.getTrueUniqueId(this.getCollectionKey("users"))
      );

      logger.info(
        `In create user -- transformedItem: ${JSON.stringify(
          transformedItem,
          null,
          2
        )}`
      );

      // Generate a new unique ID for the item or use existing ID
      if (!existingId) {
        // No existing user ID, generate a new unique ID
        existingId = this.getTrueUniqueId(this.getCollectionKey("users"));
        transformedItem.userId = existingId; // Assign the new ID to the transformed data's userId field
      }

      // Create a context object for the item, including the new ID
      let context = this.createContext(db, collection, item, existingId);

      // Merge the transformed data into the context
      context = { ...context, ...transformedItem };

      // If a primary key field is defined, handle the ID mapping and check for duplicates
      if (importDef.primaryKeyField) {
        const oldId = item[importDef.primaryKeyField];

        // Check if the oldId already exists to handle potential duplicates
        if (
          this.oldIdToNewIdPerCollectionMap
            .get(this.getCollectionKey(collection.name))
            ?.has(`${oldId}`)
        ) {
          // Found a duplicate oldId, now decide how to merge or handle these duplicates
          for (const data of currentData.data) {
            if (
              data.finalData.docId === oldId ||
              data.finalData.userId === oldId
            ) {
              Object.assign(data.finalData, transformedItem);
            }
          }
        } else {
          // No duplicate found, simply map the oldId to the new itemId
          collectionOldIdToNewIdMap?.set(`${oldId}`, `${existingId}`);
        }
      }
      // Merge the final user data into the context
      context = { ...context, ...userData.finalData };

      // Handle merging for currentUserData
      for (let i = 0; i < currentUserData.data.length; i++) {
        if (
          (currentUserData.data[i].finalData.docId === existingId ||
            currentUserData.data[i].finalData.userId === existingId) &&
          !_.isEqual(currentUserData.data[i], userData)
        ) {
          Object.assign(currentUserData.data[i].finalData, transformedItem);
          Object.assign(currentUserData.data[i].rawData, item);
          console.log("Merging user data", currentUserData.data[i].finalData);
          this.importMap.set(this.getCollectionKey("users"), currentUserData);
        }
      }
      // Update the attribute mappings with any actions that need to be performed post-import
      const mappingsWithActions = this.getAttributeMappingsWithActions(
        importDef.attributeMappings,
        context,
        transformedItem
      );
      // Update the import definition with the new attribute mappings
      const newImportDef = {
        ...importDef,
        attributeMappings: mappingsWithActions,
      };

      let foundData = false;
      for (let i = 0; i < currentData.data.length; i++) {
        if (
          currentData.data[i].finalData.docId === existingId ||
          currentData.data[i].finalData.userId === existingId
        ) {
          currentData.data[i].finalData = {
            ...currentData.data[i].finalData,
            ...transformedItem,
          };
          currentData.data[i].importDef = newImportDef;
          this.importMap.set(
            this.getCollectionKey(collection.name),
            currentData
          );
          this.oldIdToNewIdPerCollectionMap.set(
            this.getCollectionKey(collection.name),
            collectionOldIdToNewIdMap!
          );
          foundData = true;
        }
      }
      if (!foundData) {
        // Add new data to the associated collection
        currentData.data.push({
          rawData: item,
          context: context,
          importDef: newImportDef,
          finalData: transformedItem,
        });
        this.importMap.set(this.getCollectionKey(collection.name), currentData);
        this.oldIdToNewIdPerCollectionMap.set(
          this.getCollectionKey(collection.name),
          collectionOldIdToNewIdMap!
        );
      }
    }
  }

  /**
   * Prepares the data for creating documents in a collection.
   * This involves loading the data, transforming it, and handling ID mappings.
   *
   * @param db - The database configuration.
   * @param collection - The collection configuration.
   * @param importDef - The import definition containing the attribute mappings and other relevant info.
   */
  async prepareCreateData(
    db: ConfigDatabase,
    collection: ConfigCollection,
    importDef: ImportDef
  ): Promise<void> {
    // Load the raw data based on the import definition
    const rawData = await this.loadData(importDef);
    const operationId = this.collectionImportOperations.get(
      this.getCollectionKey(collection.name)
    );
    if (!operationId) {
      throw new Error(
        `No import operation found for collection ${collection.name}`
      );
    }
    await updateOperation(this.database, operationId, {
      status: "ready",
      total: rawData.length,
    });
    // Initialize a new map for old ID to new ID mappings
    const oldIdToNewIdMapNew = new Map<string, string>();
    // Retrieve or initialize the collection-specific old ID to new ID map
    const collectionOldIdToNewIdMap =
      this.oldIdToNewIdPerCollectionMap.get(
        this.getCollectionKey(collection.name)
      ) ||
      this.oldIdToNewIdPerCollectionMap
        .set(this.getCollectionKey(collection.name), oldIdToNewIdMapNew)
        .get(this.getCollectionKey(collection.name));
    console.log(
      `${collection.name} -- collectionOldIdToNewIdMap: ${collectionOldIdToNewIdMap}`
    );
    // Iterate through each item in the raw data
    for (const item of rawData) {
      // Generate a new unique ID for the item
      const itemIdNew = this.getTrueUniqueId(
        this.getCollectionKey(collection.name)
      );
      // Retrieve the current collection data from the import map
      const currentData = this.importMap.get(
        this.getCollectionKey(collection.name)
      );
      // Create a context object for the item, including the new ID
      let context = this.createContext(db, collection, item, itemIdNew);
      // Transform the item data based on the attribute mappings
      const transformedData = await this.transformData(
        item,
        importDef.attributeMappings
      );
      // If a primary key field is defined, handle the ID mapping and check for duplicates
      if (importDef.primaryKeyField) {
        const oldId = item[importDef.primaryKeyField];
        if (collectionOldIdToNewIdMap?.has(`${oldId}`)) {
          logger.error(
            `Collection ${collection.name} has multiple documents with the same primary key ${oldId}`
          );
          continue;
        }
        collectionOldIdToNewIdMap?.set(`${oldId}`, `${itemIdNew}`);
      }
      // Merge the transformed data into the context
      context = { ...context, ...transformedData };
      // Validate the item before proceeding
      const isValid = await this.importDataActions.validateItem(
        transformedData,
        importDef.attributeMappings,
        context
      );
      if (!isValid) {
        continue;
      }
      // Update the attribute mappings with any actions that need to be performed post-import
      const mappingsWithActions = this.getAttributeMappingsWithActions(
        importDef.attributeMappings,
        context,
        transformedData
      );
      // Update the import definition with the new attribute mappings
      const newImportDef = {
        ...importDef,
        attributeMappings: mappingsWithActions,
      };
      // If the current collection data exists, add the item with its context and final data
      if (currentData && currentData.data) {
        currentData.data.push({
          rawData: item,
          context: context,
          importDef: newImportDef,
          finalData: transformedData,
        });
        this.importMap.set(this.getCollectionKey(collection.name), currentData);
        console.log(
          `Set import map for ${collection.name}, length is ${currentData.data.length}`
        );
        this.oldIdToNewIdPerCollectionMap.set(
          this.getCollectionKey(collection.name),
          collectionOldIdToNewIdMap!
        );
      } else {
        logger.error(
          `No data found for collection ${collection.name} for createDef but it says it's supposed to have one...`
        );
        continue;
      }
    }
  }
  /**
   * Prepares the data for updating documents within a collection.
   * This method loads the raw data based on the import definition, transforms it according to the attribute mappings,
   * finds the new ID for each item based on the primary key or update mapping, and then validates the transformed data.
   * If the data is valid, it updates the import definition with any post-import actions and adds the item to the current collection data.
   *
   * @param db - The database configuration.
   * @param collection - The collection configuration.
   * @param importDef - The import definition containing the attribute mappings and other relevant info.
   */
  async prepareUpdateData(
    db: ConfigDatabase,
    collection: ConfigCollection,
    importDef: ImportDef
  ) {
    // Retrieve the current collection data and old-to-new ID map from the import map
    const currentData = this.importMap.get(
      this.getCollectionKey(collection.name)
    );
    const oldIdToNewIdMap = this.oldIdToNewIdPerCollectionMap.get(
      this.getCollectionKey(collection.name)
    );
    // Log an error and return if no current data is found for the collection
    if (
      !(currentData?.data && currentData?.data.length > 0) &&
      !oldIdToNewIdMap
    ) {
      logger.error(
        `No data found for collection ${collection.name} for updateDef but it says it's supposed to have one...`
      );
      return;
    }
    // Load the raw data based on the import definition
    const rawData = await this.loadData(importDef);
    const operationId = this.collectionImportOperations.get(
      this.getCollectionKey(collection.name)
    );
    if (!operationId) {
      throw new Error(
        `No import operation found for collection ${collection.name}`
      );
    }
    for (const item of rawData) {
      // Transform the item data based on the attribute mappings
      const transformedData = await this.transformData(
        item,
        importDef.attributeMappings
      );
      let newId: string | undefined;
      let oldId: string | undefined;
      // Determine the new ID for the item based on the primary key field or update mapping
      if (importDef.primaryKeyField) {
        oldId = item[importDef.primaryKeyField];
      } else if (importDef.updateMapping) {
        oldId = item[importDef.updateMapping.originalIdField];
      }
      if (oldId) {
        newId = oldIdToNewIdMap?.get(`${oldId}`);
        if (
          !newId &&
          this.getCollectionKey(this.config.usersCollectionName) ===
            this.getCollectionKey(collection.name)
        ) {
          for (const [key, value] of this.mergedUserMap.entries()) {
            if (value.includes(`${oldId}`)) {
              newId = key;
              break;
            }
          }
        }
      } else {
        logger.error(
          `No old ID found (to update another document with) in prepareUpdateData for ${
            collection.name
          }, ${JSON.stringify(item, null, 2)}`
        );
        continue;
      }
      // Log an error and continue to the next item if no new ID is found
      if (!newId) {
        logger.error(
          `No new id found for collection ${
            collection.name
          } for updateDef ${JSON.stringify(
            item,
            null,
            2
          )} but it says it's supposed to have one...`
        );
        continue;
      }
      // Create a context object for the item, including the new ID and transformed data
      let context = this.createContext(db, collection, item, newId);
      context = { ...context, ...transformedData };
      // Validate the item before proceeding
      const isValid = await this.importDataActions.validateItem(
        item,
        importDef.attributeMappings,
        context
      );
      // Log info and continue to the next item if it's invalid
      if (!isValid) {
        logger.info(
          `Skipping item: ${JSON.stringify(item, null, 2)} because it's invalid`
        );
        continue;
      }
      // Update the attribute mappings with any actions that need to be performed post-import
      const mappingsWithActions = this.getAttributeMappingsWithActions(
        importDef.attributeMappings,
        context,
        transformedData
      );
      // Update the import definition with the new attribute mappings
      const newImportDef = {
        ...importDef,
        attributeMappings: mappingsWithActions,
      };
      // Add the item with its context and final data to the current collection data
      if (currentData) {
        currentData.data.push({
          rawData: item,
          context: context,
          importDef: newImportDef,
          finalData: transformedData,
        });
        this.importMap.set(this.getCollectionKey(collection.name), currentData);
      }
    }
  }

  private updateReferencesBasedOnAttributeMappings() {
    this.config.collections.forEach((collectionConfig) => {
      const collectionName = collectionConfig.name;
      const collectionData = this.importMap.get(
        this.getCollectionKey(collectionName)
      );

      if (!collectionData) {
        logger.error(`No data found for collection ${collectionName}`);
        return;
      }

      collectionData.data.forEach((dataItem) => {
        collectionConfig.importDefs.forEach((importDef) => {
          if (!importDef.idMappings) return; // Skip collections without idMappings
          importDef.idMappings.forEach((mapping) => {
            if (mapping && mapping.targetField) {
              const idsToUpdate = Array.isArray(
                dataItem[mapping.targetField as keyof typeof dataItem]
              )
                ? dataItem[mapping.targetField as keyof typeof dataItem]
                : [dataItem[mapping.targetField as keyof typeof dataItem]];
              const updatedIds = idsToUpdate.map((id: string) =>
                this.getMergedId(id, mapping.targetCollection)
              );

              // Update the dataItem with the new IDs
              dataItem[mapping.targetField as keyof typeof dataItem] =
                Array.isArray(
                  dataItem[mapping.targetField as keyof typeof dataItem]
                )
                  ? updatedIds
                  : updatedIds[0];
            }
          });
        });
      });
    });
  }

  private getMergedId(oldId: string, relatedCollectionName: string): string {
    // Retrieve the old to new ID map for the related collection
    const oldToNewIdMap = this.oldIdToNewIdPerCollectionMap.get(
      this.getCollectionKey(relatedCollectionName)
    );

    // If there's a mapping for the old ID, return the new ID
    if (oldToNewIdMap && oldToNewIdMap.has(`${oldId}`)) {
      return oldToNewIdMap.get(`${oldId}`)!; // The non-null assertion (!) is used because we checked if the map has the key
    }

    // If no mapping is found, return the old ID as a fallback
    return oldId;
  }

  /**
   * Generates attribute mappings with post-import actions based on the provided attribute mappings.
   * This method checks each mapping for a fileData attribute and adds a post-import action to create a file
   * and update the field with the file's ID if necessary.
   *
   * @param attributeMappings - The attribute mappings from the import definition.
   * @param context - The context object containing information about the database, collection, and document.
   * @param item - The item being imported, used for resolving template paths in fileData mappings.
   * @returns The attribute mappings updated with any necessary post-import actions.
   */
  getAttributeMappingsWithActions(
    attributeMappings: AttributeMappings,
    context: any,
    item: any
  ) {
    // Iterate over each attribute mapping to check for fileData attributes
    return attributeMappings.map((mapping) => {
      if (mapping.fileData) {
        // Resolve the file path using the provided template, context, and item
        let mappingFilePath = this.importDataActions.resolveTemplate(
          mapping.fileData.path,
          context,
          item
        );
        // Ensure the file path is absolute if it doesn't start with "http"
        if (!mappingFilePath.toLowerCase().startsWith("http")) {
          mappingFilePath = path.resolve(
            this.appwriteFolderPath,
            mappingFilePath
          );
        }
        // Define the after-import action to create a file and update the field
        const afterImportAction = {
          action: "createFileAndUpdateField",
          params: [
            "{dbId}",
            "{collId}",
            "{docId}",
            mapping.targetKey,
            `${this.config!.documentBucketId}_${context.dbName
              .toLowerCase()
              .replace(" ", "")}`, // Assuming 'images' is your bucket ID
            mappingFilePath,
            mapping.fileData.name,
          ],
        };
        // Add the after-import action to the mapping's postImportActions array
        const postImportActions = mapping.postImportActions
          ? [...mapping.postImportActions, afterImportAction]
          : [afterImportAction];
        return { ...mapping, postImportActions };
      }
      // Return the mapping unchanged if no fileData attribute is found
      return mapping;
    });
  }
}
