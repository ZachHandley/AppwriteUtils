import { type Databases, type Storage } from "node-appwrite";
import type { AppwriteConfig } from "appwrite-utils";
import {
  validationRules,
  type ValidationRules,
  type AttributeMappings,
} from "appwrite-utils";
import { converterFunctions, type ConverterFunctions } from "appwrite-utils";
import { convertObjectBySchema } from "./converters.js";
import { type AfterImportActions } from "appwrite-utils";
import { afterImportActions } from "./afterImportActions.js";
import { logger } from "./logging.js";
import { tryAwaitWithRetry } from "../utils/helperFunctions.js";

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

  /**
   * Runs converter functions on the item based on the provided attribute mappings.
   *
   * @param item - The item to be transformed.
   * @param attributeMappings - The mappings that define how each attribute should be transformed.
   * @returns The transformed item.
   */
  runConverterFunctions(item: any, attributeMappings: AttributeMappings) {
    const conversionSchema = attributeMappings.reduce((schema, mapping) => {
      schema[mapping.targetKey] = (originalValue: any) => {
        if (!mapping.converters) {
          return originalValue;
        }
        return mapping.converters?.reduce((value, converterName) => {
          let shouldProcessAsArray = false;
          if (
            (converterName.includes("[Arr]") ||
              converterName.includes("[arr]")) &&
            Array.isArray(value)
          ) {
            shouldProcessAsArray = true;
            converterName = converterName
              .replace("[Arr]", "")
              .replace("[arr]", "");
          } else if (
            (!Array.isArray(value) && converterName.includes("[Arr]")) ||
            converterName.includes("[arr]")
          ) {
            converterName = converterName
              .replace("[Arr]", "")
              .replace("[arr]", "");
          }
          const converterFunction =
            converterFunctions[
              converterName as keyof typeof converterFunctions
            ];
          if (converterFunction) {
            if (Array.isArray(value) && !shouldProcessAsArray) {
              return value.map((item) => converterFunction(item));
            } else {
              return converterFunction(value);
            }
          } else {
            logger.warn(
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
   * @param attributeMap The attribute mappings for the data item.
   * @param context The context for resolving templated parameters in validation rules.
   * @returns A promise that resolves to true if the item is valid, false otherwise.
   */
  validateItem(
    item: any,
    attributeMap: AttributeMappings,
    context: { [key: string]: any }
  ): boolean {
    for (const mapping of attributeMap) {
      const { validationActions } = mapping;
      if (
        !validationActions ||
        !Array.isArray(validationActions) ||
        !validationActions.length
      ) {
        return true; // Assume items without validation actions as valid.
      }
      for (const ruleDef of validationActions) {
        const { action, params } = ruleDef;
        const validationRule =
          validationRules[action as keyof typeof validationRules];

        if (!validationRule) {
          logger.warn(`Validation rule '${action}' is not defined.`);
          continue; // Optionally, consider undefined rules as a validation failure.
        }

        // Resolve templated parameters
        const resolvedParams = params.map((param: any) =>
          this.resolveTemplate(param, context, item)
        );

        // Apply the validation rule
        let isValid = false;
        if (Array.isArray(item)) {
          isValid = item.every((item) =>
            (validationRule as any)(item, ...resolvedParams)
          );
        } else {
          isValid = (validationRule as any)(item, ...resolvedParams);
        }
        if (!isValid) {
          logger.error(
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
      const { postImportActions } = mapping;
      if (!postImportActions || !Array.isArray(postImportActions)) {
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
          await tryAwaitWithRetry(
            async () => await this.executeAction(action, params, context, item)
          );
        } catch (error) {
          logger.error(
            `Failed to execute post-import action '${action}' for attribute '${mapping.targetKey}':`,
            error
          );
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
          `Executing action '${actionName}' from context with params:`,
          resolvedParams
        );
        logger.info(
          `Executing action '${actionName}' from context: ${JSON.stringify(
            context,
            null,
            2
          )} with params:`,
          resolvedParams
        );
        await (actionMethod as any)(this.config, ...resolvedParams);
      } catch (error: any) {
        logger.error(
          `Error executing action '${actionName}' with context:`,
          context,
          error
        );
        throw new Error(
          `Execution failed for action '${actionName}': ${error.message}`
        );
      }
    } else {
      logger.warn(`Action '${actionName}' is not defined.`);
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
  resolveTemplate(
    template: any,
    context: { [key: string]: any },
    item: any
  ): any {
    // Function to recursively resolve paths, including handling [any] notation
    const resolvePath = (path: string, currentContext: any): any => {
      const anyKeyRegex = /\[any\]/g;
      let pathParts = path.split(".").filter(Boolean);

      return pathParts.reduce((acc, part, index) => {
        // Handle [any] part by iterating over all elements if it's an object or an array
        if (part === "[any]") {
          if (Array.isArray(acc)) {
            return acc
              .map((item) => item[pathParts[index + 1]])
              .filter((item) => item !== undefined);
          } else if (typeof acc === "object") {
            return Object.values(acc)
              .map((item: any) => item[pathParts[index + 1]])
              .filter((item) => item !== undefined);
          }
        } else {
          return acc?.[part];
        }
      }, currentContext);
    };

    if (typeof template === "string") {
      // Matches placeholders in the template
      const regex = /\{([^}]+)\}/g;
      let match;
      let resolvedString = template;
      while ((match = regex.exec(template)) !== null) {
        const path = match[1];
        // Resolve the path, handling [any] notation and arrays/objects
        const resolvedValue = resolvePath(path, { ...context, ...item });
        if (resolvedValue !== undefined) {
          // If it's an array (from [any] notation), join the values; adjust as needed
          const value = Array.isArray(resolvedValue)
            ? resolvedValue.join(", ")
            : resolvedValue;
          resolvedString = resolvedString.replace(match[0], value);
        } else {
          logger.warn(
            `Failed to resolve ${template} in context: `,
            JSON.stringify({ ...context, ...item }, null, 2)
          );
        }
      }
      // console.log(`Resolved string: ${resolvedString}`);
      return resolvedString;
    } else if (typeof template === "object" && template !== null) {
      // Recursively resolve templates for each property in the object
      const resolvedObject: any = Array.isArray(template) ? [] : {};
      for (const key in template) {
        const resolvedValue = this.resolveTemplate(
          template[key],
          context,
          item
        );
        if (resolvedValue !== undefined) {
          // Only assign if resolvedValue is not undefined
          resolvedObject[key] = resolvedValue;
        }
      }
      return resolvedObject;
    }
    // console.log(`Template is not a string or object: ${template}`);
    return template;
  }
}
