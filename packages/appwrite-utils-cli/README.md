# appwrite-utils-cli

## Overview

`appwrite-utils-cli` is a powerful, YAML-first command-line interface tool designed for Appwrite developers who need to manage database migrations, schema generation, data import, and comprehensive project management. Built on a modular architecture with enhanced performance, this CLI tool facilitates complex tasks like setting up databases, running migrations, generating schemas, and managing backups efficiently. With version 1.0.0, the CLI introduces a completely refactored import system with 50%+ complexity reduction, YAML-first configuration, and sophisticated data handling capabilities.

## Features

### Core Capabilities
- **YAML-First Configuration**: Modern YAML-based configuration with JSON Schema support for IntelliSense
- **Interactive Mode**: Professional guided CLI experience with rich visual feedback and progress tracking
- **Modular Import System**: Completely refactored import architecture with 50%+ complexity reduction
- **Enhanced Performance**: Configurable rate limiting and batch processing for optimal performance
- **Safety First**: Smart confirmation dialogs for destructive operations with explicit confirmations

### Data Management
- **Advanced Data Import**: YAML-configured imports with sophisticated file handling, URL support, and user deduplication
- **Relationship Resolution**: Intelligent cross-collection relationship mapping and ID resolution
- **User Management**: Advanced user deduplication with email/phone matching and merge capabilities
- **File Operations**: Complete file handling with URL downloads, local file search, and afterImportActions
- **Backup Management**: Comprehensive backup system with progress tracking and detailed reporting

### Development Tools
- **Database Migrations**: Full migration control with progress tracking and operation summaries
- **Schema Generation**: Generate TypeScript and JSON schemas from database configurations
- **Constants Generation**: Generate cross-language constants files (TypeScript, Python, PHP, Dart, JSON, Env) for database, collection, bucket, and function IDs
- **Data Transfer**: Transfer data between databases, collections, and instances with real-time progress
- **Configuration Sync**: Bidirectional synchronization between local YAML configs and Appwrite projects
- **Function Management**: Deploy and manage Appwrite Functions with specification updates

## Installation

To use `appwrite-utils-cli`, you can install it globally via npm to make it accessible from anywhere in your command line:

```bash
npm install -g appwrite-utils-cli
```

However, due to the rapid development of this project, it's recommended to use the following command:

```bash
npx --package=appwrite-utils-cli@latest appwrite-migrate [options]
```

**Note: Do not install this locally into your project. It is meant to be used as a command-line tool only.**

## YAML-First Configuration

Version 1.0.0 introduces a YAML-first approach for better cross-platform compatibility and enhanced developer experience.

### Configuration Structure

The CLI automatically detects configuration files in this order:
1. `.appwrite/config.yaml` (recommended)
2. `appwrite.yaml`
3. `appwriteConfig.ts` (legacy, still supported)

### YAML Configuration Example

```yaml
# .appwrite/config.yaml with JSON Schema support
# yaml-language-server: $schema=./.yaml_schemas/appwrite-config.schema.json

appwriteEndpoint: "https://cloud.appwrite.io/v1"
appwriteProject: "your-project-id"
appwriteKey: "your-api-key"

databases:
  - name: "main"
    id: "main"
    collections:
      - name: "Users"
        id: "users"
        attributes:
          - key: "email"
            type: "string"
            required: true
            format: "email"

buckets:
  - name: "documents"
    id: "documents"
    permissions:
      - target: "any"
        permission: "read"

logging:
  enabled: false  # Disabled by default
  level: "info"
  console: true
```

## Usage

After installation, you can access the tool directly from your command line using the provided commands.

### Interactive Mode

Run the CLI in interactive mode with enhanced visual feedback:

```bash
npx --package=appwrite-utils-cli@latest appwrite-migrate --it
```

This provides a professional guided experience with:
- Rich visual feedback and progress tracking
- Smart confirmation dialogs for destructive operations
- Operation summaries with detailed statistics
- Real-time progress bars with ETA calculations

### Non-Interactive Mode

You can also use specific flags to run tasks without the interactive prompt:

```bash
npx --package=appwrite-utils-cli@latest appwrite-migrate [options]
```

## YAML Import Configuration System

Version 1.0.0 introduces a powerful YAML-based import system with sophisticated data handling capabilities.

