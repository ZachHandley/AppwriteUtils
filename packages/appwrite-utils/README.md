# appwrite-utils

## Overview

`appwrite-utils` is a comprehensive TypeScript library designed to streamline the development process for Appwrite projects. It provides a suite of utilities and helper functions that facilitate data manipulation, schema management, and seamless integration with Appwrite services. Whether you're managing data migrations, schema updates, or simply need a set of robust tools for your Appwrite project, `appwrite-utils` has you covered. This package is meant to be imported into your project for access to validation functions, converter functions, and more, enhancing your project's capabilities with Appwrite.

## Features

- **Validation Functions**: Utilize a collection of validation functions to ensure data integrity throughout your Appwrite projects.
- **Converter Functions**: Transform data effortlessly with a suite of converter functions, facilitating smooth data manipulation and integration.
- **Attribute Schemas**: Define and manage your data models with ease using comprehensive attribute schemas.
- **File Operations**: Leverage functions for efficient file management and access within your Appwrite projects, including URL generation for file viewing and downloading.

## Installation

To integrate `appwrite-utils` into your project, ensure you have npm installed and run the following command in your project directory:

```bash
npm install appwrite-utils
```

## Utilities

### Validation Functions

These functions help ensure the integrity and correctness of the data in your Appwrite projects:

```typescript
isNumber, isString, isBoolean, isArray, isObject, isNull, isUndefined, isDefined, isDate,
isEmpty, isInteger, isFloat, isArrayLike, isArrayLikeObject, isFunction, isLength, isMap,
isSet, isRegExp, isSymbol, isObjectLike, isPlainObject, isSafeInteger, isTypedArray,
isEqual, isMatch, has, get
```

### Converter Functions

Converters are designed to transform data formats or types to suit specific needs within your applications:

```typescript
anyToString, anyToNumber, anyToBoolean, anyToAnyArray, anyToStringArray,
trySplitByDifferentSeparators, removeStartEndQuotes, splitByComma, splitByPipe,
splitBySemicolon, splitByColon, splitBySlash, splitByBackslash, splitBySpace,
splitByDot, splitByUnderscore, splitByHyphen, pickFirstElement, pickLastElement,
stringifyObject, parseObject, safeParseDate, removeInvalidElements, joinValues,
joinBySpace, joinByComma, joinByPipe, joinBySemicolon, joinByColon, joinBySlash,
joinByHyphen, convertPhoneStringToUSInternational, validateOrNullEmail
```

### File Functions

These functions facilitate the management and operation of files within your Appwrite projects:

```typescript
getFileViewUrl, getFileDownloadUrl
```

Both `getFileViewUrl` and `getFileDownloadUrl` take parameters like `endpoint`, `projectId`, `bucketId`, `fileId`, and optionally `jwt` to generate accessible URLs for files stored in Appwrite.

## Usage

After installing the package, you can directly import and use the various utilities in your TypeScript or JavaScript code. For example:

```typescript
import { isNumber, anyToString } from 'appwrite-utils';

// Use the functions directly in your code
console.log(isNumber(5));  // Output: true
console.log(anyToString(1234));  // Output: "1234"
```

This setup ensures that your interactions with Appwrite are more robust, less error-prone, and significantly more manageable.