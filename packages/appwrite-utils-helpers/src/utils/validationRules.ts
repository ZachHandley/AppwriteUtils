import {
  isNumber,
  isString,
  isBoolean,
  isArray,
  isPlainObject,
  isNull,
  isUndefined,
  isDate,
  isEmpty,
  isInteger,
  isArrayLike,
  isArrayLikeObject,
  isFunction,
  isLength,
  isMap,
  isSet,
  isRegExp,
  isSymbol,
  isObjectLike,
  isSafeInteger,
  isTypedArray,
  isEqual,
  isMatch,
  has,
  get,
} from "es-toolkit/compat";
export interface ValidationRules {
  [key: string]: (value: any, ...args: any[]) => boolean;
}

export const validationRules = {
  isNumber: (value: any): boolean => isNumber(value),
  isString: (value: any): boolean => isString(value),
  isBoolean: (value: any): boolean => isBoolean(value),
  isArray: (value: any): boolean => isArray(value),
  isObject: (value: any): boolean =>
    isPlainObject(value) && !isArray(value) && !isFunction(value),
  isNull: (value: any): boolean => isNull(value),
  isValidEmail: (value: string): boolean =>
    value.match(/^[\w\-\.]+@([\w-]+\.)+[\w-]{2,}$/) !== null,
  isValidPhone: (value: string): boolean =>
    value.match(/^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/im) !==
    null,
  isValidPassword: (value: string): boolean =>
    value.match(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/
    ) !== null,
  isValidUrl: (value: string): boolean =>
    value.match(
      /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/
    ) !== null,
  isValidHex: (value: string): boolean =>
    value.match(/^#([a-f0-9]{6}|[a-f0-9]{3})$/i) !== null,
  isValidHexColor: (value: string): boolean =>
    value.match(/^#([a-f0-9]{6}|[a-f0-9]{3})$/i) !== null,
  isValidHexAlpha: (value: string): boolean =>
    value.match(/^#([a-f0-9]{8}|[a-f0-9]{4})$/i) !== null,
  isValidDate: (value: string): boolean =>
    value.match(/^\d{4}-\d{2}-\d{2}$/) !== null,
  isValidTime: (value: string): boolean =>
    value.match(/^\d{2}:\d{2}(:\d{2})?$/) !== null,
  isNullish: (value: any): boolean => isNull(value) || isUndefined(value),
  isUndefined: (value: any): boolean => isUndefined(value),
  isDefined: (value: any): boolean =>
    !isUndefined(value) && !isNull(value) && !isEmpty(value),
  isDate: (value: any): boolean => isDate(value),
  isEmpty: (value: any): boolean => isEmpty(value),
  isInteger: (value: any): boolean => isInteger(value),
  isFloat: (value: any): boolean => isNumber(value) && !isInteger(value), // Note: Works for double precision numbers
  isArrayLike: (value: any): boolean => isArrayLike(value),
  isArrayLikeObject: (value: any): boolean => isArrayLikeObject(value),
  isFunction: (value: any): boolean => isFunction(value),
  isLength: (value: any): boolean => isLength(value),
  isMap: (value: any): boolean => isMap(value),
  isSet: (value: any): boolean => isSet(value),
  isRegExp: (value: any): boolean => isRegExp(value),
  isSymbol: (value: any): boolean => isSymbol(value),
  isObjectLike: (value: any): boolean => isObjectLike(value),
  isPlainObject: (value: any): boolean => isPlainObject(value),
  isSafeInteger: (value: any): boolean => isSafeInteger(value),
  isTypedArray: (value: any): boolean => isTypedArray(value),
  isEqual: (value: any, other: any): boolean => isEqual(value, other),
  isMatch: (object: any, source: any): boolean => isMatch(object, source),
  has: (object: any, path: string): boolean => has(object, path),
  get: (object: any, path: string, defaultValue: any): any =>
    get(object, path, defaultValue),
};