### Import Configuration Example

```yaml
# .appwrite/import/users-import.yaml
# yaml-language-server: $schema=../.yaml_schemas/import-config.schema.json

source:
  file: "importData/users.json"
  basePath: "RECORDS"
  type: "json"

target:
  collection: "Users"
  type: "create"
  primaryKey: "user_id"
  createUsers: true

mapping:
  attributes:
    - oldKey: "user_id"
      targetKey: "userId"
      converters: ["anyToString"]
      validation:
        - rule: "required"
          params: ["{userId}"]

    - oldKey: "profile_image_url"
      targetKey: "avatar"
      fileData:
        path: "{profile_image_url}"
        name: "{user_id}_avatar"
      afterImport:
        - action: "createFileAndUpdateField"
          params: ["{dbId}", "{collId}", "{docId}", "avatar", "{bucketId}", "{filePath}", "{fileName}"]

  relationships:
    - sourceField: "department_id"
      targetField: "departmentId"
      targetCollection: "Departments"

options:
  batchSize: 50
  continueOnError: true
```

### Import System Features

- **File Handling**: Complete support for URL downloads and local file search
- **User Deduplication**: Sophisticated email/phone matching with merge capabilities
- **Rate Limiting**: Configurable p-limit for optimal performance (5 concurrent by default)
- **Relationship Resolution**: Intelligent cross-collection ID mapping
- **Validation**: Pre-import validation with detailed error reporting
- **Progress Tracking**: Real-time progress bars with batch processing statistics
- **AfterImportActions**: Complete post-import action system for file uploads and field updates

## Command-Line Options

Available options:

### Core Operations
- `--it`: Run in interactive mode with enhanced visual feedback
- `--setup`: Create setup files (supports both YAML and TypeScript)
- `--generate`: Generate TypeScript and JSON schemas from database configurations
- `--import`: Import data using YAML configurations with advanced processing
- `--backup`: Comprehensive backup with progress tracking and detailed reporting

### Data Management
- `--dbIds`: Comma-separated list of database IDs to operate on
- `--collectionIds`: Comma-separated list of collection IDs to operate on
- `--bucketIds`: Comma-separated list of bucket IDs to operate on
- `--wipe`: Wipe data with smart confirmation (all: everything, docs: only documents, users: only user data)
- `--wipeCollections`: Non-destructively wipe specified collections
- `--writeData`: Write converted imported data to file for validation

### Configuration & Synchronization
- `--push`: Push local YAML/TypeScript config to Appwrite project
- `--sync`: Synchronize by pulling config from Appwrite project
- `--endpoint`: Set the Appwrite endpoint
- `--projectId`: Set the Appwrite project ID
- `--apiKey`: Set the Appwrite API key

### Transfer Operations
- `--transfer`: Transfer data between databases or collections with progress tracking
- `--transfer-users`: Transfer users between instances (will not overwrite)
- `--fromDbId` / `--sourceDbId`: Source database ID for transfer
- `--toDbId` / `--targetDbId`: Destination database ID for transfer
- `--fromCollectionId`: Source collection ID for transfer
- `--toCollectionId`: Destination collection ID for transfer
- `--fromBucketId`: Source bucket ID for transfer
- `--toBucketId`: Destination bucket ID for transfer
- `--remoteEndpoint`: Remote Appwrite endpoint for transfers
- `--remoteProjectId`: Remote Appwrite project ID for transfers
- `--remoteApiKey`: Remote Appwrite API key for transfers

### Function Management
- `--updateFunctionSpec`: Update function specifications
- `--functionId`: Function ID to update
- `--specification`: New function specification (s-0.5vcpu-512mb to s-8vcpu-8gb)

### Constants Generation
- `--generateConstants` / `--constants`: Generate cross-language constants files with database, collection, bucket, and function IDs
- `--constantsLanguages`: Comma-separated list of languages for constants generation (default: typescript)
  - Available languages: `typescript`, `javascript`, `python`, `php`, `dart`, `json`, `env`
- `--constantsOutput`: Output directory for generated constants files (default: config-folder/constants)

## Examples

### Generate Constants

Generate cross-language constants files for all your Appwrite resource IDs:

