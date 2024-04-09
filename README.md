# AppwriteUtils Package

The AppwriteUtils package simplifies the process of managing data migrations and schema updates for Appwrite projects. It provides a comprehensive toolset for database setup, data conversion, and schema management, all accessible through a simple command-line interface. This package is designed to be easily integrated into your development workflow, requiring minimal setup to get started.

## Getting Started

To use AppwriteUtils, first, install the package via npm:

```bash
npm install appwrite-utils
```

Once installed, you should first run the setup command to generate the config, then you can run migration commands directly using `npx` (or `bunx`, whatever):

```bash
npx appwrite-utils setup
```

You may generate an example config using (or look in the examples folder)

```bash
npx appwrite-utils setup --example
```

```bash
npx appwrite-utils migrate --args
```

Replace `--args` with specific arguments for your migration task. For example, to run migrations in a development environment, you might use:

```bash
npx appwrite-utils migrate --dev
```

## Key Features

- **Simplified Setup**: Quickly set up and configure your Appwrite project for migrations with minimal manual intervention.
- **Automated Database Migrations**: Effortlessly create, update, and manage collections and attributes in your Appwrite database.
- **Data Conversion and Import**: Convert data from various formats and seamlessly import it into your Appwrite project, adhering to new schema definitions.
- **Schema Generation**: Automatically generate TypeScript types from your Appwrite schemas, ensuring type safety and consistency across your application.
- **Comprehensive Utility Functions**: Access a wide range of utility functions for file operations, string manipulation, and more, designed to streamline the migration process.
- **Enhanced Data Management**: Handle complex migrations with ease, including managing relationships between collections and converting data for various entities.

This package leverages TypeScript for type safety and is configured to work seamlessly with Appwrite. It's built to support complex migration scenarios, making it an essential tool for developers working with Appwrite projects.

## Usage

After installing the package, you can run various migration-related tasks using the command line. Here are some examples of commands you might use, reflecting the capabilities as defined in `index.ts`:

- **Initialize a New Migration**: Set up your database and prepare it for new migrations. This will also generate schemas but will not import data.

  ```bash
  npx appwrite-utils migrate --init
  ```

- **Run Migrations in Production**: Apply migrations to your production database.

  ```bash
  npx appwrite-utils migrate --prod
  ```

- **Run Migrations in Staging**: Apply migrations to your staging database.

  ```bash
  npx appwrite-utils migrate --staging
  ```

- **Run Migrations in Development**: Apply migrations to your development database.

  ```bash
  npx appwrite-utils migrate --dev
  ```

- **Wipe Databases**: Wipe your databases. Use with caution.

  ```bash
  npx appwrite-utils migrate --wipe
  ```

- **Generate Schemas**: Generate TypeScript schemas from your Appwrite database collections.

  ```bash
  npx appwrite-utils migrate --generate
  ```

- **Import Data**: Import data into your Appwrite project from external sources.

  ```bash
  npx appwrite-utils migrate --import
  ```

- **Backup Data**: Backup your database data.

  ```bash
  npx appwrite-utils migrate --backup
  ```

Each command can be combined with others as needed, except for `--init` which runs a specific initialization routine including schema generation but not data import. For example, to run migrations in a development environment and import data, you might use:

```bash
npx appwrite-utils migrate --dev --import
```

By simplifying the migration process, AppwriteUtils enables developers to focus on building their applications, knowing that their data management and schema updates are handled efficiently.

### Changelog

- 0.9.0: Initial refactor into AppwriteUtils package for ease of use
