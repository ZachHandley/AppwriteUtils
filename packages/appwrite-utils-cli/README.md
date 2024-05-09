# appwrite-utils-cli

## Overview

`appwrite-utils-cli` is a powerful command-line interface tool designed for Appwrite developers who need to manage database migrations, schema generation, data import, and much more. This CLI tool facilitates complex tasks like setting up databases, running migrations, generating schemas, and managing backups efficiently, making it an indispensable part of your Appwrite project management.

## Features

- **Easy Configuration**: Initialize your Appwrite project configurations and setup directly from the command line.
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
npx --package=appwrite-utils-cli@latest appwrite-migrate -- --arg1 --arg2 --arg3
```

**DO NOT INSTALL THIS LOCALLY INTO YOUR PROJECT, IT IS MEANT TO BE USED AS A COMMAND LINE TOOL ONLY**

## Usage

After installation, you can access the tool directly from your command line using the provided commands. Here's how you can use the different functionalities:

### Initialization

Set up your Appwrite project with necessary configurations:

```bash
npx --package=appwrite-utils-cli@latest appwrite-setup
```

To generate an example configuration file:

```bash
appwrite-setup --example
```

To synchronize your `appwriteConfig.yaml` with your Appwrite Database, first you must run the setup command and enter your Appwrite instances details in the `projectId`, `endpoint`, and `apiKey`, then run the following

```bash
npx --package=appwrite-utils-cli@latest appwrite-migrate -- --sync
```

This will initialize your config and generate schemas for your database using ZOD to `src/appwrite/schemas`

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
- `--wipe-docs` or `--wipeDocs`: Wipe all documents in the databases.
- `--generate`: Generate TypeScript schemas from database schemas.
- `--import`: Import data into your databases.
- `--backup`: Perform a backup of your databases.
- `--wipe-users` or `--wipeUsers`: Wipe all user data.
- `--write-data` or `--writeData`: Write converted imported data to file
- `--sync`: Synchronize your project's config and generate schema for your database
- `--endpoint`: Set a different endpoint for the migration target
- `--project`: Set a different project ID for the migration target
- `--key`: Set a different API key for the migration target

For example, to run migrations in a development environment and import data:

```bash
npx --package=appwrite-utils-cli@latest appwrite-migrate --dev --import
```

To initialize your project, generate schemas, but not import data:

```bash
npx --package=appwrite-utils-cli@latest appwrite-migrate --init
```

To sync:

```bash
# If you have no appwriteConfig
npx --package=appwrite-utils-cli@latest appwrite-migrate --init

# Otherwise, you can remove everything in the config file down to the word collections, just leave your Databases, then run
npx --package=appwrite-utils-cli@latest appwrite-migrate --sync
```

### OpenAPI Generation

Recently, I have also added an optional OpenAPI generation for each attribute in the schema. This is because I needed it and because I felt it would be nice to have. This is done using [this package](https://github.com/asteasolutions/zod-to-openapi), many thanks to them.

To use it, add a `description` to any attribute or collection, and it will export that schema to the `appwrite/openapi` folder

This setup ensures that developers have robust tools at their fingertips to manage complex Appwrite projects effectively from the command line. I also have added logging automatically for information and errors as the console can be hard to keep up with.

### Roadmap

- Syncing configuration (DONE)
- Better file format for config (potentially)
- Separation of collections and import configuration from main config

### Changelog

- 0.0.270: Fixed enums in `--sync`, added optional OpenAPI generation (in progress, almost done, but wanted to push other changes), added `--endpoint`, `--project`, `--key` as optional parameters to change the target destination (shoutout to [pingu24k](https://github.com/pingu2k4) for pointing out these bugs and suggesting those changes for endpoint customization)
- 0.0.254: Added `--sync` to synchronize your Appwrite instance with your local `appwriteConfig.yaml` and generate schemas
- 0.0.253: Added `--writeData` (or `--write-data`) to command to write the output of the import data to a file called dataLoaderOutput in your root dir
- 0.0.23: Added batching to user deletion
- 0.0.22: Converted all import processes except `postImportActions` and Relationship Resolution to the local data import, so it should be much faster.
- 0.0.6: Added `setTargetFieldFromOtherCollectionDocumentsByMatchingField` for the below, but setting a different field than the field you matched. The names are long, but at least you know what's going on lmao.
- 0.0.5: Added `setFieldFromOtherCollectionDocuments` to set an array of ID's for instance from another collection as a `postImportAction`
