# appwrite-utils

## Overview

`appwrite-utils` is a comprehensive TypeScript library designed to streamline the development process for Appwrite projects. This library provides a suite of utilities and helper functions that facilitate data manipulation, schema management, YAML configuration validation, and seamless integration with Appwrite services. Whether you're managing data migrations, schema updates, or building custom tools on top of the CLI architecture, `appwrite-utils` provides the foundation for professional Appwrite development.

**Version 1.6.1**: Internal improvements for better code organization and maintainability.

## Features

### Core Utilities
- **Validation Functions**: Comprehensive validation suite ensuring data integrity throughout your Appwrite projects
- **Converter Functions**: Advanced data transformation utilities supporting the CLI's import system
- **Type Definitions**: Complete TypeScript definitions for Appwrite collections, attributes, and configurations
- **Schema Management**: Robust schema definitions supporting both TypeScript and YAML configurations

### Dual API Support (Collections & TablesDB)
- **Collections API**: Traditional Appwrite collections with document-based terminology
- **TablesDB API**: New table-based API with column terminology for enhanced performance
- **Dual Terminology**: Seamless support for both `collections/documents/attributes` and `tables/rows/columns`
- **Automatic Adaptation**: Smart API detection and adapter selection based on configuration
- **Migration Support**: Type-safe migration paths between Collections and TablesDB APIs

### CLI Integration
- **YAML Configuration Support**: Type-safe definitions for YAML-first architecture
- **Import System Types**: Complete type definitions for the CLI's modular import system
- **Validation Rules**: Extensive validation rules used by the CLI's import validation system
- **File Operations**: Advanced file utilities supporting URL downloads and local file handling

### Advanced Features
- **Permission Management**: Simplified permission handling with conversion utilities
- **Function Definitions**: Complete type support for Appwrite Function configurations
- **Authentication Schemas**: Robust user authentication and validation schemas
- **Cross-Platform Compatibility**: Designed for seamless integration across development environments

## Installation

To integrate `appwrite-utils` into your project, ensure you have npm installed and run the following command in your project directory:

```bash
npm install appwrite-utils
```

## TablesDB & Collections Support

`appwrite-utils` provides seamless support for both traditional Appwrite Collections API and the new TablesDB API, allowing you to work with either terminology based on your project needs.

### API Modes

#### Collections API (Traditional)
- **Container**: `collections`
- **Items**: `documents`
- **Fields**: `attributes`
- **Service**: `Databases`

#### TablesDB API (New)
- **Container**: `tables`
- **Items**: `rows`
- **Fields**: `columns`
- **Service**: `TablesDB`

### Schema Definitions

Both APIs share the same underlying schema structure with dual terminology support:

```typescript
import {
  CollectionCreateSchema,
  TableCreateSchema,
  CollectionSchema,
  TableSchema
} from "appwrite-utils";

// Collections API - Document-based terminology
const collection = CollectionCreateSchema.parse({
  name: "Users",
  attributes: [
    { key: "email", type: "string", required: true },
    { key: "name", type: "string", required: true }
  ],
  indexes: [
    { key: "email_idx", type: "unique", attributes: ["email"] }
  ]
});

// TablesDB API - Table-based terminology
const table = TableCreateSchema.parse({
  name: "Users",
  attributes: [ // Note: Still uses 'attributes' internally for compatibility
    { key: "email", type: "string", required: true },
    { key: "name", type: "string", required: true }
  ],
  indexes: [
    { key: "email_idx", type: "unique", attributes: ["email"] }
  ]
});
```

### Type Safety

```typescript
import type {
  Collection,
  Table,
  CollectionCreate,
  TableCreate
} from "appwrite-utils";

// Both types are structurally identical but semantically different
const handleCollection = (collection: Collection) => {
  // Work with traditional collections
  console.log(`Collection: ${collection.name}`);
  console.log(`Attributes: ${collection.attributes.length}`);
};

const handleTable = (table: Table) => {
  // Work with TablesDB tables
  console.log(`Table: ${table.name}`);
  console.log(`Columns: ${table.attributes.length}`); // Note: Still 'attributes' for compatibility
};
```

### Configuration Examples

#### YAML Configuration - Collections Mode
```yaml
# .appwrite/config.yaml
databases:
  - name: "main"
    id: "main"
    collections:  # Collections terminology
      - name: "Users"
        id: "users"
        attributes:
          - key: "email"
            type: "string"
            required: true
```

