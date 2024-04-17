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

To use `appwrite-utils-cli`, you should install it globally via npm to make it accessible from anywhere in your command line:

```bash
npm install -g appwrite-utils-cli
```

## Usage

After installation, you can access the tool directly from your command line using the provided commands. Here's how you can use the different functionalities:

### Initialization

Set up your Appwrite project with necessary configurations:

```bash
appwrite-setup
```

To generate an example configuration file:

```bash
appwrite-setup --example
```

### Running Migrations and Tasks

Run migration and management tasks with specific flags according to your needs:

```bash
appwrite-run --args
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

For example, to run migrations in a development environment and import data:

```bash
appwrite-run --dev --import
```

To initialize your project, generate schemas, but not import data:

```bash
appwrite-run --init
```

This setup ensures that developers have robust tools at their fingertips to manage complex Appwrite projects effectively from the command line.
