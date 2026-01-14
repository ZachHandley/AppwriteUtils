import inquirer from "inquirer";
import chalk from "chalk";
import { MessageFormatter } from 'appwrite-utils-helpers';

export interface DestructiveOperationOptions {
  operation: string;
  targets: string[];
  consequences?: string[];
  requireExplicitConfirmation?: boolean;
  confirmationText?: string;
  skipConfirmation?: boolean;
}

export interface BackupPromptOptions {
  operation: string;
  targets: string[];
  recommendBackup?: boolean;
  backupMessage?: string;
}

export class ConfirmationDialogs {
  /**
   * Shows a confirmation dialog for destructive operations
   */
  static async confirmDestructiveOperation(options: DestructiveOperationOptions): Promise<boolean> {
    if (options.skipConfirmation) {
      return true;
    }

    MessageFormatter.warning(`You are about to perform a destructive operation:`, { skipLogging: true });
    MessageFormatter.error(`Operation: ${options.operation}`, undefined, { skipLogging: true });
    MessageFormatter.warning(`Targets: ${options.targets.join(", ")}`, { skipLogging: true });

    if (options.consequences && options.consequences.length > 0) {
      MessageFormatter.error("This will:", undefined, { skipLogging: true });
      options.consequences.forEach(consequence => {
        MessageFormatter.error(`  • ${consequence}`, undefined, { skipLogging: true });
      });
    }

    MessageFormatter.error("⚠️  THIS ACTION CANNOT BE UNDONE!", undefined, { skipLogging: true });

    if (options.requireExplicitConfirmation && options.confirmationText) {
      const { confirmation } = await inquirer.prompt([{
        type: 'input',
        name: 'confirmation',
        message: chalk.red(`Type "${options.confirmationText}" to confirm:`),
        validate: (input: string) => {
          return input === options.confirmationText || 
            chalk.red(`Please type exactly: ${options.confirmationText}`);
        }
      }]);
      
      return confirmation === options.confirmationText;
    } else {
      const { confirmed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmed',
        message: chalk.red('Are you absolutely sure you want to continue?'),
        default: false
      }]);
      
