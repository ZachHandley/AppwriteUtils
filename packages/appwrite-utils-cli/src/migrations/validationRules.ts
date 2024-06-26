import _ from "lodash";

export interface ValidationRules {
  [key: string]: (value: any, ...args: any[]) => boolean;
}

export const validationRules = {
  isNumber: (value: any): boolean => _.isNumber(value),
  isString: (value: any): boolean => _.isString(value),
  isBoolean: (value: any): boolean => _.isBoolean(value),
  isArray: (value: any): boolean => _.isArray(value),
  isObject: (value: any): boolean =>
    _.isObject(value) && !_.isArray(value) && !_.isFunction(value),
  isNull: (value: any): boolean => _.isNull(value),
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
  isNullish: (value: any): boolean => _.isNull(value) || _.isUndefined(value),
  isUndefined: (value: any): boolean => _.isUndefined(value),
  isDefined: (value: any): boolean =>
    !_.isUndefined(value) && !_.isNull(value) && !_.isEmpty(value),
  isDate: (value: any): boolean => _.isDate(value),
  isEmpty: (value: any): boolean => _.isEmpty(value),
  isInteger: (value: any): boolean => _.isInteger(value),
  isFloat: (value: any): boolean => _.isNumber(value) && !_.isInteger(value),
  isArrayLike: (value: any): boolean => _.isArrayLike(value),
  isArrayLikeObject: (value: any): boolean => _.isArrayLikeObject(value),
  isFunction: (value: any): boolean => _.isFunction(value),
  isLength: (value: any): boolean => _.isLength(value),
  isMap: (value: any): boolean => _.isMap(value),
  isSet: (value: any): boolean => _.isSet(value),
  isRegExp: (value: any): boolean => _.isRegExp(value),
  isSymbol: (value: any): boolean => _.isSymbol(value),
  isObjectLike: (value: any): boolean => _.isObjectLike(value),
  isPlainObject: (value: any): boolean => _.isPlainObject(value),
  isSafeInteger: (value: any): boolean => _.isSafeInteger(value),
  isTypedArray: (value: any): boolean => _.isTypedArray(value),
  isEqual: (value: any, other: any): boolean => _.isEqual(value, other),
  isMatch: (object: any, source: any): boolean => _.isMatch(object, source),
  has: (object: any, path: string): boolean => _.has(object, path),
  get: (object: any, path: string, defaultValue: any): any =>
    _.get(object, path, defaultValue),
};
