import type {
  AttributeMappings,
  ImportDef,
  ConfigDatabase,
  CollectionCreate,
} from "appwrite-utils";
import type { ImportDataActions } from "../importDataActions.js";
import { convertObjectByAttributeMappings } from "appwrite-utils-helpers";
import { logger } from 'appwrite-utils-helpers';

/**
 * Service responsible for data transformation during import.
 * Extracted from DataLoader to provide focused, testable transformation logic.
 */
export class DataTransformationService {
  private importDataActions: ImportDataActions;

  constructor(importDataActions: ImportDataActions) {
    this.importDataActions = importDataActions;
  }

  /**
   * Transforms the given item based on the provided attribute mappings.
   * This method applies conversion rules to the item's attributes as defined in the attribute mappings.
   * 
   * Preserves existing transformation logic from DataLoader.
   *
   * @param item - The item to be transformed.
   * @param attributeMappings - The mappings that define how each attribute should be transformed.
   * @returns The transformed item.
   */
  transformData(item: any, attributeMappings: AttributeMappings): any {
    try {
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
    } catch (error) {
      logger.error(`Error transforming data for item: ${JSON.stringify(item, null, 2)}`, error);
      throw error;
    }
  }

  /**
   * Creates a context object for data transformation.
   * Preserves existing context creation logic from DataLoader.
   *
   * @param db - The database configuration
   * @param collection - The collection configuration
   * @param item - The raw item data
   * @param docId - The document ID
   * @returns Context object for transformation
   */
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
      createdDoc: {}, // Initially empty, to be updated when the document is created
    };
  }

  /**
   * Merges two objects by updating the source object with the target object's values.
   * Preserves existing merge logic from DataLoader.
   * 
   * It iterates through the target object's keys and updates the source object if:
   * - The source object has the key.
   * - The target object's value for that key is not null, undefined, or an empty string.
   * - If the target object has an array value, it concatenates the values and removes duplicates.
   *
   * @param source - The source object to be updated.
   * @param update - The target object with values to update the source object.
   * @returns The updated source object.
   */
  mergeObjects(source: any, update: any): any {
    // Create a new object to hold the merged result
    const result = { ...source };

    // Loop through the keys of the object we care about
    for (const [key, value] of Object.entries(source)) {
      // Check if the key exists in the target object
      if (!Object.hasOwn(update, key)) {
        // If the key doesn't exist, we can just skip it
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

  /**
   * Validates the transformed data item using existing validation logic.
   * 
   * @param transformedData - The transformed data to validate
   * @param attributeMappings - The attribute mappings containing validation rules
   * @param context - The context for validation
   * @returns True if valid, false otherwise
   */
  validateTransformedData(
    transformedData: any,
    attributeMappings: AttributeMappings,
    context: any
  ): boolean {
    try {
      return this.importDataActions.validateItem(
        transformedData,
        attributeMappings,
        context
      );
    } catch (error) {
      logger.error(`Validation error for transformed data: ${JSON.stringify(transformedData, null, 2)}`, error);
      return false;
    }
  }
}