      return confirmed;
    }
  }

  /**
   * Prompts user about creating a backup before a destructive operation
   */
  static async promptForBackup(options: BackupPromptOptions): Promise<'yes' | 'no' | 'skip'> {
    const message = options.backupMessage ||
      `Create a backup before performing ${options.operation} on: ${options.targets.join(", ")}?`;

    MessageFormatter.info("🛡️  Backup Recommendation", { skipLogging: true });
    if (options.recommendBackup !== false) {
      MessageFormatter.warning("It's strongly recommended to create a backup before proceeding.", { skipLogging: true });
    }
    
    const { choice } = await inquirer.prompt([{
      type: 'list',
      name: 'choice',
      message,
      choices: [
        { name: '🛡️  Yes, create backup first', value: 'yes' },
        { name: '⚠️  No, proceed without backup', value: 'no' },
        { name: '❌ Cancel operation', value: 'skip' }
      ],
      default: 'yes'
    }]);

    return choice;
  }

  /**
   * Shows a final confirmation before proceeding with an operation
   */
  static async finalConfirmation(operation: string, details?: string[]): Promise<boolean> {
    MessageFormatter.success(`Ready to perform: ${operation}`, { skipLogging: true });

    if (details && details.length > 0) {
      MessageFormatter.debug("Details:", undefined, { skipLogging: true });
      details.forEach(detail => {
        MessageFormatter.debug(`  • ${detail}`, undefined, { skipLogging: true });
      });
    }

    const { proceed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'proceed',
      message: 'Proceed with this operation?',
      default: true
    }]);

    return proceed;
  }

  /**
   * Specialized confirmation for database wiping
   */
  static async confirmDatabaseWipe(databaseNames: string[], options: {
    includeStorage?: boolean;
    includeUsers?: boolean;
    skipConfirmation?: boolean;
  } = {}): Promise<boolean> {
    const consequences = [
      "Delete all documents in the specified databases",
      "Remove all collections and their data",
    ];

    if (options.includeStorage) {
      consequences.push("Delete all files in associated storage buckets");
    }

    if (options.includeUsers) {
      consequences.push("Delete all user accounts");
    }

    return this.confirmDestructiveOperation({
      operation: "Database Wipe",
      targets: databaseNames,
      consequences,
      requireExplicitConfirmation: true,
      confirmationText: "DELETE ALL DATA",
      skipConfirmation: options.skipConfirmation,
    });
  }

  /**
   * Specialized confirmation for collection wiping
   */
  static async confirmCollectionWipe(
    databaseName: string, 
    collectionNames: string[],
    options: { skipConfirmation?: boolean } = {}
  ): Promise<boolean> {
    return this.confirmDestructiveOperation({
      operation: "Collection Wipe",
      targets: collectionNames.map(name => `${databaseName}.${name}`),
      consequences: [
        "Delete all documents in the specified collections",
        "Keep the collection structure intact",
      ],
      requireExplicitConfirmation: collectionNames.length > 5,
      confirmationText: "DELETE DOCUMENTS",
      skipConfirmation: options.skipConfirmation,
    });
  }

  /**
   * Specialized confirmation for function deployment
   */
  static async confirmFunctionDeployment(
    functionNames: string[],
    options: { 
      isProduction?: boolean; 
      hasBreakingChanges?: boolean;
      skipConfirmation?: boolean;
    } = {}
  ): Promise<boolean> {
    if (options.skipConfirmation) {
      return true;
    }

    const consequences = ["Replace existing function code"];
    
    if (options.isProduction) {
      consequences.push("Affect production environment");
    }

    if (options.hasBreakingChanges) {
      consequences.push("Potentially break existing integrations");
    }

    return this.confirmDestructiveOperation({
      operation: "Function Deployment",
      targets: functionNames,
      consequences: consequences.length > 1 ? consequences : undefined,
      requireExplicitConfirmation: options.isProduction || options.hasBreakingChanges,
      confirmationText: options.isProduction ? "DEPLOY TO PRODUCTION" : "DEPLOY",
    });
  }

  /**
   * Shows operation summary and asks for final confirmation
   */
  static async showOperationSummary(
    title: string,
    summary: Record<string, string | number | string[]>,
    options: { 
      confirmationRequired?: boolean;
      warningMessage?: string;
    } = {}
  ): Promise<boolean> {
    MessageFormatter.section(`${title} Summary`);
    
    Object.entries(summary).forEach(([key, value]) => {
      const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());

      if (Array.isArray(value)) {
        MessageFormatter.info(`● ${formattedKey}:`, { skipLogging: true });
        value.forEach(item => {
          MessageFormatter.debug(`  • ${item}`, undefined, { skipLogging: true });
        });
      } else {
        MessageFormatter.info(`● ${formattedKey}: ${String(value)}`, { skipLogging: true });
      }
    });

    if (options.warningMessage) {
      MessageFormatter.warning(`⚠️  ${options.warningMessage}`, { skipLogging: true });
    }

    if (options.confirmationRequired !== false) {
      const { confirmed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmed',
        message: 'Continue with this operation?',
        default: true
      }]);
      
      return confirmed;
    }

    return true;
  }

  /**
   * Interactive selection with confirmation
   */
  static async selectWithConfirmation<T>(
    items: T[],
    options: {
      message: string;
      displayProperty?: keyof T;
      multiSelect?: boolean;
      confirmMessage?: string;
      validator?: (selection: T[]) => string | true;
    }
  ): Promise<T[]> {
    const choices = items.map((item, index) => ({
      name: options.displayProperty ? String(item[options.displayProperty]) : String(item),
      value: item,
    }));

    const prompt = options.multiSelect ? 'checkbox' : 'list';
    const { selection } = await inquirer.prompt([{
      type: prompt,
      name: 'selection',
      message: options.message,
      choices,
      validate: options.validator ? (input: T[]) => {
        const result = options.validator!(Array.isArray(input) ? input : [input]);
        return result;
      } : undefined,
    }]);

    const selectedItems = Array.isArray(selection) ? selection : [selection];
    
    if (options.confirmMessage) {
      const confirmMessage = options.confirmMessage.replace(
        '{count}', 
        selectedItems.length.toString()
      );
      
      const { confirmed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmed',
        message: confirmMessage,
        default: true
      }]);

      if (!confirmed) {
        return [];
      }
    }

    return selectedItems;
  }

  /**
   * Confirms overwriting an existing file or directory
   */
  static async confirmOverwrite(target: string): Promise<boolean> {
    const { confirmed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmed',
      message: chalk.yellow(`${target} already exists. Overwrite?`),
      default: false
    }]);
    
    return confirmed;
  }

  /**
   * Confirms removal of a file
   */
  static async confirmRemoval(target: string): Promise<boolean> {
    const { confirmed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmed',
      message: chalk.red(target),
      default: false
    }]);
    
    return confirmed;
  }
}