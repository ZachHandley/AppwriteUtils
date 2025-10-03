# Changelog

All notable changes to the appwrite-utils-cli package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.1] - 2025-10-02

### Changed
- **Code Organization**: Major refactoring to improve maintainability
  - Extracted wipe operations into dedicated module (501 lines)
  - Extracted transfer operations into dedicated module (516 lines)
  - Extracted config discovery logic into separate file (502 lines)
  - Split interactive CLI into 5 focused command modules (1,595 lines total)
  - Reduced large file sizes by 30-60% while maintaining all functionality
- **Logging Standardization**: Unified logging across entire codebase
  - Replaced ~500 console.* calls with MessageFormatter
  - Consistent prefixes and formatting for better debugging
  - Integrated with Winston structured logging
- **New Utilities**: Added shared utility modules for better code reuse
  - errorUtils.ts for centralized error handling
  - directoryUtils.ts for file system operations
  - typeGuards.ts for TypeScript type safety
  - pathResolvers.ts for consistent path resolution

## [1.6.0] - 2025-01-27

### Added
- **Session Authentication Integration**: Complete integration with Appwrite CLI session authentication
  - New CLI flags: `--use-session`, `--session`, `--sessionCookie` for flexible authentication
  - Automatic detection and usage of sessions from `~/.appwrite/prefs.json`
  - Priority authentication system: explicit session → session from prefs → API key → error
  - Enhanced error messages with available session listing and login guidance
  - Seamless integration maintaining backward compatibility with API key workflows

- **Native Project Configuration Support**: Full support for appwrite.json/appwrite.config.json files
  - Automatic project configuration detection and loading from current directory tree
  - Support for both Collections and TablesDB project formats from official Appwrite CLI
  - Enhanced project context awareness for better tooling integration
  - Conversion between project config and internal AppwriteConfig formats
  - Priority system: CLI args → project config → YAML config → interactive prompt

- **Intelligent Version-Aware Setup**: Enhanced setup command with smart detection
  - **Project-First Detection**: Automatically detects project type from existing appwrite.json
  - **Session-Powered Version Detection**: Uses session auth for server version checking when available
  - **Context-Aware Templates**: Generates tables/columns templates for TablesDB (1.8.0+)
  - **Legacy Support**: Generates collections/attributes templates for older versions
  - **Smart Schema Generation**: Creates appropriate JSON schemas (table.schema.json vs collection.schema.json)
  - **Enhanced Examples**: TablesDB templates include unique constraints and row-level security features

- **Enhanced Client Creation**: Completely overhauled authentication flow
  - New `getClientWithAuth()` function with intelligent fallback system
  - Session validation and endpoint matching for security
  - Enhanced `UtilsController` with session authentication support
  - Automatic session discovery when no API key provided
  - Clear authentication method logging and error reporting

- **Hono-TypeScript Function Template**: New web framework template for modern API development
  - Complete Hono.dev integration with Appwrite functions
  - Request/response adapters for seamless Appwrite-Hono bridge
  - Built-in middleware for logging, error handling, and context injection
  - Example API endpoints with database operations and authentication
  - Comprehensive documentation and usage examples

- **Enhanced Function Templates**: Improved TypeScript and Python templates
  - Complete Pydantic models for Python functions with proper type hints
  - Enhanced Zod schemas for TypeScript functions with full validation
  - Better error handling and context validation in templates
  - Updated dependencies (Hono, Zod, Pydantic) in template configurations

- **Dual Collections/Tables Support**: Full support for both legacy and TablesDB APIs
  - Enhanced YAML loading from both `collections/` and `tables/` directories simultaneously
  - Automatic conflict detection and resolution between folder structures
  - Version-aware folder selection based on Appwrite API detection
  - Backward compatibility with existing projects

- **Interactive CLI Enhancements**: Improved user experience and database association
  - Better collection/table selection with type indicators (🟢 Collection, 🔵 Table)
  - Enhanced database filtering using optional `databaseId` for tables
  - Improved prompts and contextual information display
  - Better organization of mixed collection/table scenarios

- **Configuration Validation & Migration**: Comprehensive validation and migration tools
  - New CLI flags: `--validate`, `--validate-strict`, `--migrate-collections-to-tables`
  - Configuration validation with detailed error reporting and suggestions
  - Multiple migration strategies for different project needs
  - Integration with config loading for automatic validation

