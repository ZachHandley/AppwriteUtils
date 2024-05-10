# Appwrite Utils Packages

This repository contains two distinct packages designed to enhance your experience with Appwrite: `appwrite-utils` and `appwrite-utils-cli`. These packages provide a range of utilities for managing data migrations, schema updates, data conversion, and more, tailored for Appwrite projects.

## `appwrite-utils`

The `appwrite-utils` package is a comprehensive TypeScript library offering a suite of utilities and helper functions for data manipulation, schema management, and seamless integration with Appwrite services. It's designed to be imported into your project, providing access to validation functions, converter functions, and more.

### Getting Started

To integrate `appwrite-utils` into your project, run:

```bash
npm install appwrite-utils
```

### Key Features

- **Validation and Converter Functions**: A collection of functions to ensure data integrity and facilitate data transformation.
- **Attribute Schemas**: Define and manage your data models with comprehensive attribute schemas.
- **File Operations**: Efficient file management within your Appwrite projects, including URL generation for file viewing and downloading.

### Usage

After installation, import and use the utilities directly in your TypeScript or JavaScript code. For example:

```typescript
import { converterFunctions, validationFunctions } from 'appwrite-utils';

console.log(validatorFunctions.isNumber(1234));  // Output: true
console.log(converterFunctions.anyToString(1234));  // Output: "1234"
```

For detailed usage instructions and function documentation, refer to the package's documentation inside your `node_modules/appwrite-utils` directory.

## `appwrite-utils-cli`

The `appwrite-utils-cli` package is a command-line interface tool for executing scripts to manage your Appwrite project. It supports database migrations, schema generation, data import, and more, directly through `npx`.

### Getting Started

To use `appwrite-utils-cli`, run it directly using `npx` without installing it globally:

```bash
npx --package=appwrite-utils-cli@latest appwrite-migrate --args
```

Replace `--args` with the appropriate options for your task.

**I highly recommend reading the actual readme for that inside `packages/appwrite-utils-cli/`**

### Key Features

- **Database Migrations and Schema Generation**: Control migration processes and generate TypeScript schemas from your Appwrite database schemas.
- **Data Import and Backup Management**: Import data into your databases and create backups to ensure data integrity.
- **Flexible Database Management**: Commands for wiping databases, documents, or user data, offering flexibility during development or testing.

### Usage

Initialize your Appwrite project configurations and set up databases, run migrations, generate schemas, manage backups, and more, directly from your command line. For example, to set up your project:

```bash
npx --package=appwrite-utils-cli@latest appwrite-setup
```

To run migrations in a development environment and import data:

```bash
npx --package=appwrite-utils-cli@latest appwrite-migrate --dev --import
```

For a complete list of commands and options, run the help command:

```bash
npx --package=appwrite-utils-cli@latest appwrite-migrate --help
```

### Contributing

Contributions are welcome! Feel free to open a pull request or issue if you have suggestions for improvements or have encountered bugs.

## Support

If you need help or have any questions about the usage of either package, please check out our issues tab or start a discussion.

Thank you for using or contributing to Appwrite Utils!