import {
  ID,
  InputFile,
  Query,
  type Databases,
  type Storage,
} from "node-appwrite";
import type { AppwriteConfig } from "./schema";
import validationRules from "./validationRules";
import {
  anyToString,
  anyToNumber,
  anyToBoolean,
  anyToAnyArray,
  safeParseDate,
  deepAnyToString,
  deepConvert,
  convertObjectBySchema,
  immutableConvert,
  validateString,
} from "./converters";

type AttributeMappings =
  AppwriteConfig["collections"][number]["importDefs"][number]["attributeMappings"];

export class ImportDataActions {
  private db: Databases;
  private storage: Storage;
  private config: AppwriteConfig;
  converterFunctions: {
    [key: string]: (
      value: any,
      context?: { [key: string]: any }
    ) => any | any[];
  } = {
    anyToString,
    anyToNumber,
    anyToBoolean,
    deepAnyToString,
    safeParseDate,
  };
  constructor(db: Databases, storage: Storage, config: AppwriteConfig) {
    this.db = db;
    this.storage = storage;
    this.config = config;
  }

  async runConverterFunctions(
    dataItems: any[], // Consider typing this more specifically if possible
    attributeMappings: AttributeMappings,
    context: { [key: string]: any }
  ) {
    dataItems.forEach((item) => {
      const conversionSchema = Object.entries(attributeMappings).reduce(
        (schema, [key, { oldKey, targetKey, converters }]) => {
          schema[targetKey] = (originalValue: any) => {
            return converters.reduce((value, converterName) => {
              const converterFunction = this.converterFunctions[converterName];
              if (converterFunction) {
                return converterFunction(value, context);
              } else {
                console.warn(
                  `Converter function '${converterName}' is not defined.`
                );
                return value;
              }
            }, item[oldKey]);
          };
          return schema;
        },
        {} as Record<string, (value: any) => any>
      );

      const convertedItem = convertObjectBySchema(item, conversionSchema);
      Object.assign(item, convertedItem);
    });
  }

  /**
   * Validates a single data item based on defined validation rules.
   * @param item The data item to validate.
   * @param context The context for resolving templated parameters in validation rules.
   * @returns A promise that resolves to true if the item is valid, false otherwise.
   */
  async validateItem(
    item: any,
    attributeMap: AttributeMappings,
    context: { [key: string]: any }
  ): Promise<boolean> {
    for (const [key, value] of Object.entries(attributeMap)) {
      const { validationActions } = value;
      if (
        !validationActions ||
        !Array.isArray(validationActions) ||
        !validationActions.length
      ) {
        console.warn(
          "No validation actions defined for the item, assuming true"
        );
        return true; // Assume items without validation actions as valid.
      }
      for (const ruleDef of validationActions) {
        const { action, params } = ruleDef;
        const validationRule = validationRules[action];

        if (!validationRule) {
          console.warn(`Validation rule '${action}' is not defined.`);
          continue; // Optionally, consider undefined rules as a validation failure.
        }

        // Resolve templated parameters
        const resolvedParams = params.map((param: any) =>
          this.resolveTemplate(param, context, item)
        );

        // Apply the validation rule
        const isValid = validationRule(item, ...resolvedParams);
        if (!isValid) {
          console.error(
            `Validation failed for rule '${action}' with params ${params.join(
              ", "
            )}`
          );
          return false; // Stop validation on first failure
        }
      }
    }

    return true; // The item passed all validations
  }

  /**
   * Resolves a templated string using the provided context and current data item.
   * @param template The templated string.
   * @param context The context for resolving the template.
   * @param item The current data item being processed.
   */
  private resolveTemplate(
    template: string,
    context: { [key: string]: any },
    item: any
  ): any {
    if (template.startsWith("{") && template.endsWith("}")) {
      const key = template.slice(1, -1);
      return item[key] ?? context[key] ?? template; // Fallback to template if neither item nor context has the key
    }
    return template;
  }

  async executeAfterImportActions(
    item: any,
    attributeMap: AttributeMappings,
    context: { [key: string]: any }
  ): Promise<void> {
    for (const [key, value] of Object.entries(attributeMap)) {
      const { postImportActions } = value;
      if (!postImportActions || !Array.isArray(postImportActions)) {
        console.warn(`No post-import actions defined for attribute: ${key}`);
        continue; // Skip to the next attribute if no actions are defined
      }
      for (const actionDef of postImportActions) {
        const { action, params } = actionDef;
        try {
          await this.executeAction(action, params, context, item);
        } catch (error) {
          console.error(
            `Failed to execute post-import action '${action}' for attribute '${key}':`,
            error
          );
          throw error; // Rethrow the error to stop the import process
        }
      }
    }
  }

