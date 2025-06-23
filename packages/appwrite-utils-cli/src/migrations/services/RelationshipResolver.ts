import type {
  AttributeMappings,
  IdMappings,
  AppwriteConfig,
  CollectionCreate,
} from "appwrite-utils";
import { logger } from "../../shared/logging.js";
import { isEmpty } from "es-toolkit/compat";
import type { UserMappingService } from "./UserMappingService.js";

export interface CollectionImportData {
  collection?: CollectionCreate;
  data: Array<{
    rawData: any;
    finalData: any;
    context: any;
    importDef?: any;
  }>;
}

/**
 * Service responsible for resolving relationships and ID mappings during import.
 * Preserves all existing relationship resolution logic from DataLoader.
 * Extracted to provide focused, testable relationship management.
 */
export class RelationshipResolver {
  private config: AppwriteConfig;
  private userMappingService: UserMappingService;
  
  // Map to track old to new ID mappings for each collection
  private oldIdToNewIdPerCollectionMap = new Map<string, Map<string, string>>();

  constructor(config: AppwriteConfig, userMappingService: UserMappingService) {
    this.config = config;
    this.userMappingService = userMappingService;
  }

  /**
   * Helper method to generate a consistent key for collections.
   * Preserves existing logic from DataLoader.
   */
  getCollectionKey(name: string): string {
    return name.toLowerCase().replace(" ", "");
  }

  /**
   * Stores ID mapping for a collection.
   * 
   * @param collectionName - The collection name
   * @param oldId - The old ID
   * @param newId - The new ID
   */
  setIdMapping(collectionName: string, oldId: string, newId: string): void {
    const collectionKey = this.getCollectionKey(collectionName);
    
    if (!this.oldIdToNewIdPerCollectionMap.has(collectionKey)) {
      this.oldIdToNewIdPerCollectionMap.set(collectionKey, new Map());
    }
    
    const collectionMap = this.oldIdToNewIdPerCollectionMap.get(collectionKey)!;
    collectionMap.set(`${oldId}`, `${newId}`);
  }

  /**
   * Gets the new ID for an old ID in a specific collection.
   * 
   * @param collectionName - The collection name
   * @param oldId - The old ID to look up
   * @returns The new ID if found, otherwise undefined
   */
  getNewIdForOldId(collectionName: string, oldId: string): string | undefined {
    const collectionKey = this.getCollectionKey(collectionName);
    return this.oldIdToNewIdPerCollectionMap.get(collectionKey)?.get(`${oldId}`);
  }

  /**
   * Checks if an ID mapping exists for a collection.
   * 
   * @param collectionName - The collection name
   * @param oldId - The old ID to check
   * @returns True if mapping exists
   */
  hasIdMapping(collectionName: string, oldId: string): boolean {
    const collectionKey = this.getCollectionKey(collectionName);
    return this.oldIdToNewIdPerCollectionMap.get(collectionKey)?.has(`${oldId}`) || false;
  }

  /**
   * Gets the value to match for a given key in the final data or context.
   * Preserves existing logic from DataLoader.
   * 
   * @param finalData - The final data object
   * @param context - The context object
   * @param key - The key to get the value for
   * @returns The value to match for from finalData or Context
   */
  private getValueFromData(finalData: any, context: any, key: string): any {
    if (
      context[key] !== undefined &&
      context[key] !== null &&
      context[key] !== ""
    ) {
      return context[key];
    }
    return finalData[key];
  }

