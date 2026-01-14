import inquirer from "inquirer";
import chalk from "chalk";
import type { Models } from "node-appwrite";
import { MessageFormatter } from 'appwrite-utils-helpers';
import { logger } from 'appwrite-utils-helpers';

/**
 * Interface for sync selection summary
 */
export interface SyncSelectionSummary {
  databases: DatabaseSelection[];
  buckets: BucketSelection[];
  totalDatabases: number;
  totalTables: number;
  totalBuckets: number;
  newItems: {
    databases: number;
    tables: number;
    buckets: number;
  };
  existingItems: {
    databases: number;
    tables: number;
    buckets: number;
  };
}

/**
 * Database selection with associated tables
 */
export interface DatabaseSelection {
  databaseId: string;
  databaseName: string;
  tableIds: string[];
  tableNames: string[];
  isNew: boolean;
}

/**
 * Bucket selection with associated database
 */
export interface BucketSelection {
  bucketId: string;
  bucketName: string;
  databaseId?: string;
  databaseName?: string;
  isNew: boolean;
}

/**
 * Options for database selection
 */
export interface DatabaseSelectionOptions {
  showSelectAll?: boolean;
  allowNewOnly?: boolean;
  defaultSelected?: string[];
}

/**
 * Options for table selection
 */
export interface TableSelectionOptions {
  showSelectAll?: boolean;
  allowNewOnly?: boolean;
  defaultSelected?: string[];
  showDatabaseContext?: boolean;
}

/**
 * Options for bucket selection
 */
export interface BucketSelectionOptions {
  showSelectAll?: boolean;
  allowNewOnly?: boolean;
  defaultSelected?: string[];
  groupByDatabase?: boolean;
}

/**
 * Response from existing config prompt
 */
export interface ExistingConfigResponse {
  syncExisting: boolean;
  modifyConfiguration: boolean;
}

/**
 * Comprehensive selection dialog system for enhanced sync flow
 *
 * This class provides interactive dialogs for selecting databases, tables/collections,
 * and storage buckets during sync operations. It supports both new and existing
 * configurations with visual indicators and comprehensive confirmation flows.
 *
 * @example
 * ```typescript
 * import { SelectionDialogs } from './shared/selectionDialogs.js';
 * import type { Models } from 'node-appwrite';
 *
 * // Example usage in a sync command
 * const availableDatabases: Models.Database[] = await getAvailableDatabases();
 * const configuredDatabases = config.databases || [];
 *
 * // Prompt about existing configuration
 * const { syncExisting, modifyConfiguration } = await SelectionDialogs.promptForExistingConfig(configuredDatabases);
 *
 * if (modifyConfiguration) {
 *   // Select databases
 *   const selectedDatabaseIds = await SelectionDialogs.selectDatabases(
 *     availableDatabases,
 *     configuredDatabases,
 *     { showSelectAll: true, allowNewOnly: !syncExisting }
 *   );
 *
 *   // For each database, select tables
 *   const tableSelectionsMap = new Map<string, string[]>();
 *   const availableTablesMap = new Map<string, any[]>();
 *
 *   for (const databaseId of selectedDatabaseIds) {
 *     const database = availableDatabases.find(db => db.$id === databaseId)!;
 *     const availableTables = await getTablesForDatabase(databaseId);
 *     const configuredTables = getConfiguredTablesForDatabase(databaseId);
 *
 *     availableTablesMap.set(databaseId, availableTables);
 *
 *     const selectedTableIds = await SelectionDialogs.selectTablesForDatabase(
 *       databaseId,
 *       database.name,
 *       availableTables,
 *       configuredTables,
 *       { showSelectAll: true, allowNewOnly: !syncExisting }
 *     );
 *
 *     tableSelectionsMap.set(databaseId, selectedTableIds);
 *   }
 *
 *   // Select buckets
 *   const availableBuckets = await getAvailableBuckets();
 *   const configuredBuckets = config.buckets || [];
 *   const selectedBucketIds = await SelectionDialogs.selectBucketsForDatabases(
 *     selectedDatabaseIds,
 *     availableBuckets,
 *     configuredBuckets,
 *     { showSelectAll: true, groupByDatabase: true }
 *   );
 *
 *   // Create selection objects
 *   const databaseSelections = SelectionDialogs.createDatabaseSelection(
 *     selectedDatabaseIds,
 *     availableDatabases,
 *     tableSelectionsMap,
 *     configuredDatabases,
 *     availableTablesMap
 *   );
 *
 *   const bucketSelections = SelectionDialogs.createBucketSelection(
 *     selectedBucketIds,
 *     availableBuckets,
 *     configuredBuckets,
 *     availableDatabases
 *   );
 *
 *   // Show final confirmation
 *   const selectionSummary = SelectionDialogs.createSyncSelectionSummary(
 *     databaseSelections,
 *     bucketSelections
 *   );
 *
 *   const confirmed = await SelectionDialogs.confirmSyncSelection(selectionSummary);
 *
 *   if (confirmed) {
 *     // Proceed with sync operation
 *     await performSync(databaseSelections, bucketSelections);
 *   }
 * }
 * ```
 */
