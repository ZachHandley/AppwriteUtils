# Changelog

All notable changes to the appwrite-utils package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.1] - 2025-10-02

### Changed
- **Internal Improvements**: Better code organization and maintainability (no API changes)

## [1.6.0] - 2025-01-27

### Added
- **Session Authentication Support**: Integration with Appwrite CLI session authentication
  - Automatic detection and usage of sessions from `~/.appwrite/prefs.json`
  - Support for explicit session cookie parameters
  - Seamless fallback between session auth and API key authentication
  - Enhanced client creation with authentication priority system

- **Project Configuration Integration**: Native support for appwrite.json/appwrite.config.json files
  - Automatic project configuration detection and loading
  - Support for both Collections and TablesDB project formats
  - Conversion utilities between project config and AppwriteConfig formats
  - Enhanced project context awareness for better tooling integration

- **Version-Aware Schema Support**: Intelligent schema generation based on Appwrite server version
  - Automatic detection between Collections API (legacy) and TablesDB API (1.8.0+)
  - Context-aware directory structure (collections/ vs tables/)
  - Version-appropriate template generation with correct terminology
  - Smart fallback and error handling for version detection

- **Dual Schema Support**: Extended core configuration schema to support both `collections` AND `tables` arrays simultaneously
  - New `TableCreateSchema` with `tableId` (required) and `databaseId` (optional) properties
  - Full backward compatibility with existing `collections` configurations
  - Enhanced type inference and validation for mixed collection/table scenarios

- **Enhanced TypeScript Definitions**: Complete type definitions for Appwrite function contexts
  - Comprehensive Zod schemas for Appwrite request/response objects
  - Full TypeScript type inference support
  - Enhanced validation capabilities for function development

- **Advanced Configuration Validation**: New validation utilities for configuration integrity
  - Naming conflict detection between collections and tables
  - Database reference validation
  - Schema consistency checks with detailed error reporting
  - Strict mode validation for CI/CD environments

- **Migration Utilities**: Tools for smooth transitions between configuration formats
  - Multiple migration strategies (full, dual format, incremental, tables-only)
  - Automatic backup creation during migrations
  - Configuration conversion and validation workflows

### Changed
- **Authentication Flow**: Enhanced authentication priority system (session → API key → interactive)
- **Setup Command**: Improved setup with intelligent version detection and project awareness
- **Error Messages**: More helpful authentication and configuration error messages
- **Client Creation**: All client creation now supports session authentication as primary method
- **Table Support**: Enhanced loading system to support both `collections/` and `tables/` directory structures
- **Schema Flexibility**: Collections and tables arrays are now both optional in configuration
- **Type Safety**: Improved type definitions with better error handling and validation

### Fixed
- **Type Safety**: Resolved TypeScript compilation issues with session authentication
- **Configuration Loading**: Better handling of mixed authentication scenarios
- **Version Detection**: Improved reliability of server version detection
- **Schema Validation**: Improved validation logic for complex configuration scenarios
- **Type Inference**: Better TypeScript type inference for mixed collection/table configurations

### Technical
- New `sessionAuth.ts` utility for comprehensive session management
- New `projectConfig.ts` utility for appwrite.json handling
- Enhanced `getClientFromConfig.ts` with session authentication support
- Improved `setupFiles.ts` with version-aware template generation
- Enhanced Zod schema validation throughout the package
- Improved TypeScript compilation and type safety
- Better error reporting and validation feedback
- Comprehensive test coverage for new features

## [1.5.0] - 2024-XX-XX

### Added
- Previous version features and improvements

## Earlier Versions

Please refer to git history for changes prior to v1.6.0.