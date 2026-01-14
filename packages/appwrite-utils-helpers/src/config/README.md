# Configuration Validation & Migration Utilities

This module provides comprehensive validation and migration utilities for the enhanced collections/tables dual config schema in appwrite-utils-cli.

## Features

### Configuration Validation
- **Naming Conflict Detection**: Detects conflicts between collections and tables
- **Database Reference Validation**: Validates database ID references
- **Schema Consistency Checks**: Ensures internal consistency and best practices
- **Strict Mode**: Option to treat warnings as errors for CI/CD pipelines

### Migration Utilities
- **Collections to Tables Migration**: Convert collections to tables format for TablesDB API compatibility
- **Multiple Migration Strategies**: Full migration, dual format, incremental, and tables-only
- **Migration Planning**: Analyze changes before execution
- **Backup Support**: Automatic backup creation during migration
- **Validation Integration**: Validate results after migration

## Usage

### CLI Commands

#### Validate Configuration
```bash
# Basic validation
npx appwrite-migrate --validate

# Strict validation (warnings become errors)
npx appwrite-migrate --validate-strict

# Migrate collections to tables
npx appwrite-migrate --migrate-collections-to-tables
```

#### Interactive CLI
```bash
# Launch interactive mode
npx appwrite-migrate --it

# Select from menu:
# ✅ Validate configuration (collections/tables conflicts)
# 🔀 Migrate collections to tables format
```

### Programmatic Usage

#### Configuration Validation

```typescript
import { validateCollectionsTablesConfig, reportValidationResults } from "./configValidation.js";
import { loadConfig } from "../utils/loadConfigs.js";

// Load and validate configuration
const config = await loadConfig(".", { validate: true, reportValidation: true });

// Manual validation
const validation = validateCollectionsTablesConfig(config);
reportValidationResults(validation, { verbose: true });

if (!validation.isValid) {
  console.error(`Found ${validation.errors.length} validation errors`);
  process.exit(1);
}
```

#### Collections to Tables Migration

```typescript
import {
  createMigrationPlan,
  executeMigrationPlan,
  migrateCollectionsToTables
} from "./configMigration.js";

// Simple migration
const result = migrateCollectionsToTables(config, {
  strategy: "full_migration",
  validateResult: true,
  dryRun: false
});

// Advanced migration with planning
const plan = createMigrationPlan(config, "dual_format");
console.log(`Will migrate ${plan.collectionsToMigrate.length} collections`);

const result = executeMigrationPlan(config, plan, {
  validateResult: true,
  backupConfig: true
});
```

## Validation Rules

### Naming Conflicts
- **Collection/Table Names**: Same names cannot exist in both arrays
- **Collection/Table IDs**: Same IDs cannot exist in both arrays
- **Within Arrays**: No duplicate names or IDs within the same array

### Database References
- **Valid Database IDs**: All referenced database IDs must exist in databases array
- **Optional References**: Missing databaseId is allowed for backward compatibility

### Schema Consistency
- **Mixed Usage Warning**: Using both collections and tables with auto API mode
- **Migration Suggestions**: Recommends migrating to tables for newer Appwrite versions
- **Relationship Validation**: Checks relationship attributes for potential issues

## Migration Strategies

### Full Migration
- Converts all collections to tables
- Removes collections array
- Best for new projects moving to TablesDB API

### Dual Format
- Keeps both collections and tables
- Useful for gradual transition
- Higher maintenance overhead

### Incremental
- Migrates specific collections only
- Good for large projects
- Allows staged migration

### Tables Only
- Creates tables-only configuration
- Removes collections array entirely
- Clean slate approach

## Error Types

### Validation Errors
- `naming_conflict`: Same names/IDs in collections and tables
- `invalid_database_reference`: References to non-existent databases
- `missing_required_field`: Missing required fields in definitions
- `schema_inconsistency`: Configuration inconsistencies
- `duplicate_definition`: Duplicates within same array

### Migration Warnings
- Complex relationships requiring manual review
- Large migrations requiring careful testing
- API mode configuration recommendations

## Configuration Examples

### Valid Dual Configuration
```typescript
const config: AppwriteConfig = {
  // ... other config
  collections: [
    {
      name: "Users",
      $id: "users",
      // ... collection definition
    }
  ],
  tables: [
    {
      name: "Products", // Different name - no conflict
      tableId: "products",
      // ... table definition
    }
  ],
  apiMode: "auto" // Will handle both APIs
};
```

### Configuration with Conflicts (Invalid)
```typescript
const config: AppwriteConfig = {
  // ... other config
  collections: [
    {
      name: "Users",
      $id: "users",
      // ... collection definition
    }
  ],
  tables: [
    {
      name: "Users", // ❌ Conflict: same name as collection
      tableId: "users", // ❌ Conflict: same ID as collection
      // ... table definition
    }
  ]
};
```

## Integration with Existing Workflows

### Config Loading
```typescript
// Automatic validation during config loading
const config = await loadConfig(".", {
  validate: true,
  strictMode: false,
  reportValidation: true
});
```

### UtilsController Integration
```typescript
const controller = new UtilsController(process.cwd());

// Initialize with validation
await controller.init({ validate: true, strictMode: false });

// Manual validation
const validation = await controller.validateConfiguration();
```

### CLI Integration
```typescript
// Interactive CLI includes validation and migration options
const cli = new InteractiveCLI(process.cwd());
await cli.run();

// Options:
// ✅ Validate configuration (collections/tables conflicts)
// 🔀 Migrate collections to tables format
```

## Best Practices

1. **Always Validate**: Run validation before deploying configurations
2. **Use Strict Mode in CI**: Catch warnings early in automated pipelines
3. **Plan Migrations**: Use migration planning to understand changes
4. **Backup First**: Create backups before major migrations
5. **Test Incrementally**: Use incremental migration for large projects
6. **Monitor API Mode**: Set explicit apiMode after migration

## Troubleshooting

### Common Issues

#### Naming Conflicts
```bash
Error: Naming conflict detected: 'Users'
Details: Table 'Users' has the same name as a collection
Suggestion: Rename one of the conflicting items to avoid confusion
```
**Solution**: Rename either the collection or table to have unique names.

#### Invalid Database References
```bash
Error: Collection 'Posts' references invalid database 'blog'
Details: Database 'blog' is not defined in the databases array
Suggestion: Add database with $id 'blog' to the databases array
```
**Solution**: Add the referenced database to the databases array.

#### Migration Complexity Warnings
```bash
Warning: Large migration may require careful testing and staged deployment
Recommendation: Consider incremental migration for large projects
```
**Solution**: Use incremental migration strategy or break into smaller batches.

### Debug Mode
Enable verbose logging to see detailed validation and migration information:

```typescript
// Enable verbose validation reporting
reportValidationResults(validation, { verbose: true });

// Enable detailed migration logging
const result = executeMigrationPlan(config, plan, {
  validateResult: true,
  dryRun: true // Test first
});
```

This comprehensive validation and migration system ensures smooth transitions between collections and tables while maintaining data integrity and configuration consistency.