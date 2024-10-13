# appwrite-utils-cli

## Overview

`appwrite-utils-cli` is a powerful command-line interface tool designed for Appwrite developers who need to manage database migrations, schema generation, data import, and much more. This CLI tool facilitates complex tasks like setting up databases, running migrations, generating schemas, and managing backups efficiently, making it an indispensable part of your Appwrite project management.

## Features

- **Interactive Mode**: Run the CLI in interactive mode for a guided experience through all available options.
- **Easy Configuration**: Initialize your Appwrite project configurations interactively directly from the command line.
- **Database Migrations**: Control the migration process with options to target specific databases and collections.
- **Schema Generation**: Generate and manage TypeScript schemas directly from your Appwrite database schemas.
- **Data Import**: Facilitate the import of data into your Appwrite databases with comprehensive command-line support.
- **Backup Management**: Create backups of your Appwrite databases to ensure data integrity and safety.
- **Flexible Database Management**: Includes commands to wipe databases, documents, or user data, providing flexibility in managing your database state during development or testing.
- **Data Transfer**: Transfer data between databases, collections, and even between local and remote Appwrite instances.
- **Configuration Synchronization**: Sync your local Appwrite configuration with your remote Appwrite project.

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

## Usage

After installation, you can access the tool directly from your command line using the provided commands.

### Interactive Mode

Run the CLI in interactive mode:

```bash
npx --package=appwrite-utils-cli@latest appwrite-migrate --it
```

This will guide you through all available options interactively.

### Non-Interactive Mode

You can also use specific flags to run tasks without the interactive prompt:

```bash
npx --package=appwrite-utils-cli@latest appwrite-migrate [options]
```

Available options:

- `--it`: Run in interactive mode
- `--dbIds`: Comma-separated list of database IDs to operate on
- `--collectionIds`: Comma-separated list of collection IDs to operate on
- `--bucketIds`: Comma-separated list of bucket IDs to operate on
- `--wipe`: Wipe data (all: everything, docs: only documents, users: only user data)
- `--wipeCollections`: Wipe collections (wipes specified collections from collectionIds -- does this non-destructively, deletes all documents)
- `--generate`: Generate TypeScript schemas from database schemas
- `--import`: Import data into your databases
- `--backup`: Perform a backup of your databases
- `--writeData`: Write converted imported data to file
- `--push`: Push your local Appwrite config to your configured Appwrite Project
- `--sync`: Synchronize by pulling your Appwrite config from your configured Appwrite Project
- `--endpoint`: Set the Appwrite endpoint
- `--projectId`: Set the Appwrite project ID
- `--apiKey`: Set the Appwrite API key
- `--transfer`: Transfer data between databases or collections
- `--fromDbId`: Set the source database ID for transfer
- `--toDbId`: Set the destination database ID for transfer
- `--fromCollectionId`: Set the source collection ID for transfer
- `--toCollectionId`: Set the destination collection ID for transfer
- `--fromBucketId`: Set the source bucket ID for transfer
- `--toBucketId`: Set the destination bucket ID for transfer
- `--remoteEndpoint`: Set the remote Appwrite endpoint for transfers
- `--remoteProjectId`: Set the remote Appwrite project ID for transfers
- `--remoteApiKey`: Set the remote Appwrite API key for transfers
- `--setup`: Create setup files

## Examples

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

## Additional Notes

- If you run out of RAM during large data imports, you can increase Node's memory allocation:

  ```bash
  export NODE_OPTIONS="--max-old-space-size=16384"
  ```

  This sets the allocation to 16GB. For most cases, 8GB (`8192`) should be sufficient.

- The CLI now supports OpenAPI generation for each attribute in the schema. Add a `description` to any attribute or collection, and it will export that schema to the `appwrite/openapi` folder.

This updated CLI ensures that developers have robust tools at their fingertips to manage complex Appwrite projects effectively from the command line, with both interactive and non-interactive modes available for flexibility.

## Changelog

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