#### YAML Configuration - TablesDB Mode
```yaml
# .appwrite/config.yaml
databases:
  - name: "main"
    id: "main"
    tables:  # TablesDB terminology
      - name: "Users"
        id: "users"
        attributes:  # Internally consistent with Collections
          - key: "email"
            type: "string"
            required: true
```

### Migration Between APIs

```typescript
import { CollectionCreateSchema, TableCreateSchema } from "appwrite-utils";

// Convert Collection definition to Table
const collectionConfig = {
  name: "Users",
  attributes: [{ key: "email", type: "string" }]
};

// Both schemas are compatible
const asCollection = CollectionCreateSchema.parse(collectionConfig);
const asTable = TableCreateSchema.parse(collectionConfig);

// Seamless interoperability
console.log(asCollection.name === asTable.name); // true
```

### Best Practices

1. **Choose One Terminology**: Stick to either Collections or TablesDB terminology throughout your project
2. **Configuration Consistency**: Use consistent terminology in YAML configurations
3. **Type Safety**: Leverage TypeScript types for your chosen API mode
4. **Migration Planning**: Plan migrations carefully when switching between APIs

## Utilities

### Validation Functions

These functions help ensure the integrity and correctness of the data in your Appwrite projects:

```typescript
isNumber,
  isString,
  isBoolean,
  isArray,
  isObject,
  isNull,
  isUndefined,
  isDefined,
  isDate,
  isEmpty,
  isInteger,
  isFloat,
  isArrayLike,
  isArrayLikeObject,
  isFunction,
  isLength,
  isMap,
  isSet,
  isRegExp,
  isSymbol,
  isObjectLike,
  isPlainObject,
  isSafeInteger,
  isTypedArray,
  isEqual,
  isMatch,
  has,
  get;
```

### Converter Functions

Converters are designed to transform data formats or types to suit specific needs within your applications:

```typescript
anyToString,
  anyToNumber,
  anyToBoolean,
  anyToAnyArray,
  anyToStringArray,
  trySplitByDifferentSeparators,
  removeStartEndQuotes,
  splitByComma,
  splitByPipe,
  splitBySemicolon,
  splitByColon,
  splitBySlash,
  splitByBackslash,
  splitBySpace,
  splitByDot,
  splitByUnderscore,
  splitByHyphen,
  pickFirstElement,
  pickLastElement,
  stringifyObject,
  parseObject,
  safeParseDate,
  removeInvalidElements,
  joinValues,
  joinBySpace,
  joinByComma,
  joinByPipe,
  joinBySemicolon,
  joinByColon,
  joinBySlash,
  joinByHyphen,
  convertPhoneStringToUSInternational,
  validateOrNullEmail;
```

### File Functions

These functions facilitate the management and operation of files within your Appwrite projects:

```typescript
getFileViewUrl, getFileDownloadUrl;
```

Both `getFileViewUrl` and `getFileDownloadUrl` take parameters like `endpoint`, `projectId`, `bucketId`, `fileId`, and optionally `jwt` to generate accessible URLs for files stored in Appwrite.

## Usage

After installing the package, you can directly import and use the various utilities in your TypeScript or JavaScript code. For example:

```typescript
import { isNumber, anyToString } from "appwrite-utils";

// Use the functions directly in your code
console.log(isNumber(5)); // Output: true
console.log(anyToString(1234)); // Output: "1234"
```

This setup ensures that your interactions with Appwrite are more robust, less error-prone, and significantly more manageable.

## CLI Integration

Version 1.0.0 is designed to work seamlessly with `appwrite-utils-cli`'s YAML-first architecture:

### Import System Integration

```typescript
import { 
  YamlImportConfig, 
  AttributeMappings,
  ValidationRules,
  ConverterFunctions 
} from "appwrite-utils";

// Type-safe YAML import configuration
const importConfig: YamlImportConfig = {
  source: {
    file: "importData/users.json",
    basePath: "RECORDS",
    type: "json"
  },
  target: {
    collection: "Users",
    type: "create",
    primaryKey: "user_id",
    createUsers: true
  },
  mapping: {
    attributes: [
      {
        oldKey: "email",
        targetKey: "email",
        converters: ["anyToString", "stringToLowerCase"],
        validation: [
          { rule: "email", params: ["{email}"] },
          { rule: "required", params: ["{email}"] }
        ]
      }
    ]
  }
};
```

### Schema Validation

```typescript
import { 
  CollectionCreateSchema,
  AttributeSchema,
  AppwriteConfigSchema 
} from "appwrite-utils";

// Validate YAML configurations with Zod schemas
const validatedConfig = AppwriteConfigSchema.parse(yamlConfig);
const validatedCollection = CollectionCreateSchema.parse(collectionData);
```