- **Enhanced Sync Operations**: Fixed and improved sync-from-Appwrite functionality
  - **Fixed Database Syncing**: Remote databases now properly sync into `config.yaml`
  - **Version-Aware YAML Generation**: Correct schema references and folder selection
  - **Improved Error Handling**: Better user feedback and error recovery
  - **Enhanced Logging**: Comprehensive operation tracking and debugging

### Changed
- **Authentication Priority**: Complete overhaul of authentication handling throughout CLI
  - Session authentication now preferred over API key when available
  - Enhanced error messages guide users to proper authentication setup
  - Better integration with existing Appwrite CLI workflows
  - Maintained full backward compatibility with existing projects

- **Setup Command Experience**: Major improvements to project initialization
  - Intelligent detection provides better user feedback about project type
  - Version-aware terminology throughout setup process
  - Enhanced console output with detection source information
  - Better guidance for TablesDB features and capabilities

- **Configuration Loading**: Enhanced to work with multiple configuration sources
  - Project configuration loading from appwrite.json files
  - Better conflict resolution between different config sources
  - Enhanced validation and error handling for mixed scenarios

- **Enhanced Logging Infrastructure**: Comprehensive logging throughout the CLI
  - Structured JSON logging with operation context and timing
  - Version detection and adapter selection logging
  - Attribute min/max value processing logs with before/after values
  - Performance timing for bottleneck identification

- **Improved Template System**: Better function template organization and options
  - Added "TypeScript with Hono Web Framework" option to CLI
  - Enhanced template variable replacement system
  - Better template defaults and configuration
  - Improved template documentation and examples

### Fixed
- **Authentication Error Handling**: Resolved issues with missing authentication
  - Better fallback logic when session authentication unavailable
  - Clear error messages with actionable guidance
  - Proper handling of invalid or expired session cookies
  - Enhanced validation of authentication methods

- **Type Safety**: Resolved TypeScript compilation issues
  - Fixed session authentication type definitions
  - Proper null/undefined handling in project configuration
  - Enhanced type inference throughout authentication flow
  - Better error message types and interfaces

- **Version Detection**: Improved reliability of server version detection
  - Better error handling when version detection fails
  - Enhanced fallback mechanisms for offline scenarios
  - Improved session-based version detection accuracy

- **Integer/Float Min/Max Handling**: Resolved issues with extreme values in attribute creation
  - Implemented 10 billion threshold logic for min/max values
  - Proper undefined value handling for Appwrite API compatibility
  - Consistent normalization between create and update operations
  - Better comparison logic for determining when updates are needed

- **Collection Re-pushing Prevention**: Eliminated unnecessary collection processing
  - Intelligent state management prevents duplicate operations
  - Surgical queue processing for relationship attributes only
  - Better cache management and state tracking
  - Performance improvements for large collection push operations

- **Version-Aware Attribute Creation**: Proper API mode detection and routing
  - All attribute operations now route through adapter pattern
  - TablesDB vs Legacy API terminology used correctly
  - Fixed direct SDK calls that bypassed version detection
  - Maintained backward compatibility with pre-1.8.0 Appwrite

- **Sync-from-Appwrite Issues**: Comprehensive fixes for YAML generation
  - Database definitions now properly added to configuration
  - Version-aware folder structure (tables/ vs collections/)
  - Correct schema references in generated YAML files
  - Enhanced error handling and user feedback

### Technical Improvements
- **New Utilities**: Added comprehensive session and project management utilities
  - `sessionAuth.ts` - Complete session management and validation
  - `projectConfig.ts` - Appwrite project configuration handling
  - Enhanced `getClientFromConfig.ts` with session authentication support
  - Improved `setupFiles.ts` with intelligent version detection

- **Enhanced Type Definitions**: Better TypeScript support throughout
  - Comprehensive session authentication types
  - Project configuration interfaces and validation
  - Enhanced error handling and message formatting
  - Better integration between authentication methods

- **Improved Error Handling**: More helpful and actionable error messages
  - Authentication method reporting and guidance
  - Session availability checking and listing
  - Project configuration validation feedback
  - Version detection status and fallback information

- **Full TypeScript Type Safety**: Enhanced type definitions throughout
- **Comprehensive Test Coverage**: Extensive testing for all new features
- **Performance Optimizations**: Reduced redundant operations and improved efficiency
- **Enhanced Debugging**: Better visibility into CLI operations and state changes

## [1.5.2] - 2024-XX-XX

### Previous
- Earlier version features and improvements

## Earlier Versions

Please refer to git history for changes prior to v1.6.0.