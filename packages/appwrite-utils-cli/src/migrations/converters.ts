import _ from "lodash";
import { converterFunctions, type AttributeMappings } from "appwrite-utils";

const { cloneDeep, isObject } = _;

/**
 * Deeply converts all properties of an object (or array) to strings.
 * @param data The input data to convert.
 * @returns The data with all its properties converted to strings.
 */
export const deepAnyToString = (data: any): any => {
  if (Array.isArray(data)) {
    return data.map((item) => deepAnyToString(item));
  } else if (isObject(data)) {
    return Object.keys(data).reduce((acc, key) => {
      acc[key] = deepAnyToString(data[key as keyof typeof data]);
      return acc;
    }, {} as Record<string, any>);
  } else {
    return converterFunctions.anyToString(data);
  }
};

/**
 * Performs a deep conversion of all values in a nested structure to the specified type.
 * Uses a conversion function like anyToString, anyToNumber, etc.
 * @param data The data to convert.
 * @param convertFn The conversion function to apply.
 * @returns The converted data.
 */
export const deepConvert = <T>(
  data: any,
  convertFn: (value: any) => T
): any => {
  if (Array.isArray(data)) {
    return data.map((item) => deepConvert(item, convertFn));
  } else if (isObject(data)) {
    return Object.keys(data).reduce((acc: Record<string, T>, key: string) => {
      acc[key] = deepConvert(data[key as keyof typeof data], convertFn);
      return acc;
    }, {});
  } else {
    return convertFn(data);
  }
};

/**
 * Converts an entire object's properties to different types based on a provided schema.
 * @param obj The object to convert.
 * @param schema A mapping of object keys to conversion functions.
 * @returns The converted object.
 */
export const convertObjectBySchema = (
  obj: Record<string, any>,
  schema: Record<string, (value: any) => any>
): Record<string, any> => {
  return Object.keys(obj).reduce((acc: Record<string, any>, key: string) => {
    const convertFn = schema[key];
    acc[key] = convertFn ? convertFn(obj[key]) : obj[key];
    return acc;
  }, {});
};

/**
 * Converts the keys of an object based on a provided attributeMappings.
 * Each key in the object is checked against attributeMappings; if a matching entry is found,
 * the key is renamed to the targetKey specified in attributeMappings.
 *
 * @param obj The object to convert.
 * @param attributeMappings The attributeMappings defining how keys in the object should be converted.
 * @returns The converted object with keys renamed according to attributeMappings.
 */
export const convertObjectByAttributeMappings = (
  obj: Record<string, any>,
  attributeMappings: AttributeMappings
): Record<string, any> => {
  const result: Record<string, any> = {};

  // Correctly handle [any] notation by mapping or aggregating over all elements or keys
  const resolveValue = (obj: Record<string, any>, path: string): any => {
    const parts = path.split(".");
    let current = obj;

    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === "[any]") {
        if (Array.isArray(current)) {
          // If current is an array, apply resolution to each item
          return current.map((item) =>
            resolveValue(item, parts.slice(i + 1).join("."))
          );
        } else if (typeof current === "object" && current !== null) {
          // If current is an object, aggregate values from all keys
          return Object.values(current).map((value) =>
            resolveValue(value, parts.slice(i + 1).join("."))
          );
        }
      } else {
        current = current[parts[i]];
        if (current === undefined) return undefined;
      }
    }
    return current;
  };

  for (const mapping of attributeMappings) {
    if (mapping.valueToSet !== undefined) {
      result[mapping.targetKey] = mapping.valueToSet;
    } else if (Array.isArray(mapping.oldKeys)) {
      // Collect and flatten values from multiple oldKeys
      const values = mapping.oldKeys
        .map((oldKey) => resolveValue(obj, oldKey))
        .flat(Infinity);
      if (values.length > 0) {
        result[mapping.targetKey] = values.filter(
          (value) => value !== undefined
        );
      } else {
        result[mapping.targetKey] = null;
      }
    } else if (mapping.oldKey) {
      // Resolve single oldKey
      const value = resolveValue(obj, mapping.oldKey);
      if (value !== undefined) {
        result[mapping.targetKey] = Array.isArray(value)
          ? value.flat(Infinity)
          : value;
      } else {
        result[mapping.targetKey] = value ? value : null;
      }
    }
  }

  return result;
};

/**
 * Ensures data conversion without mutating the original input.
 * @param data The data to convert.
 * @param convertFn The conversion function to apply.
 * @returns The converted data.
 */
export const immutableConvert = <T>(
  data: any,
  convertFn: (value: any) => T
): T => {
  const clonedData = cloneDeep(data);
  return convertFn(clonedData);
};

/**
 * Validates a string against a regular expression and returns the string if valid, or null.
 * @param value The string to validate.
 * @param pattern The regex pattern to validate against.
 * @returns The original string if valid, otherwise null.
 */
export const validateString = (
  value: string,
  pattern: RegExp
): string | null => {
  return pattern.test(value) ? value : null;
};