```bash
# Generate TypeScript constants (default)
npx appwrite-utils-cli appwrite-migrate --generateConstants

# Generate multiple language formats
npx appwrite-utils-cli appwrite-migrate --generateConstants --constantsLanguages="typescript,python,php,json"

# Generate all available formats
npx appwrite-utils-cli appwrite-migrate --generateConstants --constantsLanguages="typescript,javascript,python,php,dart,json,env"

# Generate with custom output directory
npx appwrite-utils-cli appwrite-migrate --generateConstants --constantsOutput="./my-constants"
```

This generates constants files in your configuration directory (e.g., `.appwrite/constants/`) containing:
- Database IDs
- Collection IDs  
- Bucket IDs
- Function IDs

**Example TypeScript output:**
```typescript
export const DATABASE_IDS = {
  MAIN_DATABASE: "main"
} as const;

export const COLLECTION_IDS = {
  USERS: "01JYDBQTB5W8SCBAYB654CCADQ",
  POSTS: "01JYDBQTB5W8SCBAYB654POSTS"
} as const;

// Type helpers and utility arrays included
export type DatabaseId = typeof DATABASE_IDS[keyof typeof DATABASE_IDS];
```

### Transfer Databases

Transfer databases within the same project or from a local to a remote project:

```bash
npx appwrite-utils-cli appwrite-migrate --transfer --fromDbId sourceDbId --toDbId targetDbId --remoteEndpoint https://appwrite.otherserver.com --remoteProjectId yourProjectId --remoteApiKey yourApiKey
```

### Transfer Specific Collections

Transfer specific collections from one place to another, with all of their data:

```bash
npx appwrite-utils-cli appwrite-migrate --transfer --fromDbId sourceDbId --toDbId targetDbId --fromCollectionId sourceCollectionId --toCollectionId targetCollectionId --remoteEndpoint https://appwrite.otherserver.com --remoteProjectId yourProjectId --remoteApiKey yourApiKey
```

### Transfer Buckets

Transfer files between buckets:

```bash
npx appwrite-utils-cli appwrite-migrate --transfer --fromBucketId sourceBucketId --toBucketId targetBucketId --remoteEndpoint https://appwrite.otherserver.com --remoteProjectId yourProjectId --remoteApiKey yourApiKey
```

### Update Function Specifications

**NOTE: IF IT DOES NOT WORK AND YOU ARE SELF-HOSTED, PLEASE SET MAX CPU_PER_FUNCTION AND RAM_PER_FUNCTION IN YOUR ENV VARS TO > 0, THIS IS A BUG IN 1.6.0 -- YOU SET THE FUNCTION RAM IN MB**

Update the CPU and RAM specifications for a function:

```bash
npx appwrite-utils-cli appwrite-migrate --updateFunctionSpec --functionId yourFunctionId --specification s-1vcpu-1gb
```

Available specifications:

- s-0.5vcpu-512mb: 0.5 vCPU, 512MB RAM
- s-1vcpu-1gb: 1 vCPU, 1GB RAM
- s-2vcpu-2gb: 2 vCPU, 2GB RAM
- s-2vcpu-4gb: 2 vCPU, 4GB RAM
- s-4vcpu-4gb: 4 vCPU, 4GB RAM
- s-4vcpu-8gb: 4 vCPU, 8GB RAM
- s-8vcpu-4gb: 8 vCPU, 4GB RAM
- s-8vcpu-8gb: 8 vCPU, 8GB RAM

## Additional Notes

- If you run out of RAM during large data imports, you can increase Node's memory allocation:

  ```bash
  export NODE_OPTIONS="--max-old-space-size=16384"
  ```

  This sets the allocation to 16GB. For most cases, 8GB (`8192`) should be sufficient.

- The CLI now supports OpenAPI generation for each attribute in the schema. Add a `description` to any attribute or collection, and it will export that schema to the `appwrite/openapi` folder.

This updated CLI ensures that developers have robust tools at their fingertips to manage complex Appwrite projects effectively from the command line, with both interactive and non-interactive modes available for flexibility.

## Changelog

### 1.0.8 - Comprehensive Transfer System with Enhanced Rate Limiting

**🚀 Complete Cross-Instance Transfer Solution**

