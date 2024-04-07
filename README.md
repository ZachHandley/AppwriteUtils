# AppwriteUtils

The AppwriteMigrations project is designed to facilitate the migration of data and schema for Appwrite projects. It includes a comprehensive setup for managing database migrations, including creating and updating collections, attributes, and handling data conversions. The project structure and key components are outlined below:

## Project Structure

- **src/**: Contains the source code for migrations.
  - **migrations/**: Core directory for migration-related code.
  - **config.ts**: Configuration for collections to be migrated, including their attributes and permissions.
  - **conversions.ts**: Functions for converting data from one format to another, tailored for specific collections.
  - **collections.ts**: Handles the creation and update of collections and their attributes in the database.
  - **schema.ts**: Defines schemas for collections, attributes, operations, and other entities using Zod for validation.
  - **setupDatabase.ts**: Contains functions for setting up and configuring the database for migrations, including ensuring the existence of required databases.
  - **storage.ts**: Functions related to storage operations, such as logging operations and initializing backup storage.
  - **utils/**: Utility functions for common operations like file handling and string manipulation.
    - **helperFunctions.ts**: Includes functions for file operations, directory checks, and string case conversions.
    - **index.ts**: Exports all utility functions for easy access.
  - **migrationController.ts**: Orchestrates the migration process, including database setup and data import.
  - **migrate.ts**: Entry point for running migrations, with functions for applying migrations, wiping databases, and generating schemas.

## Key Features

- **Database Setup and Migration**: Automates the process of setting up databases and applying migrations, including the creation of collections and attributes.
- **Data Conversion**: Provides a framework for converting data from one format to another, facilitating the migration of existing data into new schemas.
- **Schema Generation**: Supports the generation of TypeScript types from schemas, ensuring type safety and consistency across the project.
- **Utility Functions**: Includes a set of utility functions for common tasks such as file operations and string manipulation, streamlining the migration process.

This project leverages TypeScript for type safety and includes configurations for TypeScript and Appwrite. It is structured to support complex migrations, including handling relationships between collections and managing data conversions for various entities.
