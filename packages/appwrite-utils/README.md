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

### Changelog

- 0.3.92: Added a `getFilePreviewUrl` which allows you to modify image files, or just get a preview of a file, without downloading it (creates a URL instead of an `ArrayBuffer`)
- 0.3.91: Updated permissions to include `parsePermissions` which maps my permissions (`target`, `permission` to the Appwrite strings) -- also added `PermissionToAppwritePermission` which converts one of mine (target, permission) to Appwrite
- 0.3.9: Refactored the cli tool to allow for more specificity and configuration
- 0.3.8: Upgraded some parts of the package, AppwriteConfig typing updated to include buckets, made cli tool interactive
- 0.3.7: Remove `ulid` to replace with `ulidx` for compatibility
- 0.3.6: Bump to `appwrite` version
- 0.3.5: Added `flattenArray` which flattens an array, so if you accidentally convert things into `"someValue": [ ['1' ], '2', ]` you can now make that just `['1', '2',]`
- 0.3.4: Added `onlyUnsetToArray` converter, which is meant to be used last so if you need to guarantee something is an array instead of null or undefined, you would use that
- 0.2.8: Added `valueToSet` to attributeMappings, allowing you to set the thing you want to set literally in importDefs
- 0.2.7: Removed need for `lodash`
- 0.2.6: Added `tryAwaitWithRetry` which will retry the given (used for Appwrite calls mostly) function up to 5 times if the error includes `fetch failed` or `server error` (all lowercased) because there's a weird bug sometimes with the server SDK
- 0.2.5: Added `targetFieldToMatch` to the `idMappings` configuration which should allow more concise mapping of after-import fields
- 0.2.3: Added OpenAPI descriptions to AuthUserSchema, which also allows one to use the openapi package itself (`@asteasolutions/zod-to-openapi`) with the AuthUserSchema
- 0.2.2: Lots of updates, moved schemas and stuff here, fixed package, added export of AuthUser which got removed accidentally
- 0.1.21: Changed `ID.unique()` to `ulid()` for random ID generation, refactored `schema.ts` into multiple files
- 0.1.20: Forgot type ValidationRules, type ConverterFunctions, and type AfterImportActions
- 0.1.19: Forgot Indexes oopsie
- 0.1.18: Added Attribute type to exports (union of all types)
- 0.1.17: Fixed package in general, removed redundancies in appwrite-utils-cli as it now depends on this package
