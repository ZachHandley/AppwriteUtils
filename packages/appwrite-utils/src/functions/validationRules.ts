export interface ValidationRules {
  [key: string]: (value: any, ...args: any[]) => boolean;
}

export const validationRules = {
  isNumber: (value: any): boolean => typeof value === "number",
  isString: (value: any): boolean => typeof value === "string",
  isBoolean: (value: any): boolean => typeof value === "boolean",
  isArray: (value: any): boolean => Array.isArray(value),
  isObject: (value: any): boolean =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value !== "function",
  isNull: (value: any): boolean => value === null,
  isValidEmail: (value: string): boolean =>
    /^[\w\-\.]+@([\w-]+\.)+[\w-]{2,}$/.test(value),
  isValidPhone: (value: string): boolean =>
    /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/im.test(value),
  isValidPassword: (value: string): boolean =>
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/.test(
      value
    ),
  isValidUrl: (value: string): boolean =>
    /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/.test(
      value
    ),
  isValidHex: (value: string): boolean =>
    /^#([a-f0-9]{6}|[a-f0-9]{3})$/i.test(value),
  isValidHexColor: (value: string): boolean =>
    /^#([a-f0-9]{6}|[a-f0-9]{3})$/i.test(value),
  isValidHexAlpha: (value: string): boolean =>
    /^#([a-f0-9]{8}|[a-f0-9]{4})$/i.test(value),
  isValidDate: (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value),
  isValidTime: (value: string): boolean => /^\d{2}:\d{2}(:\d{2})?$/.test(value),
  isNullish: (value: any): boolean => value == null,
  isUndefined: (value: any): boolean => value === undefined,
  isDefined: (value: any): boolean =>
    value !== undefined && value !== null && value !== "",
  isDate: (value: any): boolean => value instanceof Date,
  isEmpty: (value: any): boolean =>
    value == null ||
    (typeof value === "object" && Object.keys(value).length === 0) ||
    (Array.isArray(value) && value.length === 0),
  isInteger: (value: any): boolean => Number.isInteger(value),
  isFloat: (value: any): boolean =>
    typeof value === "number" && !Number.isInteger(value),
  isArrayLike: (value: any): boolean =>
    value != null &&
    typeof value !== "function" &&
    typeof value.length === "number" &&
    value.length >= 0,
  isArrayLikeObject: (value: any): boolean =>
    typeof value === "object" &&
    value !== null &&
    typeof value.length === "number" &&
    value.length >= 0,
  isFunction: (value: any): boolean => typeof value === "function",
  isLength: (value: any): boolean =>
    typeof value === "number" && value >= 0 && Number.isInteger(value),
  isMap: (value: any): boolean => value instanceof Map,
  isSet: (value: any): boolean => value instanceof Set,
  isRegExp: (value: any): boolean => value instanceof RegExp,
  isSymbol: (value: any): boolean => typeof value === "symbol",
  isObjectLike: (value: any): boolean =>
    typeof value === "object" && value !== null,
  isPlainObject: (value: any): boolean =>
    Object.prototype.toString.call(value) === "[object Object]",
  isSafeInteger: (value: any): boolean => Number.isSafeInteger(value),
  isTypedArray: (value: any): boolean =>
    ArrayBuffer.isView(value) && !(value instanceof DataView),
  isEqual: (value: any, other: any): boolean =>
    JSON.stringify(value) === JSON.stringify(other),
  isMatch: (object: any, source: any): boolean => {
    for (let key in source) {
      if (source[key] !== object[key]) {
        return false;
      }
    }
    return true;
  },
  has: (object: any, path: string): boolean => {
    const keys = path.split(".");
    for (let key of keys) {
      if (object == null || !object.hasOwnProperty(key)) {
        return false;
      }
      object = object[key];
    }
    return true;
  },
  get: (object: any, path: string, defaultValue: any): any => {
    const keys = path.split(".");
    for (let key of keys) {
      if (object == null || !object.hasOwnProperty(key)) {
        return defaultValue;
      }
      object = object[key];
    }
    return object;
  },
};
