# appwrite-utils-cli

## Overview

`appwrite-utils-cli` is a powerful command-line interface tool designed for Appwrite developers who need to manage database migrations, schema generation, data import, and much more. This CLI tool facilitates complex tasks like setting up databases, running migrations, generating schemas, and managing backups efficiently, making it an indispensable part of your Appwrite project management.

## Features

- **Easy Configuration**: Initialize your Appwrite project configurations interactively directly from the command line.
- **Database Migrations**: Control the migration process with options to target production, staging, or development environments.
- **Schema Generation**: Generate and manage TypeScript schemas directly from your Appwrite database schemas.
- **Data Import**: Facilitate the import of data into your Appwrite databases with comprehensive command-line support.
- **Backup Management**: Create backups of your Appwrite databases to ensure data integrity and safety.
- **Flexible Database Management**: Includes commands to wipe databases, documents, or user data, providing flexibility in managing your database state during development or testing.

## Installation

To use `appwrite-utils-cli`, you can install it globally via npm to make it accessible from anywhere in your command line:

```bash
npm install -g appwrite-utils-cli
```

However, due to the nature of the speed at which I am developing this project, I would recommend the following command:

```bash
npx --package=appwrite-utils-cli@latest appwrite-migrate --arg1 --arg2 --arg3
```

**DO NOT INSTALL THIS LOCALLY INTO YOUR PROJECT, IT IS MEANT TO BE USED AS A COMMAND LINE TOOL ONLY**

## Usage

After installation, you can access the tool directly from your command line using the provided commands. Here's how you can use the different functionalities:

### Initialization

Interactively set up your Appwrite project with necessary configurations:

```bash
npx --package=appwrite-utils-cli@latest appwrite-init
```

### Running Migrations and Tasks

Run migration and management tasks with specific flags according to your needs:

```bash
npx --package=appwrite-utils-cli@latest appwrite-migrate --args
```

Replace `--args` with the appropriate options:

- `--prod`: Run tasks in the production environment.
- `--staging`: Run tasks in the staging environment.
- `--dev`: Run tasks in the development environment.
- `--wipe`: Wipe all databases.
- `--wipe-docs`: Wipe all documents in the databases.
- `--generate`: Generate TypeScript schemas from database schemas.
- `--import`: Import data into your databases.
- `--backup`: Perform a backup of your databases.
- `--wipe-users`: Wipe all user data.
- `--write-data`: Write converted imported data to file
- `--sync`: Synchronize your project's config and generate schema for your database
- `--endpoint`: Set a different endpoint for the migration target
- `--project`: Set a different project ID for the migration target
- `--key`: Set a different API key for the migration target

## If you run out of RAM

This happens because Node only allocates 4 GB, it'll only happen if you're importing a ton of data, but you can use `export NODE_OPTIONS="--max-old-space-size=16384"` or the relevant command for your system if that doesn't work, and it'll set the env var to whatever. That's 16 GB, I would recommend `8192` for most.

### OpenAPI Generation (almost done, in progress)

Recently, I have also added an optional OpenAPI generation for each attribute in the schema. This is because I needed it and because I felt it would be nice to have. This is done using [this package](https://github.com/asteasolutions/zod-to-openapi), many thanks to them.

To use it, add a `description` to any attribute or collection, and it will export that schema to the `appwrite/openapi` folder

This setup ensures that developers have robust tools at their fingertips to manage complex Appwrite projects effectively from the command line. I also have added logging automatically for information and errors as the console can be hard to keep up with.

### Roadmap

- Syncing configuration (DONE)
- Better file format for config (potentially)
- Separation of collections and import configuration from main config

### Changelog

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
