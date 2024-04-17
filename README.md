# Appwrite Utils Packages

This repository contains two distinct packages designed to enhance your experience with Appwrite:

## `appwrite-utils`

The `appwrite-utils` package provides a collection of helper functions, converters, and validators. These utilities simplify the process of managing data migrations, schema updates, and data conversion for Appwrite projects.

### Getting Started

To get started with `appwrite-utils`, you need to install the package via npm:

```bash
npm install appwrite-utils
```

### Key Features

- **Data Conversion and Import**: Convert data from various formats and seamlessly import it into your Appwrite project, adhering to new schema definitions.
- **Schema Generation**: Automatically generate TypeScript types from your Appwrite schemas, ensuring type safety and consistency across your application.
- **Comprehensive Utility Functions**: Access a wide range of utility functions designed to streamline the migration and data management processes.

### Usage

After installation, you can use the utilities provided by `appwrite-utils` directly in your Appwrite projects. For detailed usage instructions and function documentation, refer to the package's documentation inside your `node_modules/appwrite-utils` directory.

## `appwrite-utils-cli`

The `appwrite-utils-cli` package is a command-line interface tool that allows you to execute scripts for managing your Appwrite project directly through `npx` or `bunx`.

### Getting Started

To use `appwrite-utils-cli`, you can install it globally via npm or run it directly using `npx`:

```bash
npm install -g appwrite-utils-cli
```

Or

```bash
npx appwrite-utils-cli <command>
```

### Key Features

- **Automated Database Migrations**: Effortlessly create, update, and manage collections and attributes in your Appwrite database.
- **User Import**: Import users and their associated data efficiently by mapping fields such as `name`, `email`, and more.
- **Enhanced Data Management**: Handle complex migrations with ease, including managing relationships between collections.

### Available Commands

- **Setup Command**: Prepare your environment for migrations.
  ```bash
  appwrite-setup
  ```

- **Run Command**: Execute migration and management tasks.
  ```bash
  appwrite-run --options
  ```

For a complete list of commands and options, run the help command:

```bash
npx appwrite-utils-cli --help
```

### Contributing

Contributions are welcome! Feel free to open a pull request or issue if you have suggestions for improvements or have encountered bugs.

## Support

If you need help or have any questions about the usage of either package, please check out our issues tab or start a discussion.

Thank you for using or contributing to Appwrite Utils!