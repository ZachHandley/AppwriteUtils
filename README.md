# AppwriteUtils Package

The AppwriteUtils package simplifies the process of managing data migrations and schema updates for Appwrite projects. It provides a comprehensive toolset for database setup, data conversion, and schema management, all accessible through a simple command-line interface. This package is designed to be easily integrated into your development workflow, requiring minimal setup to get started.

## Getting Started

To use AppwriteUtils, first, install the package via npm:

```bash
npm install appwrite-utils
```

Once installed, you should first run the setup command to generate the config, then you can run migration commands directly using `npx` (or `bunx`, whatever):

```bash
npx appwrite-utils-setup
```

You may generate an example config using (or look in the examples folder)

```bash
npx appwrite-utils-setup --example
```

```bash
npx appwrite-utils-migrate --args
```

Replace `--args` with specific arguments for your migration task. For example, to run migrations in a development environment, you might use:

```bash
npx appwrite-utils-migrate --dev
```

## Key Features

- **Simplified Setup**: Quickly set up and configure your Appwrite project for migrations with minimal manual intervention.
- **Automated Database Migrations**: Effortlessly create, update, and manage collections and attributes in your Appwrite database.
- **Data Conversion and Import**: Convert data from various formats and seamlessly import it into your Appwrite project, adhering to new schema definitions.
- **Schema Generation**: Automatically generate TypeScript types from your Appwrite schemas, ensuring type safety and consistency across your application.
- **Comprehensive Utility Functions**: Access a wide range of utility functions for file operations, string manipulation, and more, designed to streamline the migration process.
- **String Templating System**: Need to update a field with a File ID? There's a post-import function for that (including uploading it). Need to reference an item in your import data's JSON fields to update later? Go for it. `"{$id}"` for instance gets replaced with the created documents ID. If it has one, `"{id}"` would be replaced by the JSON items `id` field, `"{dbId}"` the current dataase, `"{createdDoc}"` the created document in this import iteration, and more!
- **Enhanced Data Management**: Handle complex migrations with ease, including managing relationships between collections and converting data for various entities.

This package leverages TypeScript for type safety and is configured to work seamlessly with Appwrite. It's built to support complex migration scenarios, making it an essential tool for developers working with Appwrite projects.

## Usage

After installing the package, you can run various migration-related tasks using the command line. Here are some examples of commands you might use, reflecting the capabilities as defined in `index.ts`:

- **Initialize a New Migration**: Set up your database and prepare it for new migrations. This will also generate schemas but will not import data.

  ```bash
  npx appwrite-utils-migrate --init
  ```

- **Run Migrations in Production**: Apply migrations to your production database.

  ```bash
  npx appwrite-utils-migrate --prod
  ```

- **Run Migrations in Staging**: Apply migrations to your staging database.

  ```bash
  npx appwrite-utils-migrate --staging
  ```

- **Run Migrations in Development**: Apply migrations to your development database.

  ```bash
  npx appwrite-utils-migrate --dev
  ```

- **Wipe Databases**: Wipe your databases. Use with caution.

  ```bash
  npx appwrite-utils-migrate --wipe
  ```

- **Generate Schemas**: Generate TypeScript schemas from your Appwrite database collections.

  ```bash
  npx appwrite-utils-migrate --generate
  ```

- **Import Data**: Import data into your Appwrite project from external sources.

  ```bash
  npx appwrite-utils-migrate --import
  ```

- **Backup Data**: Backup your database data.

  ```bash
  npx appwrite-utils-migrate --backup
  ```

Each command can be combined with others as needed, except for `--init` which runs a specific initialization routine including schema generation but not data import. For example, to run migrations in a development environment and import data, you might use:

```bash
npx appwrite-utils-migrate --dev --import
```

By simplifying the migration process, AppwriteUtils enables developers to focus on building their applications, knowing that their data management and schema updates are handled efficiently.

## Complete List of Converters, afterImportActions, and Validation Rules

### Converters