#### Comprehensive Transfer System
- **New CLI Option**: `🚀 Comprehensive transfer (users → databases → buckets → functions)` in interactive mode
- **Orchestrated Transfer Flow**: Proper execution order (users → databases → buckets → functions) for dependency management
- **Cross-Instance Support**: Transfer entire Appwrite configurations between different instances/projects
- **Selective Transfer**: Choose which components to transfer (users, databases, buckets, functions)
- **Dry Run Mode**: Test transfers without making actual changes

#### Enhanced Rate Limiting Strategy
- **Configurable Limits**: 5 to 100 concurrent operations in steps of 5
- **Differentiated Rates**: Smart rate limiting based on operation type:
  - **General Operations**: Full rate (databases, functions)
  - **User Operations**: Half rate (more sensitive operations)
  - **File Operations**: Quarter rate (most bandwidth intensive)
- **Visual Feedback**: Real-time rate limit display during transfers
- **Intelligent Scaling**: Automatic calculation of optimal rates for different operations

#### File Transfer Enhancements
- **File Validation**: Comprehensive integrity checking (empty files, size limits)
- **Retry Logic**: Exponential backoff for failed file transfers
- **Error Handling**: Graceful handling of corrupt/invalid files
- **Progress Tracking**: Real-time progress for large file transfers

#### Function Transfer Integration
- **Automated Function Migration**: Download from source, redeploy to target
- **Temporary Management**: Automatic cleanup of downloaded function code
- **Existing Code Integration**: Leverages existing deployment infrastructure
- **Configuration Preservation**: Maintains function settings and variables

#### User Experience Improvements
- **Password Reset Warnings**: Clear notifications about Appwrite password limitations
- **Interactive Configuration**: Step-by-step prompts for source/target setup
- **Comprehensive Reporting**: Detailed transfer summaries with statistics
- **Smart Confirmations**: Risk-based confirmations for destructive operations

#### Technical Implementation
- **Rate Limiting**: Uses p-limit for concurrent operation control
- **Error Resilience**: Robust error handling with detailed user feedback
- **Memory Management**: Efficient processing of large datasets
- **Progress Tracking**: Real-time progress bars with ETA calculations

#### Usage Examples
```bash
# Interactive mode - select comprehensive transfer
npx appwrite-utils-cli@latest appwrite-migrate --it

# Example rate limiting at 20 concurrent:
# - General operations: 20 concurrent
# - User operations: 10 concurrent  
# - File operations: 5 concurrent
```

**Benefits**:
- Complete Appwrite instance migration capability
- Intelligent rate limiting prevents API throttling
- Enhanced file transfer reliability
- Comprehensive progress tracking and reporting
- Maintains data integrity across transfers

### 1.0.7 - Forgot to remove debug logs

### 1.0.6 - Cross-Language Constants Generation

**🚀 Enhanced Developer Experience with Multi-Language Constants**

#### Constants Generation System
- **Cross-Language Support**: Generate constants in 7 languages for seamless multi-platform development
  - **TypeScript**: Type-safe constants with `as const` and helper types
  - **JavaScript**: ES6 modules with utility arrays
  - **Python**: Class-based constants with snake_case dictionaries
  - **PHP**: Static class methods and associative arrays
  - **Dart**: Maps with individual getter methods (camelCase)
  - **JSON**: Structured data with metadata for cross-platform integration
  - **Environment Variables**: Prefixed environment variables for deployment
- **Smart Directory Structure**: Constants generated in `{config-folder}/constants/` by default
- **CLI Integration**: Both command-line and interactive mode support
- **Custom Output**: Support for custom output directories when needed

#### Resource ID Extraction
- **Database IDs**: Extract all configured database identifiers
- **Collection IDs**: Generate constants for all collection ULIDs/names
- **Bucket IDs**: Include storage bucket identifiers
- **Function IDs**: Support for Appwrite Function identifiers
- **Naming Conventions**: Language-appropriate naming (UPPER_CASE, camelCase, snake_case)

#### Developer Experience Improvements
- **Interactive Mode**: Checkbox selection for languages with smart defaults
- **CLI Commands**: Simple `--generateConstants` with language and output options
- **Type Safety**: Full TypeScript support with generated types and helpers
- **Cross-Platform Compatibility**: Enable seamless development across different tech stacks