### Advanced Utilities

```typescript
import {
  convertObjectByAttributeMappings,
  tryAwaitWithRetry,
  parsePermissions,
  getFileViewUrl,
  objectNeedsUpdate,
  cleanObjectForAppwrite,
  listDocumentsBatched
} from "appwrite-utils";

// Data transformation used by CLI import system
const transformedData = convertObjectByAttributeMappings(sourceData, mappings);

// Retry logic for reliable API calls
const result = await tryAwaitWithRetry(() => 
  databases.createDocument(dbId, collId, docId, data)
);

// Permission conversion for YAML configurations
const appwritePermissions = parsePermissions(yamlPermissions);

// Check if an object needs updating (ignores Appwrite system fields)
const needsUpdate = objectNeedsUpdate(existingDoc, updatedData);

// Clean object for Appwrite operations (removes system fields)
const cleanData = cleanObjectForAppwrite(dataWithSystemFields);

// Query documents in batches (Appwrite limits Query.equal to 100 IDs)
const documents = await listDocumentsBatched(
  databases, 
  databaseId, 
  collectionId, 
  "$id", 
  arrayOfIds
);
```

## Changelog

### 1.6.0 - TablesDB Support & Dual API Terminology

**🚀 Major Release - Full TablesDB Integration & Dual Terminology Support**

#### New Features
- **TablesDB Schema Support**: Complete type definitions for the new Appwrite TablesDB API
  - `TableSchema`, `TableCreateSchema`, and `TablesSchema` exports
  - Full compatibility with Collections API schemas
  - Seamless interoperability between Collections and TablesDB configurations

- **Dual Terminology Support**: Native support for both API terminologies
  - Collections API: `collections`, `documents`, `attributes`
  - TablesDB API: `tables`, `rows`, `columns` (Note: internally uses `attributes` for compatibility)
  - Type-safe schemas for both modes with identical underlying structure

- **Enhanced Type Definitions**: New TypeScript types for TablesDB integration
  - `Table`, `Tables`, `TableCreate` types exported alongside existing Collection types
  - Structural compatibility ensures seamless migration between APIs
  - Full IntelliSense support for both terminology sets

#### Developer Experience
- **Configuration Flexibility**: YAML configurations support both `collections` and `tables` arrays
- **Migration Ready**: Zero-breaking-change migration between Collections and TablesDB
- **Type Safety**: Complete TypeScript support maintains type safety across both APIs
- **Documentation**: Comprehensive examples and best practices for dual API usage

#### Technical Implementation
- **Schema Validation**: Zod schemas validate both terminology formats with shared validation logic
- **Export Consistency**: All existing exports maintained while adding TablesDB counterparts
- **Compatibility Layer**: Internal attribute handling ensures consistency across both APIs

#### Usage Examples
```typescript
// Collections Mode
import { CollectionCreateSchema } from "appwrite-utils";

// TablesDB Mode
import { TableCreateSchema } from "appwrite-utils";

// Both schemas accept identical configuration objects
const config = { name: "Users", attributes: [...] };
```

**Migration Note**: This release is fully backward compatible. Existing Collections API usage continues to work unchanged while TablesDB support is available for new projects or gradual migration.

### 1.5.0 - Relationship Schema Relaxation (Two-Way Optional Keys)

- RelationshipAttribute: `twoWayKey` and `side` are now optional unless `twoWay: true`.
- Added validation guard to require both fields when `twoWay` is enabled.
- Improves compatibility with one-way relationships and CLI push flows.

### 1.3.0 - Zod v4 Upgrade & Enhanced Collection Management

**🎉 Major Release - Zod v4 Compatibility & Performance Improvements**

#### Breaking Changes
- **Zod v4 Upgrade**: Updated to Zod v4.0.0 for enhanced schema validation
  - ⚠️ **Potential Breaking Change**: Some schema validations may behave differently
  - Function event types are now more flexible to accommodate Zod v4 changes
  - Review your validation schemas if you experience issues

#### Enhanced Collection Management
- **Optimized Attribute Creation**: Fixed duplicate attribute creation issue
  - Attributes are now only created/updated when needed
  - Improved filtering logic to skip unchanged attributes
  - Better status monitoring and error handling

- **Fixed Index Creation**: Resolved indexes not being created from collection configs
  - Proper null checks for index arrays from different collection sources
  - Enhanced index creation with status monitoring
  - Better error handling and retry logic

