import { DateTime } from "luxon";
import _ from "lodash";
import type { AppwriteConfig } from "./schema.js";

const { cloneDeep, isObject } = _;

export interface ConverterFunctions {
  [key: string]: (value: any) => any;
}

export const converterFunctions = {
  /**
   * Converts any value to a string. Handles null and undefined explicitly.
   * @param {any} value The value to convert.
   * @return {string | null} The converted string or null if the value is null or undefined.
   */
  anyToString(value: any): string | null {
    if (value == null) return null;
    return typeof value === "string" ? value : JSON.stringify(value);
  },

  /**
   * Converts any value to a number. Returns null for non-numeric values, null, or undefined.
   * @param {any} value The value to convert.
   * @return {number | null} The converted number or null.
   */
  anyToNumber(value: any): number | null {
    if (value == null) return null;
    const number = Number(value);
    return isNaN(number) ? null : number;
  },

  /**
   * Converts any value to a boolean. Specifically handles string representations.
   * @param {any} value The value to convert.
   * @return {boolean | null} The converted boolean or null if conversion is not possible.
   */
  anyToBoolean(value: any): boolean | null {
    if (value == null) return null;
    if (typeof value === "string") {
      const trimmedValue = value.trim().toLowerCase();
      if (["true", "yes", "1"].includes(trimmedValue)) return true;
      if (["false", "no", "0"].includes(trimmedValue)) return false;
      return null; // Return null for strings that don't explicitly match
    }
    return Boolean(value);
  },

  /**
   * Converts any value to an array, attempting to split strings by a specified separator.
   * @param {any} value The value to convert.
   * @param {string | undefined} separator The separator to use when splitting strings.
   * @return {any[]} The resulting array after conversion.
   */
  anyToAnyArray(value: any): any[] {
    if (Array.isArray(value)) {
      return value;
    } else if (typeof value === "string") {
      // Let's try a few
      return converterFunctions.trySplitByDifferentSeparators(value);
    }
    return [value];
  },

  /**
   * Converts any value to an array of strings. If the input is already an array, returns it as is.
   * Otherwise, if the input is a string, returns an array with the string as the only element.
   * Otherwise, returns an empty array.
   * @param {any} value The value to convert.
   * @return {string[]} The resulting array after conversion.
   */
  anyToStringArray(value: any): string[] {
    if (Array.isArray(value)) {
      return value.map((item) => String(item));
    } else if (typeof value === "string" && value.length > 0) {
      return [value];
    }
    return [];
  },

  /**
   * A function that converts any type of value to an array of numbers.
   *
   * @param {any} value - the value to be converted
   * @return {number[]} an array of numbers
   */
  anyToNumberArray(value: any): number[] {
    if (Array.isArray(value)) {
      return value.map((item) => Number(item));
    } else if (typeof value === "string") {
      return [Number(value)];
    }
    return [];
  },

  /**
   * Removes the start and end quotes from a string.
   * @param value The string to remove quotes from.
   * @return The string with quotes removed.
   **/
  removeStartEndQuotes(value: string): string {
    return value.replace(/^["']|["']$/g, "");
  },

  /**
   * Tries to split a string by different separators and returns the split that has the most uniform segment lengths.
   * This can be particularly useful for structured data like phone numbers.
   * @param value The string to split.
   * @return The split string array that has the most uniform segment lengths.
   */
  trySplitByDifferentSeparators(value: string): string[] {
    const separators = [",", ";", "|", ":", "/", "\\"];
    let bestSplit: string[] = [];
    let bestScore = -Infinity;

    for (const separator of separators) {
      const split = value.split(separator).map((s) => s.trim()); // Ensure we trim spaces
      if (split.length <= 1) continue; // Skip if no actual splitting occurred

      // Calculate uniformity in segment length
      const lengths = split.map((segment) => segment.length);
      const averageLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      const lengthVariance =
        lengths.reduce(
          (total, length) => total + Math.pow(length - averageLength, 2),
          0
        ) / lengths.length;

      // Adjust scoring to prioritize splits with lower variance and/or specific segment count if needed
      const score = split.length / (1 + lengthVariance); // Adjusted to prioritize lower variance

      // Update bestSplit if this split has a better score
      if (score > bestScore) {
        bestSplit = split;
        bestScore = score;
      }
    }

    // If no suitable split was found, return the original value as a single-element array
    if (bestSplit.length === 0) {
      return [value];
    }

    return bestSplit;
  },

  joinValues(values: any[]): string {
    return values.join("");
  },

  joinBySpace(values: any[]): string {
    return values.join(" ");
  },

  joinByComma(values: any[]): string {
    return values.join(",");
  },

  joinByPipe(values: any[]): string {
    return values.join("|");
  },

  joinBySemicolon(values: any[]): string {
    return values.join(";");
  },

  joinByColon(values: any[]): string {
    return values.join(":");
  },

  joinBySlash(values: any[]): string {
    return values.join("/");
  },

  joinByHyphen(values: any[]): string {
    return values.join("-");
  },

  splitByComma(value: string): string[] {
    return value.split(",");
  },

  splitByPipe(value: string): string[] {
    return value.split("|");
  },

  splitBySemicolon(value: string): string[] {
    return value.split(";");
  },

  splitByColon(value: string): string[] {
    return value.split(":");
  },

  splitBySlash(value: string): string[] {
    return value.split("/");
  },

  splitByBackslash(value: string): string[] {
    return value.split("\\");
  },

  splitBySpace(value: string): string[] {
    return value.split(" ");
  },

  splitByDot(value: string): string[] {
    return value.split(".");
  },

  splitByUnderscore(value: string): string[] {
    return value.split("_");
  },

  splitByHyphen(value: string): string[] {
    return value.split("-");
  },

  /**
   * Takes the first element of an array and returns it.
   * @param {any[]} value The array to take the first element from.
   * @return {any} The first element of the array.
   */
  pickFirstElement(value: any[]): any {
    return value[0];
  },

  /**
   * Takes the last element of an array and returns it.
   * @param {any[]} value The array to take the last element from.
   * @return {any} The last element of the array.
   */
  pickLastElement(value: any[]): any {
    return value[value.length - 1];
  },

  /**
   * Converts an object to a JSON string.
   * @param {any} object The object to convert.
   * @return {string} The JSON string representation of the object.
   */
  stringifyObject(object: any): string {
    return JSON.stringify(object);
  },

  /**
   * Converts a JSON string to an object.
   * @param {string} jsonString The JSON string to convert.
   * @return {any} The object representation of the JSON string.
   */
  parseObject(jsonString: string): any {
    return JSON.parse(jsonString);
  },

  convertPhoneStringToUSInternational(value: string): string {
    // Check if the value is not a string or doesn't contain digits, return as is
    if (typeof value !== "string" || !/\d/.test(value)) return value;

    // Remove all non-digit characters for a clean slate
    const digits = value.replace(/\D/g, "");

    // Ensure the resulting string is not longer than 15 characters, including country code
    if (digits.length > 11) return value; // Return original if it exceeds the length limit

    // If the cleaned number starts with 1 and is 11 digits, it's already in US international format
    if (digits.startsWith("1") && digits.length === 11) {
      return `+${digits}`;
    }
    // If it's exactly 10 digits, prepend with +1 to conform to US international format
    else if (digits.length === 10) {
      return `+1${digits}`;
    }
    // Otherwise, return the original value as it doesn't conform to expected US formats
    return value;
  },

  /**
   * A function that removes invalid elements from an array.
   *
   * @param {any[]} array - the input array
   * @return {any[]} the filtered array without invalid elements
   */
  removeInvalidElements(array: any[]): any[] {
    if (!Array.isArray(array)) return array;
    return _.filter(
      array,
      (element) =>
        element !== null &&
        element !== undefined &&
        element !== "" &&
        element !== "undefined" &&
        element !== "null"
    );
  },

  /**
   * Tries to parse a date from various formats using Luxon with enhanced error reporting.
   * @param {string | number} input The input date as a string or timestamp.
   * @return {string | null} The parsed date in ISO 8601 format or null if parsing failed.
   */
  safeParseDate(input: string | number): string | null {
    const formats = [
      "M/d/yyyy HH:mm:ss", // U.S. style with time
      "d/M/yyyy HH:mm:ss", // Rest of the world style with time
      "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", // ISO 8601 format
      "yyyy-MM-dd'T'HH:mm:ss", // ISO 8601 without milliseconds
      "yyyy-MM-dd HH:mm:ss", // SQL datetime format (common log format)
      "M/d/yyyy", // U.S. style without time
      "d/M/yyyy", // Rest of the world style without time
      "yyyy-MM-dd", // ISO date format
      "dd-MM-yyyy",
      "MM-dd-yyyy",
      "dd/MM/yyyy",
      "MM/dd/yyyy",
      "dd.MM.yyyy",
      "MM.dd.yyyy",
      "yyyy.MM.dd",
      "yyyy/MM/dd",
      "yyyy/MM/dd HH:mm",
      "yyyy-MM-dd HH:mm",
      "M/d/yyyy h:mm:ss tt", // U.S. style with 12-hour clock
      "d/M/yyyy h:mm:ss tt", // Rest of the world style with 12-hour clock
      "h:mm tt", // Time only with 12-hour clock
      "HH:mm:ss", // Time only with 24-hour clock
      "HH:mm", // Time only without seconds, 24-hour clock
      "h:mm tt M/d/yyyy", // 12-hour clock time followed by U.S. style date
      "h:mm tt d/M/yyyy", // 12-hour clock time followed by Rest of the world style date
      "yyyy-MM-dd'T'HH:mm:ss.SSSZ", // ISO 8601 with timezone offset
      "yyyy-MM-dd'T'HH:mm:ssZ", // ISO 8601 without milliseconds but with timezone offset
      "E, dd MMM yyyy HH:mm:ss z", // RFC 2822 format
      "EEEE, MMMM d, yyyy", // Full textual date
      "yyyy-MM-dd'T'HH:mm:ss.SSSXXX", // ISO 8601 with extended timezone offset
      "yyyy-MM-dd'T'HH:mm:ssXXX", // ISO 8601 without milliseconds but with extended timezone offset
      "dd-MMM-yyyy", // Textual month with day and year
    ];

    // Attempt to parse as a timestamp first if input is a number
    if (typeof input === "number") {
      const dateFromMillis = DateTime.fromMillis(input);
      if (dateFromMillis.isValid) {
        return dateFromMillis.toISO();
      }
    }

    // Attempt to parse as an ISO string or SQL string
    let date = DateTime.fromISO(String(input));
    if (!date.isValid) date = DateTime.fromSQL(String(input));

    // Try each custom format if still not valid
    for (const format of formats) {
      if (!date.isValid) {
        date = DateTime.fromFormat(String(input), format);
      }
    }

    // Return null if no valid date could be parsed
    if (!date.isValid) {
      return null;
    }

    return date.toISO();
  },
};

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

type AttributeMappings =
  AppwriteConfig["collections"][number]["importDefs"][number]["attributeMappings"];

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
    if (Array.isArray(mapping.oldKeys)) {
      // Collect and flatten values from multiple oldKeys
      const values = mapping.oldKeys
        .map((oldKey) => resolveValue(obj, oldKey))
        .flat(Infinity);
      result[mapping.targetKey] = values.filter((value) => value !== undefined);
    } else if (mapping.oldKey) {
      // Resolve single oldKey
      const value = resolveValue(obj, mapping.oldKey);
      if (value !== undefined) {
        result[mapping.targetKey] = Array.isArray(value)
          ? value.flat(Infinity)
          : value;
      }
    }
  }
  console.log("Resolved object:", result);
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