  /**
   * Updates old references with new IDs based on ID mappings.
   * Preserves existing reference update logic from DataLoader.
   * 
   * @param importMap - Map of collection data by collection key
   * @param collections - Array of collection configurations
   */
  updateOldReferencesForNew(
    importMap: Map<string, CollectionImportData>,
    collections: CollectionCreate[]
  ): void {
    if (!collections) {
      return;
    }

    for (const collectionConfig of collections) {
      const collectionKey = this.getCollectionKey(collectionConfig.name);
      const collectionData = importMap.get(collectionKey);

      if (!collectionData || !collectionData.data) continue;

      logger.info(`Updating references for collection: ${collectionConfig.name}`);

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
                const sourceValue = this.getValueFromData(
                  collectionData.data[i].finalData,
                  collectionData.data[i].context,
                  idMapping.sourceField
                );

                // Skip if value to match is missing or empty
                if (
                  !sourceValue ||
                  isEmpty(sourceValue) ||
                  sourceValue === null
                )
                  continue;

                const isFieldToSetArray = collectionConfig.attributes?.find(
                  (attribute) => attribute.key === fieldToSetKey
                )?.array;

                const targetCollectionData = importMap.get(targetCollectionKey);
                if (!targetCollectionData || !targetCollectionData.data)
                  continue;

                // Handle cases where sourceValue is an array
                const sourceValues = Array.isArray(sourceValue)
                  ? sourceValue.map((sourceValue) => `${sourceValue}`)
                  : [`${sourceValue}`];
                let newData = [];

                for (const valueToMatch of sourceValues) {
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

                  if (foundData.length) {
                    newData.push(
                      ...foundData.map((data) => {
                        const newValue = this.getValueFromData(
                          data.finalData,
                          data.context,
                          idMapping.targetField
                        );
                        return newValue;
                      })
                    );
                  } else {
                    logger.info(
                      `No data found for collection: ${targetCollectionKey} with value: ${valueToMatch} for field: ${fieldToSetKey} -- idMapping: ${JSON.stringify(
                        idMapping,
                        null,
                        2
                      )}`
                    );
                  }
                  continue;
                }

                const getCurrentDataFiltered = (currentData: any) => {
                  if (Array.isArray(currentData.finalData[fieldToSetKey])) {
                    return currentData.finalData[fieldToSetKey].filter(
                      (data: any) => !sourceValues.includes(`${data}`)
                    );
                  }
                  return currentData.finalData[fieldToSetKey];
                };

                // Get the current data to be updated
                const currentDataFiltered = getCurrentDataFiltered(
                  collectionData.data[i]
                );

                if (newData.length) {
                  needsUpdate = true;

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
                                value !== null &&
                                value !== undefined &&
                                value !== ""
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
                                value !== null &&
                                value !== undefined &&
                                value !== "" &&
                                !sourceValues.includes(`${value}`)
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
                              value !== null &&
                              value !== undefined &&
                              value !== "" &&
                              !sourceValues.includes(`${value}`)
                          )
                        ),
                      ].slice(0, 1)[0];
                    } else if (
                      !Array.isArray(newData) &&
                      newData !== undefined
                    ) {
                      // Simply update the field if new data is not an array and defined
                      collectionData.data[i].finalData[fieldToSetKey] = newData;
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Update the import map if any changes were made
      if (needsUpdate) {
        importMap.set(collectionKey, collectionData);
      }
    }
  }

  /**
   * Resolves relationship references using the merged user map.
   * Handles cases where users have been merged during deduplication.
   * 
   * @param oldId - The old user ID to resolve
   * @param targetCollection - The target collection name
   * @returns The resolved ID (new user ID if merged, otherwise mapped ID)
   */
  private getMergedId(oldId: string, targetCollection: string): string {
    // Check if this is a user collection and if the ID was merged
    if (this.userMappingService.isUsersCollection(targetCollection)) {
      const mergedId = this.userMappingService.findNewUserIdForOldId(oldId);
      if (mergedId !== oldId) {
        return mergedId;
      }
    }

    // Retrieve the old to new ID map for the related collection
    const oldToNewIdMap = this.oldIdToNewIdPerCollectionMap.get(
      this.getCollectionKey(targetCollection)
    );

    // If there's a mapping for the old ID, return the new ID
    if (oldToNewIdMap && oldToNewIdMap.has(`${oldId}`)) {
      return oldToNewIdMap.get(`${oldId}`)!;
    }

    // If no mapping is found, return the old ID as a fallback
    return oldId;
  }

  /**
   * Validates relationship integrity before import.
   * Checks that all referenced collections and fields exist.
   * 
   * @param collections - Array of collections to validate
   * @returns Array of validation errors
   */
  validateRelationships(collections: CollectionCreate[]): string[] {
    const errors: string[] = [];
    const collectionNames = new Set(collections.map(c => c.name));

    for (const collection of collections) {
      if (!collection.importDefs) continue;

      for (const importDef of collection.importDefs) {
        if (!importDef.idMappings) continue;

        for (const idMapping of importDef.idMappings) {
          // Check if target collection exists
          if (!collectionNames.has(idMapping.targetCollection)) {
            errors.push(
              `Collection '${collection.name}' references non-existent target collection '${idMapping.targetCollection}'`
            );
          }

          // Check if source field exists in source collection attributes
          const sourceFieldExists = collection.attributes?.some(
            attr => attr.key === (idMapping.fieldToSet || idMapping.sourceField)
          );
          if (!sourceFieldExists) {
            errors.push(
              `Collection '${collection.name}' ID mapping references non-existent source field '${idMapping.fieldToSet || idMapping.sourceField}'`
            );
          }

          // Find target collection and check if target field exists
          const targetCollection = collections.find(c => c.name === idMapping.targetCollection);
          if (targetCollection) {
            const targetFieldExists = targetCollection.attributes?.some(
              attr => attr.key === idMapping.targetField
            );
            if (!targetFieldExists) {
              errors.push(
                `Collection '${collection.name}' ID mapping references non-existent target field '${idMapping.targetField}' in collection '${idMapping.targetCollection}'`
              );
            }
          }
        }
      }
    }

    return errors;
  }

  /**
   * Gets relationship statistics for reporting.
   * 
   * @returns Statistics about relationships and ID mappings
   */
  getStatistics(): {
    totalCollections: number;
    totalIdMappings: number;
    collectionsWithMappings: string[];
  } {
    const collectionsWithMappings: string[] = [];
    let totalIdMappings = 0;

    for (const [collectionKey, mappings] of this.oldIdToNewIdPerCollectionMap.entries()) {
      collectionsWithMappings.push(collectionKey);
      totalIdMappings += mappings.size;
    }

    return {
      totalCollections: this.oldIdToNewIdPerCollectionMap.size,
      totalIdMappings,
      collectionsWithMappings,
    };
  }

  /**
   * Clears all ID mappings (useful for testing or resetting state).
   */
  clearAllMappings(): void {
    this.oldIdToNewIdPerCollectionMap.clear();
  }

  /**
   * Exports ID mappings for debugging or external use.
   * 
   * @returns Serializable object containing all ID mappings
   */
  exportMappings(): { [collectionKey: string]: { [oldId: string]: string } } {
    const exported: { [collectionKey: string]: { [oldId: string]: string } } = {};

    for (const [collectionKey, mappings] of this.oldIdToNewIdPerCollectionMap.entries()) {
      exported[collectionKey] = Object.fromEntries(mappings.entries());
    }

    return exported;
  }

  /**
   * Imports ID mappings from an external source.
   * 
   * @param mappings - The mappings to import
   */
  importMappings(mappings: { [collectionKey: string]: { [oldId: string]: string } }): void {
    this.oldIdToNewIdPerCollectionMap.clear();

    for (const [collectionKey, collectionMappings] of Object.entries(mappings)) {
      const mappingMap = new Map<string, string>();
      for (const [oldId, newId] of Object.entries(collectionMappings)) {
        mappingMap.set(oldId, newId);
      }
      this.oldIdToNewIdPerCollectionMap.set(collectionKey, mappingMap);
    }
  }
}