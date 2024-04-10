import {
  ID,
  InputFile,
  Query,
  type Databases,
  type Storage,
} from "node-appwrite";
import type { AppwriteConfig } from "./schema.js";
import validationRules, { type ValidationRules } from "./validationRules.js";
import {
  converterFunctions,
  convertObjectBySchema,
  type ConverterFunctions,
} from "./converters.js";
import {
  afterImportActions,
  type AfterImportActions,
} from "./afterImportActions.js";

type AttributeMappings =
  AppwriteConfig["collections"][number]["importDefs"][number]["attributeMappings"];

export class ImportDataActions {
  private db: Databases;
  private storage: Storage;
  private config: AppwriteConfig;
  private converterDefinitions: ConverterFunctions;
  private validityRuleDefinitions: ValidationRules;
  private afterImportActionsDefinitions: AfterImportActions;

  constructor(
    db: Databases,
    storage: Storage,
    config: AppwriteConfig,
    converterDefinitions: ConverterFunctions,
    validityRuleDefinitions: ValidationRules,
    afterImportActionsDefinitions: AfterImportActions
  ) {
    this.db = db;
    this.storage = storage;
    this.config = config;
    this.converterDefinitions = converterDefinitions;
    this.validityRuleDefinitions = validityRuleDefinitions;
    this.afterImportActionsDefinitions = afterImportActionsDefinitions;
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
    params: any[], // Accepts any type, including objects
    context: { [key: string]: any },
    item: any
  ): Promise<void> {
    const actionMethod =
      afterImportActions[actionName as keyof typeof afterImportActions];
    if (typeof actionMethod === "function") {
      try {
        // Resolve parameters, handling both strings and objects
        const resolvedParams = params.map((param) => {
          // Directly resolve each param, whether it's an object or a string
          return this.resolveTemplate(param, context, item);
        });

        // Execute the action with resolved parameters
        // Parameters are passed as-is, with objects treated as single parameters
        console.log(
          `Executing action '${actionName}' with params:`,
          resolvedParams
        );
        await (actionMethod as any)(this.config, ...resolvedParams);
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
   * Resolves a templated string or object using the provided context and current data item.
   * If the template is a string that starts and ends with "{}", it replaces it with the corresponding value from item or context.
   * If the template is an object, it recursively resolves its properties.
   * @param template The templated string or object.
   * @param context The context for resolving the template.
   * @param item The current data item being processed.
   */
  private resolveTemplate(
    template: any,
    context: { [key: string]: any },
    item: any
  ): any {
    if (typeof template === "string") {
      // Check if the template string contains placeholders
      const regex = /\{([^}]+)\}/g; // Matches anything like {something}
      let match;
      let resolvedString = template;
      while ((match = regex.exec(template)) !== null) {
        // Extract the key from the matched placeholder
        const key = match[1];
        // Replace the placeholder with the value from item or context
        const value = item[key] ?? context[key] ?? match[0]; // Use the original placeholder if no value is found
        resolvedString = resolvedString.replace(match[0], value);
      }
      return resolvedString;
    } else if (typeof template === "object" && template !== null) {
      // Enhanced logic for handling object templates
      const resolvedObject: any = Array.isArray(template) ? [] : {};
      for (const key in template) {
        // Resolve placeholders in object keys
        const resolvedKey = this.resolveTemplate(key, context, item);
        // Resolve placeholders in object values
        resolvedObject[resolvedKey] = this.resolveTemplate(
          template[key],
          context,
          item
        );
      }
      return resolvedObject;
    }
    // Return the template as is if it's not a string or object
    return template;
  }
}
