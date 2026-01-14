# Selection Dialogs System

## Overview

The `SelectionDialogs` class provides a comprehensive interactive selection system for the enhanced sync flow in the Appwrite Utils CLI. It enables users to select databases, tables/collections, and storage buckets with visual indicators for configured vs new items.

## Features

- **Visual Indicators**: ✅ for configured items, ○ for new items
- **Multi-Selection Support**: Checkbox-style selection with "Select All" functionality
- **Configuration Awareness**: Detects and highlights existing configurations
- **Grouped Display**: Organizes buckets by database for better context
- **Comprehensive Confirmation**: Shows detailed summary before sync execution
- **Graceful Error Handling**: Proper error messages and cancellation support
- **Type Safety**: Full TypeScript support with proper interfaces

## Main Functions

### `promptForExistingConfig(configuredItems: any[])`
Prompts user about existing configuration with options to:
- Sync existing configured items
- Add/remove items from configuration

### `selectDatabases(availableDatabases, configuredDatabases, options?)`
Interactive database selection with:
- Visual indicators for configured vs new databases
- "Select All" functionality
- Filtering options (new only, default selections)

### `selectTablesForDatabase(databaseId, databaseName, availableTables, configuredTables, options?)`
Table/collection selection for a specific database with:
- Database context display
- Table selection with indicators
- Multi-selection support

### `selectBucketsForDatabases(selectedDatabaseIds, availableBuckets, configuredBuckets, options?)`
Storage bucket selection with:
- Grouping by database
- Relevance filtering (only buckets for selected databases)
- Ungrouped/general storage support

### `confirmSyncSelection(selectionSummary: SyncSelectionSummary)`
Final confirmation dialog showing:
- Complete selection summary
- Statistics (total, new, existing items)
- Detailed breakdown by category

## Usage Example

```typescript
import { SelectionDialogs } from './shared/selectionDialogs.js';
import type { Models } from 'node-appwrite';

// 1. Check for existing configuration
const { syncExisting, modifyConfiguration } = await SelectionDialogs.promptForExistingConfig(configuredDatabases);

if (modifyConfiguration) {
  // 2. Select databases
  const selectedDatabaseIds = await SelectionDialogs.selectDatabases(
    availableDatabases,
    configuredDatabases,
    { showSelectAll: true }
  );

  // 3. Select tables for each database
  const tableSelectionsMap = new Map<string, string[]>();
  for (const databaseId of selectedDatabaseIds) {
    const selectedTableIds = await SelectionDialogs.selectTablesForDatabase(
      databaseId,
      databaseName,
      availableTables,
      configuredTables
    );
    tableSelectionsMap.set(databaseId, selectedTableIds);
  }

  // 4. Select buckets
  const selectedBucketIds = await SelectionDialogs.selectBucketsForDatabases(
    selectedDatabaseIds,
    availableBuckets,
    configuredBuckets
  );

  // 5. Create selection summary and confirm
  const selectionSummary = SelectionDialogs.createSyncSelectionSummary(
    databaseSelections,
    bucketSelections
  );

  const confirmed = await SelectionDialogs.confirmSyncSelection(selectionSummary);

  if (confirmed) {
    // Proceed with sync operation
  }
}
```

## Configuration Options

### Database Selection Options
- `showSelectAll`: Show "Select All" option (default: true)
- `allowNewOnly`: Only show new/unconfigured databases (default: false)
- `defaultSelected`: Array of database IDs to pre-select

### Table Selection Options
- `showSelectAll`: Show "Select All" option (default: true)
- `allowNewOnly`: Only show new/unconfigured tables (default: false)
- `defaultSelected`: Array of table IDs to pre-select
- `showDatabaseContext`: Show database name in header (default: true)

### Bucket Selection Options
- `showSelectAll`: Show "Select All" option (default: true)
- `allowNewOnly`: Only show new/unconfigured buckets (default: false)
- `defaultSelected`: Array of bucket IDs to pre-select
- `groupByDatabase`: Group buckets by database (default: true)

## Interfaces

### `SyncSelectionSummary`
Contains complete selection information:
- `databases`: Array of selected databases with their tables
- `buckets`: Array of selected buckets
- `totalDatabases/Tables/Buckets`: Count of selected items
- `newItems/existingItems`: Breakdown of new vs existing configurations

### `DatabaseSelection`
Represents a selected database:
- `databaseId/databaseName`: Database identification
- `tableIds/tableNames`: Selected tables for this database
- `isNew`: Whether this is a new configuration

### `BucketSelection`
Represents a selected bucket:
- `bucketId/bucketName`: Bucket identification
- `databaseId/databaseName`: Associated database (if applicable)
- `isNew`: Whether this is a new configuration

## Integration

The selection dialogs are designed to integrate seamlessly with the existing CLI infrastructure:

- Uses `MessageFormatter` for consistent styling
- Integrates with existing logging system
- Follows established error handling patterns
- Compatible with existing configuration management
- Uses inquirer.js for interactive prompts