#### Usage Examples
```bash
# Default TypeScript generation
npx appwrite-utils-cli appwrite-migrate --generateConstants

# Multi-language generation
npx appwrite-utils-cli appwrite-migrate --generateConstants --constantsLanguages="typescript,python,php,json"

# All formats with custom output
npx appwrite-utils-cli appwrite-migrate --generateConstants --constantsLanguages="typescript,javascript,python,php,dart,json,env" --constantsOutput="./constants"
```

**Migration Benefits**: 
- Eliminates hardcoded resource IDs across codebases
- Enables type-safe resource access in TypeScript projects
- Supports multi-language development workflows
- Maintains constants alongside configuration for easy maintenance

### 1.0.1 - Function Templates & Attribute Type Improvements

**🚀 Enhanced Function Management & Type System Fixes**

#### Function Template System Improvements
- **ES Module Compatibility**: Fixed `__dirname is not defined` error when creating function templates
- **Template-Specific Defaults**: Added pre-configured settings for all function templates:
  - `typescript-node`: Node.js 21.0, TypeScript build setup, 0.5vCPU/512MB
  - `uv`: Python 3.12, UV package manager, 0.5vCPU/512MB  
  - `count-docs-in-collection`: Node.js 21.0, specialized counting function, 1vCPU/512MB
- **YAML Config Integration**: Functions now automatically added to YAML config with generated ULIDs
- **Interactive Enhancement**: Improved template selection with descriptive names and smart defaults

#### YAML Collections Loading Fix
- **Path Resolution**: Fixed collections directory resolution for YAML configurations
- **Cross-Platform Support**: Collections now properly detected in `.appwrite/collections/` regardless of config location
- **Backwards Compatibility**: Both TypeScript and YAML collection structures fully supported

#### Attribute Type System Overhaul
- **Double/Float Compatibility**: Resolved Zod discriminated union errors with proper schema separation
- **Backwards Compatibility**: Full support for both "double" and "float" attribute types
- **Schema Architecture**: Clean separation with shared base schema for numeric attributes
- **Type Safety**: Enhanced TypeScript support with proper type inference

#### Developer Experience Improvements
- **Error Resolution**: Eliminated all TypeScript compilation errors
- **Template Updates**: Updated function template references from deprecated "poetry" to "uv"
- **Schema Validation**: Improved attribute validation with better error messages
- **Clean Architecture**: Removed deprecated relationship attributes for better performance

#### Bug Fixes
- Fixed YAML collection path resolution in nested directory structures
- Resolved ES module compatibility issues in function template creation
- Eliminated Zod discriminated union conflicts for numeric attribute types
- Updated outdated template references and improved template selection UX

**Migration Notes**: 
- Function templates now automatically integrate with YAML configs
- Existing collections continue to work; deprecated relationship attributes converted to manual references
- All numeric attributes now use consistent "double" type with "float" backwards compatibility

### 1.0.0 - YAML-First Architecture & Import System Revolution

**🎉 Major Release - Comprehensive Architecture Overhaul**

#### YAML-First Configuration System
- **Complete YAML support** with JSON Schema validation for IntelliSense
- **Automatic discovery**: `.appwrite/config.yaml`, `appwrite.yaml`, or `appwriteConfig.ts`
- **Cross-platform compatibility**: No TypeScript runner required
- **Better organization**: Clean `.appwrite` directory structure
- **Backward compatibility**: Existing TypeScript configs continue to work

#### Import System Revolution (50%+ Complexity Reduction)
- **Modular architecture**: Extracted DataLoader (1,688 lines) into focused services
  - `DataTransformationService` - Pure data transformation logic
  - `FileHandlerService` - URL downloads and local file handling
  - `UserMappingService` - Sophisticated email/phone deduplication
  - `ValidationService` - Centralized validation with detailed reporting
  - `RelationshipResolver` - Cross-collection ID mapping
  - `ImportOrchestrator` - High-level coordination
- **Enhanced rate limiting**: Configurable p-limit for different operations
  - `dataInsertion: 5` (concurrent document creation)
  - `fileUpload: 2` (conservative for large files)
  - `validation: 10` (pre-import validation)
  - `dataQuery: 25` (relationship resolution)

#### YAML Import Configuration System
- **Complete YAML import definitions** with JSON Schema support
- **Advanced file handling**: URL downloads with local file search fallback
- **Sophisticated validation**: Pre-import validation with detailed error reporting
- **Template generation**: Easy creation of new import configurations
- **Relationship mapping**: Intelligent cross-collection ID resolution
- **User deduplication**: Advanced email/phone matching with merge capabilities
- **AfterImportActions**: Complete post-import action system