Converters take a value (in the import data) and convert it, before validating it or processing it
If the converter name has `[arr]` or `[Arr]` anywhere in it, the converter will be run on the array as a whole (assuming it is one), otherwise if it's an array it will run the converter on each item in the array (or string lol)

- `anyToString(value: any): string | null`
- `anyToNumber(value: any): number | null`
- `anyToBoolean(value: any): boolean | null`
- `anyToAnyArray(value: any, separator?: string): any[]`
- `anyToStringArray(value: any): string[]`
- `trySplitByDifferentSeparators(value: string): string[]`
- `removeStartEndQuotes(value: string): string`
- `splitByComma(value: string): string[]`
- `splitByPipe(value: string): string[]`
- `splitBySemicolon(value: string): string[]`
- `splitByColon(value: string): string[]`
- `splitBySlash(value: string): string[]`
- `splitByBackslash(value: string): string[]`
- `splitBySpace(value: string): string[]`
- `splitByDot(value: string): string[]`
- `splitByUnderscore(value: string): string[]`
- `splitByHyphen(value: string): string[]`
- `pickFirstElement(value: any[]): any`
- `pickLastElement(value: any[]): any`
- `stringifyObject(object: any): string`
- `parseObject(jsonString: string): any`
- `safeParseDate(input: string | number): DateTime | null`
- `removeInvalidElements(input: any[]): any[]`

### Validation Rules

Validation Rules are run after converters, and are there to make sure invalid data doesn't get added to your database

- `isNumber(value: any): boolean`
- `isString(value: any): boolean`
- `isBoolean(value: any): boolean`
- `isArray(value: any): boolean`
- `isObject(value: any): boolean`
- `isNull(value: any): boolean`
- `isUndefined(value: any): boolean`
- `isDefined(value: any): boolean`
- `isDate(value: any): boolean`
- `isEmpty(value: any): boolean`
- `isInteger(value: any): boolean`
- `isFloat(value: any): boolean`
- `isArrayLike(value: any): boolean`
- `isArrayLikeObject(value: any): boolean`
- `isFunction(value: any): boolean`
- `isLength(value: any): boolean`
- `isMap(value: any): boolean`
- `isSet(value: any): boolean`
- `isRegExp(value: any): boolean`
- `isSymbol(value: any): boolean`
- `isObjectLike(value: any): boolean`
- `isPlainObject(value: any): boolean`
- `isSafeInteger(value: any): boolean`
- `isTypedArray(value: any): boolean`
- `isEqual(value: any, other: any): boolean`
- `isMatch(object: any, source: any): boolean`
- `has(object: any, path: string): boolean`
- `get(object: any, path: string, defaultValue: any): any`

### After Import Actions

After Import Actions run after the import and do something with the old data, new data, or something else entirely

- Provided Fields:
  - `{dbId}` - Current database ID
  - `{collId}` - Current collection ID
  - `{docId}` - Created document ID
  - `{createdDoc}` - Created document object
  - `any_string` - You can use any string or thing as a value too! (like for data)
  - `{some_template_string}` - The templating system allows you to reference anything in the context of the current
    data you're working with. So for instance, if your imported item has `{ownerId}` and you use `{ownerId}`, it'll reference
    that old JSON item data in the import.

- `updateCreatedDocument(dbId: string, collId: string, docId: string, data: any): Promise<any>`
- `checkAndUpdateFieldInDocument(dbId: string, collId: string, docId: string, fieldName: string, oldFieldValue: any, newFieldValue: any): Promise<any>`
- `setFieldFromOtherCollectionDocument(dbId: string, collIdOrName: string, docId: string, fieldName: string, otherCollIdOrName: string, otherDocId: string, otherFieldName: string): Promise<any>`
- `createOrGetBucket(bucketName: string, bucketId?: string, permissions?: string[], fileSecurity?: boolean, enabled?: boolean, maxFileSize?: number, allowedExtensions?: string[], compression?: string, encryption?: boolean, antivirus?: boolean): Promise<any>`
- `createFileAndUpdateField(dbId: string, collId: string, docId: string, fieldName: string, bucketId: string, filePath: string, fileName: string): Promise<any>`