  async executeAction(
    actionName: string,
    params: string[],
    context: { [key: string]: any },
    item: any
  ): Promise<void> {
    const resolvedParams = params.map((param) =>
      this.resolveTemplate(param, context, item)
    );

    const actionMethod = (this as any)[actionName];
    if (typeof actionMethod === "function") {
      try {
        await actionMethod.apply(this, [...resolvedParams, item]);
      } catch (error: any) {
        console.error(`Error executing action '${actionName}':`, error);
        throw new Error(
          `Execution failed for action '${actionName}': ${error.message}`
        );
      }
    } else {
      console.warn(`Action '${actionName}' is not defined.`);
      throw new Error(`Action '${actionName}' is not defined.`);
    }
  }

  /**
   * Update a document in the database with new data (a dict or anything) after import has been completed
   * @param dbId The ID of the database
   * @param collId The ID of the collection
   * @param docId The ID of the document
   * @param data The data to update
   */
  async updateCreatedDocument(
    dbId: string,
    collId: string,
    docId: string,
    data: any
  ) {
    try {
      await this.db.updateDocument(dbId, collId, docId, data);
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  }

  /**
   * Update a document's field in the database with new data after import has been completed
   * @param dbId The ID of the database
   * @param collId The ID of the collection
   * @param docId The ID of the document
   * @param fieldName The name of the field to update
   * @param oldFieldValue The old value of the field
   * @param newFieldValue The new value of the field
   */
  async checkAndUpdateFieldInDocument(
    dbId: string,
    collId: string,
    docId: string,
    fieldName: string,
    oldFieldValue: any,
    newFieldValue: any
  ) {
    try {
      const doc = await this.db.getDocument(dbId, collId, docId);
      if (doc[fieldName as keyof typeof doc] == oldFieldValue) {
        await this.db.updateDocument(dbId, collId, docId, {
          [fieldName]: newFieldValue,
        });
      }
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  }

  /**
   * Create a bucket or get it if it already exists
   * @param bucketName The name of the bucket
   * @param bucketId The ID of the bucket
   * @param permisions The permissions of the bucket
   * @param fileSecurity The file security of the bucket
   * @param enabled The enabled status of the bucket
   * @param maxFileSize The maximum file size of the bucket
   * @param allowedExtensions The allowed extensions of the bucket
   * @param compression The compression of the bucket
   * @param encryption The encryption of the bucket
   * @param antivirus The antivirus of the bucket
   */
  async createOrGetBucket(
    bucketName: string,
    bucketId?: string,
    permisions?: string[],
    fileSecurity?: boolean,
    enabled?: boolean,
    maxFileSize?: number,
    allowedExtensions?: string[],
    compression?: string,
    encryption?: boolean,
    antivirus?: boolean
  ) {
    try {
      const bucket = await this.storage.listBuckets([
        Query.equal("name", bucketName),
      ]);
      if (bucket.buckets.length > 0) {
        return bucket.buckets[0];
      } else if (bucketId) {
        try {
          return await this.storage.getBucket(bucketId);
        } catch (error) {
          // This means that the ID was the wanted ID, but the bucket was not found
          return await this.storage.createBucket(
            bucketId,
            bucketName,
            permisions,
            fileSecurity,
            enabled,
            maxFileSize,
            allowedExtensions,
            compression,
            encryption,
            antivirus
          );
        }
      } else {
        return await this.storage.createBucket(
          bucketId || ID.unique(),
          bucketName,
          permisions,
          fileSecurity,
          enabled,
          maxFileSize,
          allowedExtensions,
          compression,
          encryption,
          antivirus
        );
      }
    } catch (error) {
      console.error("Error creating bucket: ", error);
    }
  }

  /**
   * Create a file and update a document's field with the file's ID, for use with for instance
   * uploading a file to a storage bucket and then updating the document with the file's ID
   * @param dbId The ID of the database
   * @param collId The ID of the collection
   * @param docId The ID of the document
   * @param fieldName The name of the field to update
   * @param bucketId The ID of the bucket
   * @param filePath The path of the file
   */
  async createFileAndUpdateField(
    dbId: string,
    collId: string,
    docId: string,
    fieldName: string,
    bucketId: string,
    filePath: string,
    fileName: string
  ) {
    try {
      const inputFile = InputFile.fromPath(filePath, fileName);
      const file = await this.storage.createFile(
        bucketId,
        ID.unique(),
        inputFile
      );
      await this.db.updateDocument(dbId, collId, docId, {
        [fieldName]: file.$id,
      });
    } catch (error) {
      console.error("Error creating file: ", error);
    }
  }
}