#### Enhanced User Experience
- **Rich visual feedback**: Progress bars with ETA and speed indicators
- **Smart confirmation dialogs**: Risk-based confirmations for destructive operations
- **Operation summaries**: Detailed post-operation reports with statistics
- **Professional messaging**: Unified MessageFormatter with consistent styling
- **Configurable logging**: Disabled by default, full configuration support

#### Performance & Safety Improvements
- **Batch processing**: Enhanced with progress tracking and memory efficiency
- **Error resilience**: Improved error handling and recovery mechanisms
- **Transaction safety**: Better handling of partial failures
- **Memory optimization**: Efficient processing of large datasets

#### Developer Experience
- **JSON Schema generation**: Full IntelliSense support for YAML files
- **Example configurations**: Comprehensive templates and examples
- **Better error messages**: Clear validation and error reporting
- **Type safety**: Full TypeScript support for all new features

### Changelog

- 1.0.5: Fixed `.` directories being ignored. Normally a good thing
- 1.0.4: Fixed `appwriteConfig.yaml` being the name for the converted config, instead of `config.yaml`
- 1.0.3: Fixed appwriteConfig detection for `--it` so it detects when you can migrate your config
- 1.0.2: Fixed migrations, sorry about that!

**Migration Note**: While fully backward compatible, we recommend migrating to YAML configuration for the best experience. Use `--setup` to generate new YAML configurations.

