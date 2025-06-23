import inquirer from "inquirer";
import chalk from "chalk";
import { MessageFormatter } from "./messageFormatter.js";

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

    MessageFormatter.warning(`You are about to perform a destructive operation:`);
    console.log(chalk.red.bold(`  Operation: ${options.operation}`));
    console.log(chalk.yellow(`  Targets: ${options.targets.join(", ")}`));
    
    if (options.consequences && options.consequences.length > 0) {
      console.log(chalk.red("\n  This will:"));
      options.consequences.forEach(consequence => {
        console.log(chalk.red(`    • ${consequence}`));
      });
    }

    console.log(chalk.red("\n  ⚠️  THIS ACTION CANNOT BE UNDONE!"));

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

    console.log(chalk.blue("\n🛡️  Backup Recommendation"));
    if (options.recommendBackup !== false) {
      console.log(chalk.yellow("  It's strongly recommended to create a backup before proceeding."));
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
    console.log(chalk.green(`\n✅ Ready to perform: ${chalk.bold(operation)}`));
    
    if (details && details.length > 0) {
      console.log(chalk.gray("   Details:"));
      details.forEach(detail => {
        console.log(chalk.gray(`     • ${detail}`));
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
        console.log(`${chalk.gray("●")} ${formattedKey}:`);
        value.forEach(item => {
          console.log(`  ${chalk.gray("•")} ${item}`);
        });
      } else {
        console.log(`${chalk.gray("●")} ${formattedKey}: ${chalk.cyan(String(value))}`);
      }
    });

    if (options.warningMessage) {
      console.log(chalk.yellow(`\n⚠️  ${options.warningMessage}`));
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