### Roadmap

- Automatic function creation for backups
- Import database schema from Appwrite Server to `appwriteConfig.yaml` (this week)
- Promise batching to improve speed
- Deduplication checking
- File based migrations
- Fix custom functions, JS is unable to import TS, so need to find the best way to define those
- Add the ability to import between two appwrite projects

### Changelog

- 0.9.982: Made the file upload able to deal with arrays of file imports
- 0.9.981: Made `documentExists` check for the attribute types in the collection due to running into too many problems with arrays
- 0.9.98: Added `[arr]` or `[Arr]` arguments to converters. If you use this value anywhere in the converter string, it will
process the value as the array it is (if it is one), otherwise it will run the converter over the mapped array (if it is one)
- 0.9.96: Update to `safeParseDate`, it wasn't parsing dates very safely...
- 0.9.95: Fixed a context issue with updating documents in their afterActions using their created data
- 0.9.94: Added a bunch of different splitting functions for more fine-grained control and updated how the `trySplitByDifferentSeparators` works to fix the logic. Added converters are above. Also made it so converters and validation actions can take arrays for the item, because why not.
- 0.9.93: Moved relationship resolution to the end
- 0.9.92: forgot I can't use stupid `import something from '@/utils'` in `esbuild`, stupid, I miss Vite :(
- 0.9.91: Added examples to the example setup with `update` importDef type and photos from URL's
- 0.9.90: Rewrote the import process entirely to make it more modular and batched
- 0.9.87 - 0.9.89: Ignore these I was messing up the deployment whooooops
- 0.9.86: I was accidentally including all the code in the NPM package, package size reduced from 2.5 MB -> 53 kB lmao
- 0.9.85: Forgot to make `basePath` optional in `importDefs`, if it's just an array of objects or somethin you don't need it!
- 0.9.84: jk I use `targetKey` a lot, so set it you lazy nerds! (myself included)
- 0.9.83: Made `targetKey` optional too, whoops
- 0.9.82: Fixed schema to allow `oldKey` or `oldKeys`
- 0.9.81: Added the ability to match a nested objects properties using `[any]` in your template string. So if you have a nested object

```json
"RECORDS": [
  {
    "someObject": {
      "someValue": {
        "id": 3,
      },
      "anotherValue": {
        "id": 4,
      }
    }
  }
]
```

You can resolve the ID's by getting the first one using `"oldKey": "someObject.[any].id"` with a converter of `converters: ["pickFirstElement"]` or get all of them by using `"oldKeys": "someObject.[any].id"` -- this also works in `fileData`

- 0.9.8: Resolved an issue that would have arisen from not checking for the url in the `fileData` before y'all used it (if y'all is anyone) -- also made sure to fix the type defs in CustomDefinitions
- 0.9.7: Added the ability for the `path` field in the `fileData` of the `importDefs` to be a URL, for laziness!
- 0.9.69422: Added `type` and `updateMapping` optionally to `importDefs` so you can run a second file to update the first one, if needed
- 0.9.6942: Added `removeInvalidElements` converter
- 0.9.69: Added `oldKeys` to `importDefs` so you can concatenate multiple keys to one for an array. Also added five new converter functions, `anyToStringArray`, `pickFirstElement`, `pickLastElement`, `stringifyObject`, `parseObject`, and a new validator, `isDefined` for when you just need to know if something is, well, defined (!undefined, !null, and !empty). I also fixed the exports for the types for the custom definitions, my bad!
- 0.9.6: Fixed schema error in enum
- 0.9.5: oops I named it `setup` and `migrate` lmao, now it's `appwrite-utils-setup` & `appwrite-utils-migrate`
- 0.9.4: Turns out you gotta import js files in modules, whoops
- 0.9.3: Added `bin` section to package.json and "shebang" to top of `main.ts` and `setup.ts` to enable `npx`
- 0.9.2: I forget what I did here
- 0.9.1: Ignore this one
- 0.9.1: Added roadmap 😍
- 0.9.0: Initial refactor into AppwriteUtils package for ease of use
