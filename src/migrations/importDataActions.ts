import {
  ID,
  InputFile,
  Query,
  type Databases,
  type Storage,
} from "node-appwrite";
import type { AppwriteConfig } from "./schema";
import validationRules from "./validationRules";
import { converterFunctions, convertObjectBySchema } from "./converters";
import { afterImportActions } from "./afterImportActions";

type AttributeMappings =
  AppwriteConfig["collections"][number]["importDefs"][number]["attributeMappings"];

export class ImportDataActions {
  private db: Databases;
  private storage: Storage;
  private config: AppwriteConfig;

  constructor(db: Databases, storage: Storage, config: AppwriteConfig) {
    this.db = db;
    this.storage = storage;
    this.config = config;
  }

  async runConverterFunctions(item: any, attributeMappings: AttributeMappings) {
    const conversionSchema = attributeMappings.reduce((schema, mapping) => {
      schema[mapping.targetKey] = (originalValue: any) => {
        return mapping.converters.reduce((value, converterName) => {
          const converterFunction =
            converterFunctions[
              converterName as keyof typeof converterFunctions
            ];
          if (converterFunction) {
            return converterFunction(value);
          } else {
            console.warn(
              `Converter function '${converterName}' is not defined.`
            );
            return value;
          }
        }, originalValue);
      };
      return schema;
    }, {} as Record<string, (value: any) => any>);

    // Convert the item using the constructed schema
    const convertedItem = convertObjectBySchema(item, conversionSchema);
    // Merge the converted item back into the original item object
    Object.assign(item, convertedItem);
    return item;
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
    for (const mapping of attributeMap) {
      const { validationActions } = mapping;
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

  async executeAfterImportActions(
    item: any,
    attributeMap: AttributeMappings,
    context: { [key: string]: any }
  ): Promise<void> {
    for (const mapping of attributeMap) {
      console.log(
        `Processing post-import actions for attribute: ${mapping.targetKey}`
      );
      const { postImportActions } = mapping;
      if (!postImportActions || !Array.isArray(postImportActions)) {
        console.warn(
          `No post-import actions defined for attribute: ${mapping.targetKey}`,
          postImportActions
        );
        continue; // Skip to the next attribute if no actions are defined
      }
      for (const actionDef of postImportActions) {
        const { action, params } = actionDef;
        console.log(
          `Executing post-import action '${action}' for attribute '${
            mapping.targetKey
          }' with params ${params.join(", ")}...`
        );
        try {
          await this.executeAction(action, params, context, item);
        } catch (error) {
          console.error(
            `Failed to execute post-import action '${action}' for attribute '${mapping.targetKey}':`,
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
    const actionMethod =
      afterImportActions[actionName as keyof typeof afterImportActions];
    console.log(
      `Executing after-import action '${actionName}' with params ${params.join(
        ", "
      )}...`
    );
    if (typeof actionMethod === "function") {
      try {
        // Resolve string templates in params
        const resolvedParams = params.map((param) =>
          this.resolveTemplate(param, context, item)
        );
        console.log(
          `Resolved parameters for action '${actionName}': ${resolvedParams.join(
            ", "
          )}`
        );
        // Execute the action with resolved parameters
        // Use 'any' type assertion to bypass TypeScript's strict type checking
        await (actionMethod as any)(this.config, ...resolvedParams);
        console.log(`Action '${actionName}' executed successfully.`);
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
}