- 0.10.86: Fixed `selectCollections` not always filtering by `databaseId`
- 0.10.85: Added logging to `wipeCollection`
- 0.10.83: Actually fixed the import oops
- 0.10.82: Fixed the `lodash` import, replaced with `es-toolkit`
- 0.10.81: Fixed `wipeCollection` -- it wasn't properly deleting all files in a loop
- 0.10.80: Updated `appwrite-utils` req
- 0.10.78: Fixed `attributesSame` so it will properly update attributes that have changed
- 0.10.77: Added disclaimer to update function specifications for bug
- 0.10.76: Updated CLI commands to not require an `appwriteConfig.ts` if you set API Key, ProjectId, and Endpoint
- 0.10.75: Fixed slight issue writing ZOD Schema for collection without any attributes
- 0.10.74: Fix moving users, should update Labels now
- 0.10.73: Fix moving users, passwords should work now (from Appwrite, Argon2)
- 0.10.71: Fix create template function `__dirname`
- 0.10.70: Fixed `--transfer-users` phones
- 0.10.67: Added `--transfer-users` boolean flag to also transfer users between projects
- 0.10.66: Fixed `ignore` always being an empty array, if not set, so it properly ignores the defaults
- 0.10.65: Fixed the stupid local functions not caring about the ignore string, and added `__pycache__` and `.venv` to default ignores
- 0.10.64: Fixed `Deploy Function(s)` not ignoring things properly
- 0.10.63: My `collectLocalFunctions` function was failing to add the `scopes` and a few others to the function, accidentally, fixed now
- 0.10.62: Made `Deploy Function(s)` also update the functions, as not all things (timeout, specification, etc.) are updated via deploy
- 0.10.61: Fixed ignore haha, also added `ignore` to the `Functions` config, to specify what to ignore when creating the `.tar.gz` file
- 0.10.051: Added `node_modules` and a few others to the ignore
- 0.10.05: Made deploy function into deploy function(s) -- so you can do more than one at a time
- 0.10.04: Fixed stupid progress bar not updating -- also fixed double text
- 0.10.03: Fixed `syncDb` to push the configurations properly, accidentally hurt it during `synchronizeConfigurations`
- 0.10.02: Updated `wipeCollection` to handle errors gracefully
- 0.10.01: Fixed `predeployCommands` to work
- 0.10.001: Updated `deployFunction` to not updateConfig if it's already present
- 0.10.0: Fixed `synchronize configurations` for functions, now you do not need to deploy the function first
- 0.9.999: Fixed Functions, looks for `./functions` in addition to `appwriteConfigFolder/functions`
- 0.9.998: Fixed transfer finally, added `--targetDbId` and `--sourceDbId` as aliases
- 0.9.994: Added function deployment management, in BETA, and fixed document transfer between databases
- 0.9.993: Fixed `updateFunctionSpecifications` resetting functions to default with undefined values (oops)
- 0.9.992: Added `updateFunctionSpecifications` which lists functions and specifications to allow you to update your functions max CPU and RAM usage per-function
- 0.9.990: Fixed `transferFilesLocalToLocal` and `remote` if a document exists with that `$id`, also fixed wipe `"all"` option also wiping the associated buckets
- 0.9.983: Fixed `afterImportActions` not resolving
- 0.9.981: Try fixing `tryAwaitWithRetry` to catch `522` errors from Cloudflare, they were appearing for some users, also added a 1000ms delay to `tryAwaitWithRetry`
- 0.9.98: Fixing some import errors reported by users
- 0.9.95: Updated to include new version of `appwrite-utils`
- 0.9.93: Updated `selectDatabases` and `selectCollections` from the interactive CLI to prefer local collections or databases when synchronizing the databases
- 0.9.92: Fixed `createOrUpdateAttributes` so it deletes attributes that don't exist in local config when you are running `syncDb`. Also updated the database and collection selection, so it won't try and fetch the collections and databases that don't exist (ones you picked from local config) and error
- 0.9.91: Fixed another webpack error, screw you react (but you're supported now so I guess not-screw-you)
- 0.9.90: Fixed Webpack errors (why tf does webpack add an extra `default`...???)
- 0.9.80: Fixed collections not being unique between local and remote
- 0.9.79: Fixed local collections not being considered for the synchronization unless all de-selected
- 0.9.78: Added colored text! And also added a lot more customization options as to what to wipe, update, etc.
- 0.9.75: Fixed attribute bug
- 0.9.72: Fixed my own null bug
- 0.9.71: Reverted `node-appwrite` to 14, this seems to fix the xdefault error
- 0.9.70: I think I stopped it from deleting attributes, my bad on that
- 0.9.68: Temporarily disabled updating Attributes until `updateStringAttribute` is fixed -- it just deletes them now
- 0.9.65: Temporary fix for Appwrite's `updateStringAttribute` bug
- 0.9.64: Fixed string attribute requiring xdefault
- 0.9.61: Remove fileURLToPath -- should hopefully fix windows
- 0.9.60: Fix init command to repository URL
- 0.9.59: Fix to Windows path names for loading config
- 0.9.58: The same as before, I just missed it hah
- 0.9.57: Changed generated schema type of `$createdAt` and `$updatedAt` to string from `string | Date` cause honestly if you want a date just parse it
- 0.9.56: Changed the updateAttribute so it doesn't always update attributes and hopefully fixed the required error
- 0.9.55: Updated to use `node-appwrite@14` for appwrite 1.6.0
- 0.9.54: Added small delay (`100ms`) between collection deletions, reduced other delays from `1000` to `500/250ms`
- 0.9.53: Reduced delay, went too far
- 0.9.52: Add delay after creating indexes, attributes, and others to prevent `fetch failed` errors during large-scale collection creation
- 0.9.51: Fix transfer databases, remove "ensure duplicates" check
- 0.9.5: Fixed not checking for storage bucket for each database (checking the creation status) when importing data
- 0.9.4: Fixed migrations database ensuring it has the required collections
- 0.9.3: Fixed deployment error && fix lack of existing `appwriteConfig.ts` file from causing error (you want to be able to setup yeah? haha)
- 0.9.2: Added changelog back, whoops
- 0.0.90: Updated README with new command-line options and fixed alias issues
- 0.0.74: Added `--backup` support, even if only one database
- 0.0.73: Fixed weird `workspace` issue
- 0.0.72: Remove `ulid` for `ulidx`, fixing compatibility issues
- 0.0.71: Slight change to file download logic after errors
- 0.0.70: Bump to `node-appwrite` version
- 0.0.69: Fixed single ID not getting replaced due to the below change =D also, `nice`
- 0.0.68: Fixed the occasional case where, when mapping ID's from old data to new, there would be an array of ID's to match against. `idMappings` now supports arrays.
- 0.0.67: Fixed `updates` in `importDef`'s update mappings overwriting postImportActions from the original
- 0.0.57: Fixed `dataLoader`'s `idMapping`'s giving me issues
- 0.0.55: Added `documentExists` check to batch creation functionality to try to prevent duplicates
- 0.0.54: Various fixes in here
- 0.0.50: Actually fixed the slight bug, it was really in the `mergeObjects`
- 0.0.49: Fixed a slight bug with `dataLoader` not mapping updates correctly with `updateMapping`
- 0.0.48: Added `--transfer`, `--fromdb <targetDatabaseId>`, `--targetdb <targetDatabaseId>`, `--transferendpoint <transferEndpoint>`, `--transferproject <transferProjectId>`, `--transferkey <transferApiKey>`. Additionally, I've added `--fromcoll <collectionId>` and `--targetcoll <collectionId>`. These allow you to do a few things. First, you can now transfer databases in the same project, and from local to a remote project. Second, you can now specify specific collections to transfer from one place to another, with all of their data. If `--fromcoll` and `--targetcoll` are ommitted, it will transfer the databases. During the database transfer, it will create any missing collections, attributes, and indices.
- 0.0.47: Minor bugfixes in many releases, too small to take note of
- 0.0.38: Lots of optimizations done to the code, added `tryAwaitWithRetry` for `fetch failed` and others like it errors (looking at you `server error`) -- this should prevent things from going sideways.
- 0.0.37: Added `documentSecurity`, `enabled`, and `$id` to the `init` collection
- 0.0.36: Made it update collections by default, sometimes you gotta do what you gotta do
- 0.0.35: Added update collection if it exists and permissions or such are different (`documentSecurity` and `enabled`), also added a check for `fetch failed` errors to retry them with recursion, not sure how well that will work out, but we're gonna try it! It will still fail after 5 tries, but hopefully that gives Appwrite some time to figure it's stuff out
- 0.0.34: Fixed the `bin` section of the package.json, apparently you can't use `node` to run it
- 0.0.33: Fixed `idMappings`, if you are importing data and use the `idMappings` functionality, you can set a `fieldToSet` based on the value of a `sourceField` in the current imported items data (whether it's in the final data or the original), in order to match another field in another collection. So if you had a store, and it had items and the items have a Region ID for instance. You can then, in your regionId of the items, setup an `idMapping` that will allow you to map the value of the `targetField` based on the value of the `targetFieldToMatch` in the `targetCollection`. Sounds complex, but it's very useful. Like psuedo-relationship resolution, without the relationships.
- 0.0.29: If you use the `description` variable in an attribute and collection, it'll add that description to the generated schemas. This assumes you have `zod-to-openpi`
- 0.0.275: THINGS ARE NOW IN TYPESCRIPT WOOHOO. No but for reaal, super happy to report that everything has been converted to TypeScript, just way too many changes, I hope you enjoy it!
- 0.0.274: Small improvement for attribute handling, rather than getting it every attribute, I check the collections attributes
- 0.0.273: Small fix for relationship attribute comparisons
- 0.0.272: That's what I get for not testing lmao, also updated logic for checking for existing attributes to take the `format` into consideration from the database (URL's are not of `type: "url"`, they are of `format: "url"`)
- 0.0.271: Small change to update attributes that are different from each other by deleting the attribute and recreating, as we cannot update most things
- 0.0.270: Fixed enums in `--sync`, added optional OpenAPI generation (in progress, almost done, but wanted to push other changes), added `--endpoint`, `--project`, `--key` as optional parameters to change the target destination (shoutout to [pingu24k](https://github.com/pingu2k4) for pointing out these bugs and suggesting those changes for endpoint customization)
- 0.0.254: Added `--sync` to synchronize your Appwrite instance with your local `appwriteConfig.yaml` and generate schemas
- 0.0.253: Added `--writeData` (or `--write-data`) to command to write the output of the import data to a file called dataLoaderOutput in your root dir
- 0.0.23: Added batching to user deletion
- 0.0.22: Converted all import processes except `postImportActions` and Relationship Resolution to the local data import, so it should be much faster.
- 0.0.6: Added `setTargetFieldFromOtherCollectionDocumentsByMatchingField` for the below, but setting a different field than the field you matched. The names are long, but at least you know what's going on lmao.
- 0.0.5: Added `setFieldFromOtherCollectionDocuments` to set an array of ID's for instance from another collection as a `postImportAction`
