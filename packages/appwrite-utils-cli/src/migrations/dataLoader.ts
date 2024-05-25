import type { ImportDataActions } from "./importDataActions.js";
import {
  AttributeMappingsSchema,
  CollectionCreateSchema,
  importDefSchema,
  type AppwriteConfig,
  type AttributeMappings,
  type CollectionCreate,
  type ConfigDatabase,
  type IdMapping,
  type ImportDef,
  type ImportDefs,
  type RelationshipAttribute,
} from "appwrite-utils";
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
import { finalizeByAttributeMap } from "../utils/helperFunctions.js";
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
  userExistsMap = new Map<string, boolean>();
  private shouldWriteFile = false;

  // Constructor to initialize the DataLoader with necessary configurations
  constructor(
    appwriteFolderPath: string,
    importDataActions: ImportDataActions,
    database: Databases,
    config: AppwriteConfig,
    shouldWriteFile?: boolean
  ) {
    this.appwriteFolderPath = appwriteFolderPath;
    this.importDataActions = importDataActions;
    this.database = database;
    this.usersController = new UsersController(config, database);
    this.config = config;
    this.shouldWriteFile = shouldWriteFile || false;
  }

  // Helper method to generate a consistent key for collections
  getCollectionKey(name: string) {
    return name.toLowerCase().replace(" ", "");
  }

  /**
   * Merges two objects by updating the source object with the target object's values.
   * It iterates through the target object's keys and updates the source object if:
   * - The source object has the key.
   * - The target object's value for that key is not null, undefined, or an empty string.
   * - If the target object has an array value, it concatenates the values and removes duplicates.
   *
   * @param source - The source object to be updated.
   * @param target - The target object with values to update the source object.
   * @returns The updated source object.
   */
  mergeObjects(source: any, update: any): any {
    // Create a new object to hold the merged result
    const result = { ...source };

    // Loop through the keys of the object we care about
    for (const [key, value] of Object.entries(source)) {
      // Check if the key exists in the target object
      if (!Object.hasOwn(update, key)) {
        // If the key doesn't exist, we can just skip it like bad cheese
        continue;
      }
      if (update[key] === value) {
        continue;
      }
      // If the value ain't here, we can just do whatever man
      if (value === undefined || value === null || value === "") {
        // If the update key is defined
        if (
          update[key] !== undefined &&
          update[key] !== null &&
          update[key] !== ""
        ) {
          // might as well use it eh?
          result[key] = update[key];
        }
        // ELSE if the value is an array, because it would then not be === to those things above
      } else if (Array.isArray(value)) {
        // Get the update value
        const updateValue = update[key];
        // If the update value is an array, concatenate and remove duplicates
        // and poopy data
        if (Array.isArray(updateValue)) {
          result[key] = [...new Set([...value, ...updateValue])].filter(
            (item) => item !== null && item !== undefined && item !== ""
          );
        } else {
          // If the update value is not an array, just use it
          result[key] = [...value, updateValue].filter(
            (item) => item !== null && item !== undefined && item !== ""
          );
        }
      } else if (typeof value === "object" && !Array.isArray(value)) {
        // If the value is an object, we need to merge it
        if (typeof update[key] === "object" && !Array.isArray(update[key])) {
          result[key] = this.mergeObjects(value, update[key]);
        }
      } else {
        // Finally, the source value is defined, and not an array, so we don't care about the update value
        continue;
      }
    }
    // Because the objects should technically always be validated FIRST, we can assume the update keys are also defined on the source object
    for (const [key, value] of Object.entries(update)) {
      if (value === undefined || value === null || value === "") {
        continue;
      } else if (!Object.hasOwn(source, key)) {
        result[key] = value;
      } else if (
        typeof source[key] === "object" &&
        typeof value === "object" &&
        !Array.isArray(source[key]) &&
        !Array.isArray(value)
      ) {
        result[key] = this.mergeObjects(source[key], value);
      } else if (Array.isArray(source[key]) && Array.isArray(value)) {
        result[key] = [...new Set([...source[key], ...value])].filter(
          (item) => item !== null && item !== undefined && item !== ""
        );
      } else if (
        source[key] === undefined ||
        source[key] === null ||
        source[key] === ""
      ) {
        result[key] = value;
      }
    }

    return result;
  }

  // Method to load data from a file specified in the import definition
  loadData(importDef: ImportDef): any[] {
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
    let condition =
      this.checkMapValuesForId(newId, collectionName) ||
      this.userExistsMap.has(newId) ||
      this.importMap
        .get(this.getCollectionKey("users"))
        ?.data.some(
          (user) =>
            user.finalData.docId === newId || user.finalData.userId === newId
        );
    while (condition) {
      newId = ID.unique();
      condition =
        this.checkMapValuesForId(newId, collectionName) ||
        this.userExistsMap.has(newId) ||
        this.importMap
          .get(this.getCollectionKey("users"))
          ?.data.some(
            (user) =>
              user.finalData.docId === newId || user.finalData.userId === newId
          );
    }
    return newId;
  }

  // Method to create a context object for data transformation
  createContext(
    db: ConfigDatabase,
    collection: CollectionCreate,
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
  transformData(item: any, attributeMappings: AttributeMappings): any {
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
      if (!this.config.collections) {
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
    // Iterate over the users and setup our maps ahead of time for email and phone
    for (const user of allUsers) {
      if (user.email) {
        this.emailToUserIdMap.set(user.email, user.$id);
      }
      if (user.phone) {
        this.phoneToUserIdMap.set(user.phone, user.$id);
      }
      this.userExistsMap.set(user.$id, true);
      let importData = this.importMap.get(this.getCollectionKey("users"));
      if (!importData) {
        importData = {
          data: [],
        };
      }
      importData.data.push({
        finalData: {
          ...user,
          userId: user.$id,
          docId: user.$id,
        },
        rawData: user,
      });
      this.importMap.set(this.getCollectionKey("users"), importData);
    }
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
    // Iterate over the configured databases to find the matching one
    for (const db of this.config.databases) {
      if (db.$id !== dbId) {
        continue;
      }
      if (!this.config.collections) {
        continue;
      }
      // Iterate over the configured collections to process each
      for (const collectionConfig of this.config.collections) {
        const collection = collectionConfig;
        // Determine if this is the users collection
        let isUsersCollection =
          this.getCollectionKey(this.config.usersCollectionName) ===
          this.getCollectionKey(collection.name);
        const collectionDefs = collection.importDefs;
        if (!collectionDefs || !collectionDefs.length) {
          continue;
        }
        // Process create and update definitions for the collection
        const createDefs = collection.importDefs.filter(
          (def: ImportDef) => def.type === "create" || !def.type
        );
        const updateDefs = collection.importDefs.filter(
          (def: ImportDef) => def.type === "update"
        );
        for (const createDef of createDefs) {
          if (!isUsersCollection) {
            await this.prepareCreateData(db, collection, createDef);
          } else {
            // Special handling for users collection if needed
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
          this.prepareUpdateData(db, collection, updateDef);
        }
      }
      console.log("Running update references");
      // this.dealWithMergedUsers();
      this.updateOldReferencesForNew();
      console.log("Done running update references");
    }
    // for (const collection of this.config.collections) {
    //   this.resolveDataItemRelationships(collection);
    // }
    console.log("---------------------------------");
    console.log(`Data setup for database: ${dbId} completed`);
    console.log("---------------------------------");
    if (this.shouldWriteFile) {
      this.writeMapsToJsonFile();
    }
  }

  /**
   * Deals with merged users by iterating through all collections in the configuration.
   * We have merged users if there are duplicate emails or phones in the import data.
   * This function will iterate through all collections that are the same name as the
   * users collection and pull out their primaryKeyField's. It will then loop through
   * each collection and find any documents that have a
   *
   * @return {void} This function does not return anything.
   */
  // dealWithMergedUsers() {
  //   const usersCollectionKey = this.getCollectionKey(
  //     this.config.usersCollectionName
  //   );
  //   const usersCollectionData = this.importMap.get(usersCollectionKey);

  //   if (!this.config.collections) {
  //     console.log("No collections found in configuration.");
  //     return;
  //   }

  //   let needsUpdate = false;
  //   let numUpdates = 0;

  //   for (const collectionConfig of this.config.collections) {
  //     const collectionKey = this.getCollectionKey(collectionConfig.name);
  //     const collectionData = this.importMap.get(collectionKey);
  //     const collectionImportDefs = collectionConfig.importDefs;
  //     const collectionIdMappings = collectionImportDefs
  //       .map((importDef) => importDef.idMappings)
  //       .flat()
  //       .filter((idMapping) => idMapping !== undefined && idMapping !== null);
  //     if (!collectionData || !collectionData.data) continue;
  //     for (const dataItem of collectionData.data) {
  //       for (const idMapping of collectionIdMappings) {
  //         // We know it's the users collection here
  //         if (this.getCollectionKey(idMapping.targetCollection) === usersCollectionKey) {
  //           const targetFieldKey = idMapping.targetFieldToMatch || idMapping.targetField;
  //           if (targetFieldKey === )
  //           const targetValue = dataItem.finalData[targetFieldKey];
  //           const targetCollectionData = this.importMap.get(this.getCollectionKey(idMapping.targetCollection));
  //           if (!targetCollectionData || !targetCollectionData.data) continue;
  //           const foundData = targetCollectionData.data.filter(({ context }) => {
  //             const targetValue = context[targetFieldKey];
  //             const isMatch = `${targetValue}` === `${valueToMatch}`;
  //             return isMatch && targetValue !== undefined && targetValue !== null;
  //           });
  //         }
  //       }
  //     }
  //   }
  // }

  /**
   * Gets the value to match for a given key in the final data or context.
   * @param finalData - The final data object.
   * @param context - The context object.
   * @param key - The key to get the value for.
   * @returns The value to match for from finalData or Context
   */
  getValueFromData(finalData: any, context: any, key: string) {
    if (
      context[key] !== undefined &&
      context[key] !== null &&
      context[key] !== ""
    ) {
      return context[key];
    }
    return finalData[key];
  }

  updateOldReferencesForNew() {
    if (!this.config.collections) {
      return;
    }

    for (const collectionConfig of this.config.collections) {
      const collectionKey = this.getCollectionKey(collectionConfig.name);
      const collectionData = this.importMap.get(collectionKey);

      if (!collectionData || !collectionData.data) continue;

      console.log(
        `Updating references for collection: ${collectionConfig.name}`
      );

      let needsUpdate = false;

      // Iterate over each data item in the current collection
      for (let i = 0; i < collectionData.data.length; i++) {
        if (collectionConfig.importDefs) {
          for (const importDef of collectionConfig.importDefs) {
            if (importDef.idMappings) {
              for (const idMapping of importDef.idMappings) {
                const targetCollectionKey = this.getCollectionKey(
                  idMapping.targetCollection
                );
                const fieldToSetKey =
                  idMapping.fieldToSet || idMapping.sourceField;
                const targetFieldKey =
                  idMapping.targetFieldToMatch || idMapping.targetField;
                const valueToMatch = this.getValueFromData(
                  collectionData.data[i].finalData,
                  collectionData.data[i].context,
                  idMapping.sourceField
                );

                // Skip if value to match is missing or empty
                if (
                  !valueToMatch ||
                  _.isEmpty(valueToMatch) ||
                  valueToMatch === null
                )
                  continue;

                const isFieldToSetArray = collectionConfig.attributes.find(
                  (attribute) => attribute.key === fieldToSetKey
                )?.array;

                const targetCollectionData =
                  this.importMap.get(targetCollectionKey);
                if (!targetCollectionData || !targetCollectionData.data)
                  continue;

                // Find matching data in the target collection
                const foundData = targetCollectionData.data.filter(
                  ({ context, finalData }) => {
                    const targetValue = this.getValueFromData(
                      finalData,
                      context,
                      targetFieldKey
                    );
                    const isMatch = `${targetValue}` === `${valueToMatch}`;
                    // Ensure the targetValue is defined and not null
                    return (
                      isMatch &&
                      targetValue !== undefined &&
                      targetValue !== null
                    );
                  }
                );
                // Log and skip if no matching data found
                if (!foundData.length) {
                  console.log(
                    `No data found for collection ${collectionConfig.name}:\nTarget collection: ${targetCollectionKey}\nValue to match: ${valueToMatch}\nField to set: ${fieldToSetKey}\nTarget field to match: ${targetFieldKey}\nTarget field value: ${idMapping.targetField}`
                  );
                  logger.info(
                    `No data found for collection: ${targetCollectionKey} with value: ${valueToMatch} for field: ${fieldToSetKey} -- idMapping: ${JSON.stringify(
                      idMapping,
                      null,
                      2
                    )}`
                  );
                  continue;
                }

                needsUpdate = true;

                const getCurrentDataFiltered = (currentData: any) => {
                  if (Array.isArray(currentData.finalData[fieldToSetKey])) {
                    return currentData.finalData[fieldToSetKey].filter(
                      (data: any) => `${data}` !== `${valueToMatch}`
                    );
                  }
                  return currentData.finalData[fieldToSetKey];
                };

                // Get the current data to be updated
                const currentDataFiltered = getCurrentDataFiltered(
                  collectionData.data[i]
                );

                // Extract the new data to set
                const newData = foundData.map((data) => {
                  const valueFound = this.getValueFromData(
                    data.finalData,
                    data.context,
                    idMapping.targetField
                  );
                  return valueFound;
                });

                // Handle cases where current data is an array
                if (isFieldToSetArray) {
                  if (!currentDataFiltered) {
                    // Set new data if current data is undefined
                    collectionData.data[i].finalData[fieldToSetKey] =
                      Array.isArray(newData) ? newData : [newData];
                  } else {
                    if (Array.isArray(currentDataFiltered)) {
                      // Convert current data to array and merge if new data is non-empty array
                      collectionData.data[i].finalData[fieldToSetKey] = [
                        ...new Set(
                          [...currentDataFiltered, ...newData].filter(
                            (value: any) =>
                              `${value}` !== `${valueToMatch}` && value
                          )
                        ),
                      ];
                    } else {
                      // Merge arrays if new data is non-empty array and filter for uniqueness
                      collectionData.data[i].finalData[fieldToSetKey] = [
                        ...new Set(
                          [
                            ...(Array.isArray(currentDataFiltered)
                              ? currentDataFiltered
                              : [currentDataFiltered]),
                            ...newData,
                          ].filter(
                            (value: any) =>
                              `${value}` !== `${valueToMatch}` && value
                          )
                        ),
                      ];
                    }
                  }
                } else {
                  if (!currentDataFiltered) {
                    // Set new data if current data is undefined
                    collectionData.data[i].finalData[fieldToSetKey] =
                      Array.isArray(newData) ? newData[0] : newData;
                  } else if (Array.isArray(newData) && newData.length > 0) {
                    // Convert current data to array and merge if new data is non-empty array, then filter for uniqueness
                    // and take the first value, because it's an array and the attribute is not an array
                    collectionData.data[i].finalData[fieldToSetKey] = [
                      ...new Set(
                        [currentDataFiltered, ...newData].filter(
                          (value: any) =>
                            `${value}` !== `${valueToMatch}` && value
                        )
                      ),
                    ].slice(0, 1)[0];
                  } else if (!Array.isArray(newData) && newData !== undefined) {
                    // Simply update the field if new data is not an array and defined
                    collectionData.data[i].finalData[fieldToSetKey] = newData;
                  }
                }
              }
            }
          }
        }
      }

      // Update the import map if any changes were made
      if (needsUpdate) {
        this.importMap.set(collectionKey, collectionData);
      }
    }
  }

  private writeMapsToJsonFile() {
    const outputDir = path.resolve(process.cwd(), "zlogs");

    // Ensure the logs directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    // Helper function to write data to a file
    const writeToFile = (fileName: string, data: any) => {
      const outputFile = path.join(outputDir, fileName);
      fs.writeFile(outputFile, JSON.stringify(data, null, 2), "utf8", (err) => {
        if (err) {
          console.error(`Error writing data to ${fileName}:`, err);
          return;
        }
        console.log(`Data successfully written to ${fileName}`);
      });
    };

    // Convert Maps to arrays of entries for serialization
    const oldIdToNewIdPerCollectionMap = Array.from(
      this.oldIdToNewIdPerCollectionMap.entries()
    ).map(([key, value]) => {
      return {
        collection: key,
        data: Array.from(value.entries()),
      };
    });

    const mergedUserMap = Array.from(this.mergedUserMap.entries());

    // Write each part to a separate file
    writeToFile(
      "oldIdToNewIdPerCollectionMap.json",
      oldIdToNewIdPerCollectionMap
    );
    writeToFile("mergedUserMap.json", mergedUserMap);

    // Write each collection's data to a separate file
    this.importMap.forEach((value, key) => {
      const data = {
        collection: key,
        data: value.data.map((item: any) => {
          return {
            finalData: item.finalData,
            context: item.context,
          };
        }),
      };
      writeToFile(`${key}.json`, data);
    });
  }

  /**
   * Prepares user data by checking for duplicates based on email or phone, adding to a duplicate map if found,
   * and then returning the transformed item without user-specific keys.
   *
   * @param item - The raw item to be processed.
   * @param attributeMappings - The attribute mappings for the item.
   * @returns The transformed item with user-specific keys removed.
   */
  prepareUserData(
    item: any,
    attributeMappings: AttributeMappings,
    primaryKeyField: string,
    newId: string
  ): {
    transformedItem: any;
    existingId: string | undefined;
    userData: {
      rawData: any;
      finalData: z.infer<typeof AuthUserCreateSchema>;
    };
  } {
    let transformedItem = this.transformData(item, attributeMappings);
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

    // Check for duplicate email and phone
    if (email && this.emailToUserIdMap.has(email)) {
      existingId = this.emailToUserIdMap.get(email);
      if (phone && !this.phoneToUserIdMap.has(phone)) {
        this.phoneToUserIdMap.set(phone, newId);
      }
    } else if (phone && this.phoneToUserIdMap.has(phone)) {
      existingId = this.phoneToUserIdMap.get(phone);
      if (email && !this.emailToUserIdMap.has(email)) {
        this.emailToUserIdMap.set(email, newId);
      }
    } else {
      if (email) this.emailToUserIdMap.set(email, newId);
      if (phone) this.phoneToUserIdMap.set(phone, newId);
    }

    if (existingId) {
      userData.data.userId = existingId;
      const mergedUsers = this.mergedUserMap.get(existingId) || [];
      mergedUsers.push(`${item[primaryKeyField]}`);
      this.mergedUserMap.set(existingId, mergedUsers);
      const userFound = this.importMap
        .get(this.getCollectionKey("users"))
        ?.data.find((userDataExisting) => {
          let userIdToMatch: string | undefined;
          if (userDataExisting?.finalData?.userId) {
            userIdToMatch = userDataExisting?.finalData?.userId;
          } else if (userDataExisting?.finalData?.docId) {
            userIdToMatch = userDataExisting?.finalData?.docId;
          } else if (userDataExisting?.context?.userId) {
            userIdToMatch = userDataExisting.context.userId;
          } else if (userDataExisting?.context?.docId) {
            userIdToMatch = userDataExisting.context.docId;
          }
          return userIdToMatch === existingId;
        });
      if (userFound) {
        userFound.finalData.userId = existingId;
        userFound.finalData.docId = existingId;
        this.userExistsMap.set(existingId, true);
      }

      const userKeys = ["email", "phone", "name", "labels", "prefs"];
      userKeys.forEach((key) => {
        if (transformedItem.hasOwnProperty(key)) {
          delete transformedItem[key];
        }
      });
      return {
        transformedItem,
        existingId,
        userData: {
          rawData: userFound?.rawData,
          finalData: userFound?.finalData,
        },
      };
    } else {
      existingId = newId;
      userData.data.userId = existingId;
    }

    const userKeys = ["email", "phone", "name", "labels", "prefs"];
    userKeys.forEach((key) => {
      if (transformedItem.hasOwnProperty(key)) {
        delete transformedItem[key];
      }
    });

    const usersMap = this.importMap.get(this.getCollectionKey("users"));
    const userDataToAdd = {
      rawData: item,
      finalData: userData.data,
    };
    this.importMap.set(this.getCollectionKey("users"), {
      data: [...(usersMap?.data || []), userDataToAdd],
    });

    return {
      transformedItem,
      existingId,
      userData: userDataToAdd,
    };
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
    collection: CollectionCreate,
    importDef: ImportDef
  ): Promise<void> {
    // Load the raw data based on the import definition
    const rawData = this.loadData(importDef);
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
      let { transformedItem, existingId, userData } = this.prepareUserData(
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
        transformedItem.docId = existingId; // Assign the new ID to the transformed data's docId field
      }

      // Create a context object for the item, including the new ID
      let context = this.createContext(db, collection, item, existingId);

      // Merge the transformed data into the context
      context = { ...context, ...transformedItem, ...userData.finalData };

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
              transformedItem = this.mergeObjects(
                data.finalData,
                transformedItem
              );
            }
          }
        } else {
          // No duplicate found, simply map the oldId to the new itemId
          collectionOldIdToNewIdMap?.set(`${oldId}`, `${existingId}`);
        }
      }

      // Handle merging for currentUserData
      for (let i = 0; i < currentUserData.data.length; i++) {
        const currentUserDataItem = currentUserData.data[i];
        const samePhones =
          currentUserDataItem.finalData.phone &&
          transformedItem.phone &&
          currentUserDataItem.finalData.phone === transformedItem.phone;
        const sameEmails =
          currentUserDataItem.finalData.email &&
          transformedItem.email &&
          currentUserDataItem.finalData.email === transformedItem.email;
        if (
          (currentUserDataItem.finalData.docId === existingId ||
            currentUserDataItem.finalData.userId === existingId) &&
          (samePhones || sameEmails) &&
          currentUserDataItem.finalData &&
          userData.finalData
        ) {
          const userDataMerged = this.mergeObjects(
            currentUserData.data[i].finalData,
            userData.finalData
          );
          currentUserData.data[i].finalData = userDataMerged;
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
          currentData.data[i].finalData = this.mergeObjects(
            currentData.data[i].finalData,
            transformedItem
          );
          currentData.data[i].context = {
            ...currentData.data[i].context,
            ...context,
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
    collection: CollectionCreate,
    importDef: ImportDef
  ): Promise<void> {
    // Load the raw data based on the import definition
    const rawData = this.loadData(importDef);
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
    const isRegions = collection.name.toLowerCase() === "regions";
    // Iterate through each item in the raw data
    for (const item of rawData) {
      // Generate a new unique ID for the item
      const itemIdNew = this.getTrueUniqueId(
        this.getCollectionKey(collection.name)
      );
      if (isRegions) {
        logger.info(`Creating region: ${JSON.stringify(item, null, 2)}`);
      }
      // Retrieve the current collection data from the import map
      const currentData = this.importMap.get(
        this.getCollectionKey(collection.name)
      );
      // Create a context object for the item, including the new ID
      let context = this.createContext(db, collection, item, itemIdNew);
      // Transform the item data based on the attribute mappings
      const transformedData = this.transformData(
        item,
        importDef.attributeMappings
      );
      if (collection.name.toLowerCase() === "councils") {
        console.log("Transformed Council: ", transformedData);
      }
      if (isRegions) {
        logger.info(
          `Transformed region: ${JSON.stringify(transformedData, null, 2)}`
        );
      }
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
      const isValid = this.importDataActions.validateItem(
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
    collection: CollectionCreate,
    importDef: ImportDef
  ) {
    const currentData = this.importMap.get(
      this.getCollectionKey(collection.name)
    );
    const oldIdToNewIdMap = this.oldIdToNewIdPerCollectionMap.get(
      this.getCollectionKey(collection.name)
    );

    if (
      !(currentData?.data && currentData?.data.length > 0) &&
      !oldIdToNewIdMap
    ) {
      logger.error(
        `No data found for collection ${collection.name} for updateDef but it says it's supposed to have one...`
      );
      return;
    }

    const rawData = this.loadData(importDef);
    const operationId = this.collectionImportOperations.get(
      this.getCollectionKey(collection.name)
    );
    if (!operationId) {
      throw new Error(
        `No import operation found for collection ${collection.name}`
      );
    }

    for (const item of rawData) {
      let transformedData = this.transformData(
        item,
        importDef.attributeMappings
      );
      let newId: string | undefined;
      let oldId: string | undefined;
      let itemDataToUpdate: CollectionImportData["data"][number] | undefined;

      // Try to find itemDataToUpdate using updateMapping
      if (importDef.updateMapping) {
        oldId =
          item[importDef.updateMapping.originalIdField] ||
          transformedData[importDef.updateMapping.originalIdField];
        if (oldId) {
          itemDataToUpdate = currentData?.data.find(
            ({ context, rawData, finalData }) => {
              const targetField =
                importDef.updateMapping!.targetField ??
                importDef.updateMapping!.originalIdField;

              return (
                `${context[targetField]}` === `${oldId}` ||
                `${rawData[targetField]}` === `${oldId}` ||
                `${finalData[targetField]}` === `${oldId}`
              );
            }
          );

          if (itemDataToUpdate) {
            newId =
              itemDataToUpdate.finalData.docId ||
              itemDataToUpdate.context.docId;
          }
        }
      }

      // If updateMapping is not defined or did not find the item, use primaryKeyField
      if (!itemDataToUpdate && importDef.primaryKeyField) {
        oldId =
          item[importDef.primaryKeyField] ||
          transformedData[importDef.primaryKeyField];
        if (oldId && oldId.length > 0) {
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
        }

        if (oldId && !itemDataToUpdate) {
          itemDataToUpdate = currentData?.data.find(
            (data) =>
              `${data.context[importDef.primaryKeyField]}` === `${oldId}`
          );
        }
      }

      if (!oldId) {
        logger.error(
          `No old ID found (to update another document with) in prepareUpdateData for ${
            collection.name
          }, ${JSON.stringify(item, null, 2)}`
        );
        continue;
      }

      if (!newId && !itemDataToUpdate) {
        logger.error(
          `No new id && no data found for collection ${
            collection.name
          } for updateDef ${JSON.stringify(
            item,
            null,
            2
          )} but it says it's supposed to have one...`
        );
        continue;
      } else if (itemDataToUpdate) {
        newId =
          itemDataToUpdate.finalData.docId || itemDataToUpdate.context.docId;
        if (!newId) {
          logger.error(
            `No new id found for collection ${
              collection.name
            } for updateDef ${JSON.stringify(
              item,
              null,
              2
            )} but has itemDataToUpdate ${JSON.stringify(
              itemDataToUpdate,
              null,
              2
            )} but it says it's supposed to have one...`
          );
          continue;
        }
      }

      if (!itemDataToUpdate || !newId) {
        logger.error(
          `No data or ID (docId) found for collection ${
            collection.name
          } for updateDef ${JSON.stringify(
            item,
            null,
            2
          )} but it says it's supposed to have one...`
        );
        continue;
      }

      transformedData = this.mergeObjects(
        itemDataToUpdate.finalData,
        transformedData
      );

      // Create a context object for the item, including the new ID and transformed data
      let context = this.createContext(db, collection, item, newId);
      context = this.mergeObjects(context, transformedData);

      // Validate the item before proceeding
      const isValid = await this.importDataActions.validateItem(
        item,
        importDef.attributeMappings,
        context
      );

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

      if (itemDataToUpdate) {
        itemDataToUpdate.finalData = this.mergeObjects(
          itemDataToUpdate.finalData,
          transformedData
        );
        itemDataToUpdate.context = context;
        itemDataToUpdate.importDef = newImportDef;
      } else {
        currentData!.data.push({
          rawData: item,
          context: context,
          importDef: newImportDef,
          finalData: transformedData,
        });
      }

      // Since we're modifying currentData in place, we ensure no duplicates are added
      this.importMap.set(this.getCollectionKey(collection.name), currentData!);
    }
  }

  private updateReferencesBasedOnAttributeMappings() {
    if (!this.config.collections) {
      return;
    }
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
