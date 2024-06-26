import { DateTime } from "luxon";
import type { AttributeMappings } from "../schemas/attributeMappings.js";
import { validationRules } from "./validationRules.js";

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
    if (value === null || value === undefined || value === "") return [];
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
    if (value === null || value === undefined || value === "") return [];
    if (Array.isArray(value)) {
      return value.map((item) => String(item));
    } else if (typeof value === "string" && value.length > 0) {
      return [value];
    }
    return [];
  },

  /**
   * Converts any null, empty, or undefined value to an empty array
   * Meant to be used if the value needs to be an array but you can't guarantee it is one
   */
  onlyUnsetToArray(value: any): any[] {
    if (value === null || value === undefined || value === "") return [];
    return value;
  },

  /**
   * Flattens an array or a nested array of arrays into a single array.
   *
   * @param {any} value - The value to be flattened. Can be an array or a nested array of arrays.
   * @return {any[]} - A flattened array of all the elements from the input array(s).
   * If the input is null/undefined/empty, an empty array is returned.
   * If the input is not an array or a nested array of arrays, the input is returned as is.
   */
  flattenArray(value: any): any[] {
    if (value === null || value === undefined || value === "") return [];
    if (Array.isArray(value)) {
      return value.flat(Infinity);
    }
    return value;
  },

  /**
   * A function that converts any type of value to an array of numbers.
   *
   * @param {any} value - the value to be converted
   * @return {number[]} an array of numbers
   */
  anyToNumberArray(value: any): number[] {
    if (value === null || value === undefined || value === "") return value;
    if (Array.isArray(value)) {
      return value.map((item) => Number(item));
    } else if (typeof value === "string") {
      return [Number(value)];
    }
    return [];
  },

  trim(value: string): string {
    if (value === null || value === undefined || value === "") return "";
    try {
      return value.trim();
    } catch (error) {
      return value;
    }
  },

  /**
   * Removes the start and end quotes from a string.
   * @param value The string to remove quotes from.
   * @return The string with quotes removed.
   **/
  removeStartEndQuotes(value: string): string {
    if (value === null || value === undefined || value === "") return "";
    return value.replace(/^["']|["']$/g, "");
  },

  /**
   * Tries to split a string by different separators and returns the split that has the most uniform segment lengths.
   * This can be particularly useful for structured data like phone numbers.
   * @param value The string to split.
   * @return The split string array that has the most uniform segment lengths.
   */
  trySplitByDifferentSeparators(value: string): string[] {
    if (value === null || value === undefined || value === "") return [];
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

  joinValues(values: any[]): any {
    if (values === null || values === undefined) return values;
    try {
      return values.join("");
    } catch (error) {
      return values;
    }
  },

  joinBySpace(values: any[]): any {
    if (values === null || values === undefined) return values;
    try {
      return values.join(" ");
    } catch (error) {
      return values;
    }
  },

  makeArrayUnique(values: any[]): any[] {
    if (values === null || values === undefined) return [];
    return [...new Set(values)];
  },

  joinByComma(values: any[]): any {
    if (values === null || values === undefined) return values;
    try {
      return values.join(",");
    } catch (error) {
      return values;
    }
  },

  joinByPipe(values: any[]): any {
    if (values === null || values === undefined) return values;
    try {
      return values.join("|");
    } catch (error) {
      return values;
    }
  },

  joinBySemicolon(values: any[]): any {
    if (values === null || values === undefined) return values;
    try {
      return values.join(";");
    } catch (error) {
      return values;
    }
  },

  joinByColon(values: any[]): any {
    if (values === null || values === undefined) return values;
    try {
      return values.join(":");
    } catch (error) {
      return values;
    }
  },

  joinBySlash(values: any[]): any {
    if (values === null || values === undefined) return values;
    try {
      return values.join("/");
    } catch (error) {
      return values;
    }
  },

  joinByHyphen(values: any[]): any {
    if (values === null || values === undefined) return values;
    try {
      return values.join("-");
    } catch (error) {
      return values;
    }
  },

  splitByComma(value: string): any {
    if (value === null || value === undefined || value === "") return value;
    try {
      return value.split(",");
    } catch (error) {
      return value;
    }
  },

  splitByPipe(value: string): any {
    if (value === null || value === undefined || value === "") return value;
    try {
      return value.split("|");
    } catch (error) {
      return value;
    }
  },

  splitBySemicolon(value: string): any {
    if (value === null || value === undefined || value === "") return value;
    try {
      return value.split(";");
    } catch (error) {
      return value;
    }
  },

  splitByColon(value: string): any {
    if (value === null || value === undefined || value === "") return value;
    try {
      return value.split(":");
    } catch (error) {
      return value;
    }
  },

  splitBySlash(value: string): any {
    if (value === null || value === undefined || value === "") return value;
    try {
      return value.split("/");
    } catch (error) {
      return value;
    }
  },

  splitByBackslash(value: string): any {
    if (value === null || value === undefined || value === "") return value;
    try {
      return value.split("\\");
    } catch (error) {
      return value;
    }
  },

  splitBySpace(value: string): any {
    if (value === null || value === undefined || value === "") return value;
    try {
      return value.split(" ");
    } catch (error) {
      return value;
    }
  },

  splitByDot(value: string): any {
    if (value === null || value === undefined || value === "") return value;
    try {
      return value.split(".");
    } catch (error) {
      return value;
    }
  },

  splitByUnderscore(value: string): any {
    if (value === null || value === undefined || value === "") return value;
    try {
      return value.split("_");
    } catch (error) {
      return value;
    }
  },

  splitByHyphen(value: string): any {
    if (value === null || value === undefined || value === "") return value;
    try {
      return value.split("-");
    } catch (error) {
      return value;
    }
  },

  /**
   * Takes the first element of an array and returns it.
   * @param {any[]} value The array to take the first element from.
   * @return {any} The first element of the array.
   */
  pickFirstElement(value: any[]): any {
    if (value === null || value === undefined || value.length === 0)
      return value;
    try {
      return value[0];
    } catch (error) {
      return value;
    }
  },

  /**
   * Takes the last element of an array and returns it.
   * @param {any[]} value The array to take the last element from.
   * @return {any} The last element of the array.
   */
  pickLastElement(value: any[]): any {
    try {
      return value[value.length - 1];
    } catch (error) {
      return value;
    }
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
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      return jsonString;
    }
  },

  convertPhoneStringToUSInternational(value: string): string {
    // Normalize input: Remove all non-digit characters except the leading +
    const normalizedValue = value.startsWith("+")
      ? "+" + value.slice(1).replace(/\D/g, "")
      : value.replace(/\D/g, "");

    // Check if the value is not a string or doesn't contain digits, return as is
    if (typeof normalizedValue !== "string" || !/\d/.test(normalizedValue))
      return value;

    // Handle numbers with a leading + (indicating an international format)
    if (normalizedValue.startsWith("+")) {
      // If the number is already in a valid international format, return as is
      if (normalizedValue.length > 11 && normalizedValue.length <= 15) {
        return normalizedValue;
      }
    } else {
      // For numbers without a leading +, check the length and format
      if (normalizedValue.length === 10) {
        // US numbers without country code, prepend +1
        return `+1${normalizedValue}`;
      } else if (
        normalizedValue.length === 11 &&
        normalizedValue.startsWith("1")
      ) {
        // US numbers with country code but missing +, prepend +
        return `+${normalizedValue}`;
      }
    }

    // For numbers that don't fit expected formats, return the original value
    return value;
  },

  convertEmptyToNull(value: any): any {
    if (Array.isArray(value)) {
      return value.map((item) => this.convertEmptyToNull(item));
    }
    if (validationRules.isEmpty(value)) return null;
    return value;
  },

  /**
   * A function that removes invalid elements from an array
   *
   * @param {any[]} array - the input array
   * @return {any[]} the filtered array without invalid elements
   */
  removeInvalidElements(array: any[]): any[] {
    if (!Array.isArray(array)) return array;
    return array.filter(
      (element) =>
        element !== null &&
        element !== undefined &&
        element !== "" &&
        element !== "undefined" &&
        element !== "null" &&
        !validationRules.isEmpty(element)
    );
  },

  validateOrNullEmail(email: string): string | null {
    if (!email) return null;
    const emailRegex = /^[\w\-\.]+@([\w-]+\.)+[\w-]{2,}$/;
    return emailRegex.test(email) ? email : null;
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
  } else if (validationRules.isObject(data)) {
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
  } else if (validationRules.isObject(data)) {
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
  const clonedData = structuredClone(data);
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