#### Performance Improvements
- **Smart Filtering**: Collections now skip processing unchanged attributes
- **Status Monitoring**: Enhanced attribute and index creation with real-time status checking
- **Better Error Handling**: Improved retry logic for failed operations

#### Developer Experience
- **Build Stability**: Resolved TypeScript compilation issues with function schemas
- **Type Safety**: Maintained strict typing while accommodating Zod v4 changes
- **Better Logging**: Enhanced progress reporting during collection operations

#### Migration Guide
1. **Update Dependencies**: Ensure compatibility with Zod v4.0.0
2. **Test Validations**: Review any custom validation schemas for potential breaking changes
3. **Function Events**: Function event arrays are now `string[]` instead of strictly typed enums for flexibility

**Integration Note**: This version provides enhanced reliability for collection management operations and full Zod v4 compatibility.

---

### 1.0.0 - YAML-First Architecture Integration

**🎉 Major Release - CLI Architecture Alignment**

#### YAML Configuration Support
- **Complete type definitions** for YAML-first configuration architecture
- **YamlImportConfig types** with full validation schema support
- **Cross-platform compatibility** removing TypeScript runtime dependencies
- **JSON Schema integration** for enhanced developer experience with IntelliSense

#### Enhanced Import System Integration
- **Modular import types** supporting the CLI's refactored import architecture
- **Advanced validation rules** used by the CLI's validation service
- **Sophisticated converter functions** supporting the enhanced data transformation pipeline
- **File handling utilities** for URL downloads and local file operations
- **Rate limiting types** for configurable performance optimization

#### New Type Definitions
- **Import Configuration Types**: Complete type safety for YAML import configurations
- **Service Interface Types**: Type definitions for the CLI's modular service architecture
- **Validation Schema Types**: Enhanced validation rules with parameter support
- **Relationship Mapping Types**: Advanced cross-collection relationship definitions
- **Progress Tracking Types**: Type definitions for progress monitoring and statistics

#### New Utility Functions
- **`objectNeedsUpdate`**: Compares existing and updated objects, filtering out Appwrite system fields to determine if an update is needed
- **`cleanObjectForAppwrite`**: Removes Appwrite system fields (`$id`, `$createdAt`, `$updatedAt`, `$permissions`, etc.) from objects before create/update operations
- **`listDocumentsBatched`**: Handles batched document queries since Appwrite only supports 100 IDs at a time in `Query.equal()`

#### Enhanced Existing Features
- **Permission system updates** with better YAML integration
- **Function configuration types** aligned with CLI's function management
- **Schema generation types** supporting both TypeScript and JSON Schema output
- **Authentication types** enhanced for user deduplication features

#### Developer Experience Improvements
- **Better TypeScript inference** for YAML configuration objects
- **Enhanced error types** with detailed validation feedback
- **Improved documentation** with integration examples
- **Cross-package compatibility** ensuring seamless CLI integration

#### Backward Compatibility
- **Full backward compatibility** with existing TypeScript configurations
- **Legacy type support** maintained for smooth migration
- **Incremental adoption** allowing gradual migration to YAML

**Integration Note**: This version is specifically designed to work with `appwrite-utils-cli` 1.0.0's YAML-first architecture while maintaining full backward compatibility.

---

### Previous Versions

- **0.4.1**: Removed `ulidx` requirement as it was breaking Cloudflare Builds
- **0.4.0**: Updated Function scopes to include messaging and other
- **0.3.99**: Updated Function schema to have the template vars as well
- **0.3.98**: Updated Function schema to have a `string[]` var called `ignore` -- to ignore files
- **0.3.97**: Added function deployment through Appwrite Utils CLI, specified through AppwriteConfig
- **0.3.96**: Added `SpecificationSchema, type Specification` type defs to support updating function specifications
- **0.3.95**: Updated `safeParseDate` to handle formats like `8:00AM` vs `8:00 AM` -- spaces matter!
- **0.3.94**: Updated `getFilePreviewUrl` -- it was missing the `&` if you didn't use a JWT
- **0.3.92**: Added a `getFilePreviewUrl` which allows you to modify image files, or just get a preview of a file
- **0.3.91**: Updated permissions to include `parsePermissions` which maps permissions to Appwrite strings
- **0.2.8**: Added `valueToSet` to attributeMappings, allowing you to set literal values in importDefs
- **0.2.6**: Added `tryAwaitWithRetry` which retries failed API calls up to 5 times
- **0.2.3**: Added OpenAPI descriptions to AuthUserSchema for better schema generation
- **0.1.21**: Changed `ID.unique()` to `ulid()` for random ID generation, refactored schema files