export class SelectionDialogs {
  /**
   * Prompts user about existing configuration
   */
  static async promptForExistingConfig(configuredItems: any[]): Promise<ExistingConfigResponse> {
    if (configuredItems.length === 0) {
      return { syncExisting: false, modifyConfiguration: true };
    }

    MessageFormatter.section("Existing Configuration Found");
    MessageFormatter.info(`Found ${configuredItems.length} configured items.`, { skipLogging: true });

    const { syncExisting } = await inquirer.prompt([{
      type: 'confirm',
      name: 'syncExisting',
      message: 'Sync existing configured items?',
      default: true
    }]);

    if (!syncExisting) {
      return { syncExisting: false, modifyConfiguration: true };
    }

    const { modifyConfiguration } = await inquirer.prompt([{
      type: 'confirm',
      name: 'modifyConfiguration',
      message: 'Add/remove items from configuration?',
      default: false
    }]);

    return { syncExisting, modifyConfiguration };
  }

  /**
   * Shows database selection dialog with indicators for configured vs new databases
   */
  static async selectDatabases(
    availableDatabases: Models.Database[],
    configuredDatabases: any[],
    options: DatabaseSelectionOptions = {}
  ): Promise<string[]> {
    const {
      showSelectAll = true,
      allowNewOnly = false,
      defaultSelected = []
    } = options;

    MessageFormatter.section("Database Selection");

    const configuredIds = new Set(configuredDatabases.map(db => db.$id || db.id));

    let choices: any[] = [];

    if (showSelectAll && availableDatabases.length > 1) {
      choices.push({
        name: chalk.green.bold('📋 Select All Databases'),
        value: '__SELECT_ALL__',
        short: 'All databases'
      });
    }

    availableDatabases.forEach(database => {
      const isConfigured = configuredIds.has(database.$id);
      const status = isConfigured ? chalk.green('✅') : chalk.blue('○');
      const name = `${status} ${database.name} (${database.$id})`;

      if (allowNewOnly && isConfigured) {
        return; // Skip configured databases if only allowing new ones
      }

      choices.push({
        name,
        value: database.$id,
        short: database.name,
        // Do not preselect anything unless explicitly provided
        checked: defaultSelected.includes(database.$id)
      });
    });

    if (choices.length === 0) {
      MessageFormatter.warning("No databases available for selection.", { skipLogging: true });
      return [];
    }

    const { selectedDatabaseIds } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'selectedDatabaseIds',
      message: 'Select databases to sync:',
      choices,
      validate: (input: string[]) => {
        if (input.length === 0) {
          return chalk.red('Please select at least one database.');
        }
        if (input.includes('__SELECT_ALL__') && input.length > 1) {
          return chalk.red('Cannot select "Select All" with individual databases.');
        }
        return true;
      }
    }]);

    // Handle select all
    if (selectedDatabaseIds.includes('__SELECT_ALL__')) {
      const allIds = availableDatabases.map(db => db.$id);
      if (allowNewOnly) {
        return allIds.filter(id => !configuredIds.has(id));
      }
      return allIds;
    }

    return selectedDatabaseIds;
  }

  /**
   * Shows table/collection selection dialog for a specific database
   */
  static async selectTablesForDatabase(
    databaseId: string,
    databaseName: string,
    availableTables: any[],
    configuredTables: any[],
    options: TableSelectionOptions = {}
  ): Promise<string[]> {
    const {
      showSelectAll = true,
      allowNewOnly = false,
      defaultSelected = [],
      showDatabaseContext = true
    } = options;

    if (showDatabaseContext) {
      MessageFormatter.section(`Table Selection for ${databaseName}`);
    }

    const configuredIds = new Set(configuredTables.map(table => table.$id || table.id || (table as any).tableId || table.name));

    let choices: any[] = [];

    if (showSelectAll && availableTables.length > 1) {
      choices.push({
        name: chalk.green.bold('📋 Select All Tables'),
        value: '__SELECT_ALL__',
        short: 'All tables'
      });
    }

    availableTables.forEach(table => {
      const tableId = table.$id || table.id || (table as any).tableId || table.name;
      const isConfigured = configuredIds.has(tableId);
      const status = isConfigured ? chalk.green('✅') : chalk.blue('○');
      const name = `${status} ${table.name} (${tableId})`;

      if (allowNewOnly && isConfigured) {
        return; // Skip configured tables if only allowing new ones
      }

      choices.push({
        name,
        value: tableId,
        short: table.name,
        // Do not preselect anything unless explicitly provided
        checked: defaultSelected.includes(tableId)
      });
    });

    if (choices.length === 0) {
      MessageFormatter.warning(`No tables available for database: ${databaseName}`, { skipLogging: true });
      return [];
    }

    const { selectedTableIds } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'selectedTableIds',
      message: `Select tables to sync for ${databaseName}:`,
      choices,
      validate: (input: string[]) => {
        if (input.length === 0) {
          return chalk.red('Please select at least one table.');
        }
        if (input.includes('__SELECT_ALL__') && input.length > 1) {
          return chalk.red('Cannot select "Select All" with individual tables.');
        }
        return true;
      }
    }]);

    // Handle select all
    if (selectedTableIds.includes('__SELECT_ALL__')) {
      const allIds = availableTables.map(table => table.$id || table.id || (table as any).tableId || table.name);
      if (allowNewOnly) {
        return allIds.filter(id => !configuredIds.has(id));
      }
      return allIds;
    }

    return selectedTableIds;
  }

  /**
   * Shows bucket selection dialog for selected databases
   */
  static async selectBucketsForDatabases(
    selectedDatabaseIds: string[],
    availableBuckets: any[],
    configuredBuckets: any[],
    options: BucketSelectionOptions = {}
  ): Promise<string[]> {
    const {
      showSelectAll = true,
      allowNewOnly = false,
      defaultSelected = [],
      groupByDatabase = true
    } = options;

    MessageFormatter.section("Storage Bucket Selection");

    const configuredIds = new Set(configuredBuckets.map(bucket => bucket.$id || bucket.id));

    // Filter buckets that are associated with selected databases
    const relevantBuckets = availableBuckets.filter(bucket => {
      if (selectedDatabaseIds.length === 0) return true; // If no databases selected, show all buckets
      return selectedDatabaseIds.includes(bucket.databaseId) || !bucket.databaseId;
    });

    if (relevantBuckets.length === 0) {
      MessageFormatter.warning("No storage buckets available for selected databases.", { skipLogging: true });
      return [];
    }

    let choices: any[] = [];

    if (showSelectAll && relevantBuckets.length > 1) {
      choices.push({
        name: chalk.green.bold('📋 Select All Buckets'),
        value: '__SELECT_ALL__',
        short: 'All buckets'
      });
    }

    if (groupByDatabase) {
      // Group buckets by database
      const bucketsByDatabase = new Map<string, any[]>();

      relevantBuckets.forEach(bucket => {
        const dbId = bucket.databaseId || 'ungrouped';
        if (!bucketsByDatabase.has(dbId)) {
          bucketsByDatabase.set(dbId, []);
        }
        bucketsByDatabase.get(dbId)!.push(bucket);
      });

      // Add buckets grouped by database
      selectedDatabaseIds.forEach(dbId => {
        const buckets = bucketsByDatabase.get(dbId) || [];
        if (buckets.length > 0) {
          choices.push(new inquirer.Separator(chalk.cyan(`📁 Database: ${dbId}`)));

          buckets.forEach(bucket => {
            const isConfigured = configuredIds.has(bucket.$id);
            const status = isConfigured ? chalk.green('✅') : chalk.blue('○');
            const name = `${status} ${bucket.name} (${bucket.$id})`;

            if (allowNewOnly && isConfigured) {
              return; // Skip configured buckets if only allowing new ones
            }

            choices.push({
              name: `  ${name}`,
              value: bucket.$id,
              short: bucket.name,
              // Do not preselect anything unless explicitly provided
              checked: defaultSelected.includes(bucket.$id)
            });
          });
        }
      });

      // Add ungrouped buckets
      const ungroupedBuckets = bucketsByDatabase.get('ungrouped') || [];
      if (ungroupedBuckets.length > 0) {
        choices.push(new inquirer.Separator(chalk.cyan('📁 General Storage')));

        ungroupedBuckets.forEach(bucket => {
          const isConfigured = configuredIds.has(bucket.$id);
          const status = isConfigured ? chalk.green('✅') : chalk.blue('○');
          const name = `${status} ${bucket.name} (${bucket.$id})`;

          if (allowNewOnly && isConfigured) {
            return; // Skip configured buckets if only allowing new ones
          }

          choices.push({
            name: `  ${name}`,
            value: bucket.$id,
            short: bucket.name,
            checked: defaultSelected.includes(bucket.$id) || (!allowNewOnly && isConfigured)
          });
        });
      }
    } else {
      // Flat list of buckets
      relevantBuckets.forEach(bucket => {
        const isConfigured = configuredIds.has(bucket.$id);
        const status = isConfigured ? chalk.green('✅') : chalk.blue('○');
        const dbContext = bucket.databaseId ? ` [${bucket.databaseId}]` : '';
        const name = `${status} ${bucket.name} (${bucket.$id})${dbContext}`;

        if (allowNewOnly && isConfigured) {
          return; // Skip configured buckets if only allowing new ones
        }

        choices.push({
          name,
          value: bucket.$id,
          short: bucket.name,
          // Do not preselect anything unless explicitly provided
          checked: defaultSelected.includes(bucket.$id)
        });
      });
    }

    const { selectedBucketIds } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'selectedBucketIds',
      message: 'Select storage buckets to sync:',
      choices,
      validate: (input: string[]) => {
        if (input.length === 0) {
          return chalk.yellow('No storage buckets selected. Continue with databases only?') || true;
        }
        if (input.includes('__SELECT_ALL__') && input.length > 1) {
          return chalk.red('Cannot select "Select All" with individual buckets.');
        }
        return true;
      }
    }]);

    // Handle select all
    if (selectedBucketIds && selectedBucketIds.includes('__SELECT_ALL__')) {
      const allIds = relevantBuckets.map(bucket => bucket.$id);
      if (allowNewOnly) {
        return allIds.filter(id => !configuredIds.has(id));
      }
      return allIds;
    }

    return selectedBucketIds || [];
  }

  /**
   * Shows final confirmation dialog with sync selection summary
   */
  static async confirmSyncSelection(
    selectionSummary: SyncSelectionSummary,
    operationType: 'push' | 'pull' | 'sync' = 'sync'
  ): Promise<boolean> {
    const labels = {
      push: {
        banner: "Push Selection Summary",
        subtitle: "Review selections before pushing to Appwrite",
        confirm: "Proceed with push operation?",
        success: "Push operation confirmed.",
        cancel: "Push operation cancelled."
      },
      pull: {
        banner: "Pull Selection Summary",
        subtitle: "Review selections before pulling from Appwrite",
        confirm: "Proceed with pull operation?",
        success: "Pull operation confirmed.",
        cancel: "Pull operation cancelled."
      },
      sync: {
        banner: "Sync Selection Summary",
        subtitle: "Review your selections before proceeding",
        confirm: "Proceed with sync operation?",
        success: "Sync operation confirmed.",
        cancel: "Sync operation cancelled."
      }
    };

    const label = labels[operationType];

    MessageFormatter.banner(label.banner, label.subtitle);

    // Database summary
    console.log(chalk.bold.cyan("\n📊 Databases:"));
    console.log(`  Total: ${selectionSummary.totalDatabases}`);
    console.log(`  ${chalk.green('✅ Configured')}: ${selectionSummary.existingItems.databases}`);
    console.log(`  ${chalk.blue('○ New')}: ${selectionSummary.newItems.databases}`);

    if (selectionSummary.databases.length > 0) {
      console.log(chalk.gray("\n  Selected databases:"));
      selectionSummary.databases.forEach(db => {
        const status = db.isNew ? chalk.blue('○') : chalk.green('✅');
        console.log(`    ${status} ${db.databaseName} (${db.tableNames.length} tables)`);
      });
    }

    // Table summary
    console.log(chalk.bold.cyan("\n📋 Tables/Collections:"));
    console.log(`  Total: ${selectionSummary.totalTables}`);
    console.log(`  ${chalk.green('✅ Configured')}: ${selectionSummary.existingItems.tables}`);
    console.log(`  ${chalk.blue('○ New')}: ${selectionSummary.newItems.tables}`);

    // Bucket summary
    console.log(chalk.bold.cyan("\n🪣 Storage Buckets:"));
    console.log(`  Total: ${selectionSummary.totalBuckets}`);
    console.log(`  ${chalk.green('✅ Configured')}: ${selectionSummary.existingItems.buckets}`);
    console.log(`  ${chalk.blue('○ New')}: ${selectionSummary.newItems.buckets}`);

    if (selectionSummary.buckets.length > 0) {
      console.log(chalk.gray("\n  Selected buckets:"));
      selectionSummary.buckets.forEach(bucket => {
        const status = bucket.isNew ? chalk.blue('○') : chalk.green('✅');
        const dbContext = bucket.databaseName ? ` [${bucket.databaseName}]` : '';
        console.log(`    ${status} ${bucket.bucketName}${dbContext}`);
      });
    }

    console.log(); // Add spacing

    const { confirmed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmed',
      message: chalk.green.bold(label.confirm),
      default: true
    }]);

    if (confirmed) {
      MessageFormatter.success(label.success, { skipLogging: true });
      logger.info(`${operationType} selection confirmed`, {
        databases: selectionSummary.totalDatabases,
        tables: selectionSummary.totalTables,
        buckets: selectionSummary.totalBuckets
      });
    } else {
      MessageFormatter.warning(label.cancel, { skipLogging: true });
      logger.info(`${operationType} selection cancelled by user`);
    }

    return confirmed;
  }

  /**
   * Creates a sync selection summary from selected items
   */
  static createSyncSelectionSummary(
    databaseSelections: DatabaseSelection[],
    bucketSelections: BucketSelection[]
  ): SyncSelectionSummary {
    const totalDatabases = databaseSelections.length;
    const totalTables = databaseSelections.reduce((sum, db) => sum + db.tableIds.length, 0);
    const totalBuckets = bucketSelections.length;

    const newDatabases = databaseSelections.filter(db => db.isNew).length;
    const newTables = databaseSelections.reduce((sum, db) =>
      sum + db.tableIds.length, 0); // TODO: Track which tables are new
    const newBuckets = bucketSelections.filter(bucket => bucket.isNew).length;

    const existingDatabases = totalDatabases - newDatabases;
    const existingTables = totalTables - newTables;
    const existingBuckets = totalBuckets - newBuckets;

    return {
      databases: databaseSelections,
      buckets: bucketSelections,
      totalDatabases,
      totalTables,
      totalBuckets,
      newItems: {
        databases: newDatabases,
        tables: newTables,
        buckets: newBuckets
      },
      existingItems: {
        databases: existingDatabases,
        tables: existingTables,
        buckets: existingBuckets
      }
    };
  }

  /**
   * Helper method to create database selection objects
   */
  static createDatabaseSelection(
    selectedDatabaseIds: string[],
    availableDatabases: Models.Database[],
    tableSelectionsMap: Map<string, string[]>,
    configuredDatabases: any[],
    availableTablesMap: Map<string, any[]> = new Map()
  ): DatabaseSelection[] {
    const configuredIds = new Set(configuredDatabases.map(db => db.$id || db.id));

    return selectedDatabaseIds.map(databaseId => {
      const database = availableDatabases.find(db => db.$id === databaseId);
      if (!database) {
        throw new Error(`Database with ID ${databaseId} not found in available databases`);
      }

      const tableIds = tableSelectionsMap.get(databaseId) || [];
      const tables = availableTablesMap.get(databaseId) || [];
      const tableNames: string[] = tables.map(table => table.name || table.$id || `Table-${table.$id}`);

      return {
        databaseId,
        databaseName: database.name,
        tableIds,
        tableNames,
        isNew: !configuredIds.has(databaseId)
      };
    });
  }

  /**
   * Helper method to create bucket selection objects
   */
  static createBucketSelection(
    selectedBucketIds: string[],
    availableBuckets: any[],
    configuredBuckets: any[],
    availableDatabases: Models.Database[]
  ): BucketSelection[] {
    const configuredIds = new Set(configuredBuckets.map(bucket => bucket.$id || bucket.id));

    return selectedBucketIds.map(bucketId => {
      const bucket = availableBuckets.find(b => b.$id === bucketId);
      if (!bucket) {
        throw new Error(`Bucket with ID ${bucketId} not found in available buckets`);
      }

      const database = bucket.databaseId ?
        availableDatabases.find(db => db.$id === bucket.databaseId) : undefined;

      return {
        bucketId,
        bucketName: bucket.name,
        databaseId: bucket.databaseId,
        databaseName: database?.name,
        isNew: !configuredIds.has(bucketId)
      };
    });
  }

  /**
   * Shows a progress message during selection operations
   */
  static showProgress(message: string): void {
    MessageFormatter.progress(message, { skipLogging: true });
  }

  /**
   * Shows an error message and handles graceful cancellation
   */
  static showError(message: string, error?: Error): void {
    MessageFormatter.error(message, error, { skipLogging: true });
    logger.error(`Selection dialog error: ${message}`, { error: error?.message });
  }

  /**
   * Shows a warning message
   */
  static showWarning(message: string): void {
    MessageFormatter.warning(message, { skipLogging: true });
    logger.warn(`Selection dialog warning: ${message}`);
  }

  /**
   * Shows a success message
   */
  static showSuccess(message: string): void {
    MessageFormatter.success(message, { skipLogging: true });
    logger.info(`Selection dialog success: ${message}`);
  }
}
