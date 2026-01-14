import chalk from "chalk";
import { logger } from "./logging.js";

export interface MessageOptions {
  prefix?: string;
  skipLogging?: boolean;
  logLevel?: "info" | "warn" | "error" | "debug";
}

export class MessageFormatter {
  static success(message: string, options: MessageOptions = {}) {
    const formatted = `${chalk.green("✅")} ${options.prefix ? `${options.prefix}: ` : ""}${message}`;
    console.log(formatted);

    if (!options.skipLogging) {
      logger.info(`SUCCESS: ${options.prefix ? `${options.prefix}: ` : ""}${message}`);
    }
  }

  static error(message: string, error?: Error | string, options: MessageOptions = {}) {
    const errorDetails = error instanceof Error ? error.message : error;
    const formatted = `${chalk.red("❌")} ${options.prefix ? `${options.prefix}: ` : ""}${message}${errorDetails ? `\n   ${chalk.gray(errorDetails)}` : ""}`;
    console.error(formatted);

    if (!options.skipLogging) {
      logger.error(`ERROR: ${options.prefix ? `${options.prefix}: ` : ""}${message}`, {
        error: errorDetails,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  static warning(message: string, options: MessageOptions = {}) {
    const formatted = `${chalk.yellow("⚠️")} ${options.prefix ? `${options.prefix}: ` : ""}${message}`;
    console.log(formatted);

    if (!options.skipLogging) {
      logger.warn(`WARNING: ${options.prefix ? `${options.prefix}: ` : ""}${message}`);
    }
  }

  static info(message: string, options: MessageOptions = {}) {
    const formatted = `${chalk.blue("ℹ️")} ${options.prefix ? `${options.prefix}: ` : ""}${message}`;
    console.log(formatted);

    if (!options.skipLogging) {
      logger.info(`INFO: ${options.prefix ? `${options.prefix}: ` : ""}${message}`);
    }
  }

  static step(step: number, total: number, message: string, options: MessageOptions = {}) {
    const formatted = `${chalk.cyan(`[${step}/${total}]`)} ${options.prefix ? `${options.prefix}: ` : ""}${message}`;
    console.log(formatted);

    if (!options.skipLogging) {
      logger.info(`STEP ${step}/${total}: ${options.prefix ? `${options.prefix}: ` : ""}${message}`);
    }
  }

  static progress(message: string, options: MessageOptions = {}) {
    const formatted = `${chalk.gray("⏳")} ${options.prefix ? `${options.prefix}: ` : ""}${message}`;
    console.log(formatted);

    if (!options.skipLogging) {
      logger.debug(`PROGRESS: ${options.prefix ? `${options.prefix}: ` : ""}${message}`);
    }
  }

  static debug(message: string, data?: any, options: MessageOptions = {}) {
    if (process.env.NODE_ENV === "development" || process.env.DEBUG) {
      const formatted = `${chalk.magenta("🔍")} ${options.prefix ? `${options.prefix}: ` : ""}${message}`;
      console.log(formatted);
      if (data) {
        console.log(chalk.gray(JSON.stringify(data, null, 2)));
      }
    }

    if (!options.skipLogging) {
      logger.debug(`DEBUG: ${options.prefix ? `${options.prefix}: ` : ""}${message}`, data);
    }
  }

  static processing(message: string, options: MessageOptions = {}) {
    const formatted = `${chalk.cyan("⚙️")} ${options.prefix ? `${options.prefix}: ` : ""}${message}`;
    console.log(formatted);

    if (!options.skipLogging) {
      logger.info(`PROCESSING: ${options.prefix ? `${options.prefix}: ` : ""}${message}`);
    }
  }

  static divider() {
    console.log(chalk.gray("─".repeat(60)));
  }

  static banner(title: string, subtitle?: string) {
    const divider = chalk.cyan("═".repeat(60));
    console.log(`\n${divider}`);
    console.log(chalk.cyan.bold(`  ${title}`));
    if (subtitle) {
      console.log(chalk.gray(`  ${subtitle}`));
    }
    console.log(`${divider}\n`);
  }

  static section(title: string) {
    console.log(`\n${chalk.bold.underline(title)}`);
  }

  static list(items: string[], title?: string) {
    if (title) {
      console.log(chalk.bold(title));
    }
    items.forEach((item, index) => {
      console.log(`${chalk.gray(`  ${index + 1}.`)} ${item}`);
    });
  }

  static table(data: Record<string, string | number>[], headers?: string[]) {
    if (data.length === 0) return;

    const keys = headers || Object.keys(data[0]);
    const maxWidths = keys.map(key =>
      Math.max(
        key.length,
        ...data.map(row => String(row[key]).length)
      )
    );

    // Header
    const headerRow = keys.map((key, i) =>
      chalk.bold(key.padEnd(maxWidths[i]))
    ).join(" │ ");
    console.log(`┌─${keys.map((_, i) => "─".repeat(maxWidths[i])).join("─┼─")}─┐`);
    console.log(`│ ${headerRow} │`);
    console.log(`├─${keys.map((_, i) => "─".repeat(maxWidths[i])).join("─┼─")}─┤`);

    // Rows
    data.forEach(row => {
      const dataRow = keys.map((key, i) =>
        String(row[key]).padEnd(maxWidths[i])
      ).join(" │ ");
      console.log(`│ ${dataRow} │`);
    });
    console.log(`└─${keys.map((_, i) => "─".repeat(maxWidths[i])).join("─┴─")}─┘`);
  }

  static operationSummary(title: string, stats: Record<string, string | number>, duration?: number) {
    this.section(`${title} Summary`);

    Object.entries(stats).forEach(([key, value]) => {
      const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
      console.log(`${chalk.gray("●")} ${formattedKey}: ${chalk.cyan(String(value))}`);
    });

    if (duration) {
      console.log(`${chalk.gray("●")} Duration: ${chalk.cyan(this.formatDuration(duration))}`);
    }
    console.log();
  }

  static formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  static formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  static formatNumber(num: number): string {
    return num.toLocaleString();
  }
}

export const Messages = {
  CONFIG_NOT_FOUND: "Appwrite configuration not found. Run 'appwrite-migrate setup' first.",
  CONFIG_LOADED: (type: string, path: string) => `Loaded ${type} configuration from ${path}`,
  DATABASE_CONNECTION_FAILED: "Failed to connect to Appwrite. Check your endpoint and API key.",
  OPERATION_CANCELLED: "Operation cancelled by user.",
  OPERATION_COMPLETED: (operation: string) => `${operation} completed successfully`,
  BACKUP_STARTED: (database: string) => `Starting backup for database: ${database}`,
  BACKUP_COMPLETED: (database: string, size: number) => `Backup completed for ${database} (${MessageFormatter.formatBytes(size)})`,
  IMPORT_STARTED: (collections: number) => `Starting import process for ${collections} collection(s)`,
  IMPORT_COMPLETED: (documents: number) => `Import completed. Processed ${MessageFormatter.formatNumber(documents)} documents`,
  FUNCTION_DEPLOYED: (name: string) => `Function '${name}' deployed successfully`,
  FUNCTION_DEPLOYMENT_FAILED: (name: string, error: string) => `Function '${name}' deployment failed: ${error}`,
  TRANSFER_STARTED: (source: string, target: string) => `Starting transfer from ${source} to ${target}`,
  TRANSFER_COMPLETED: (items: number) => `Transfer completed. Moved ${MessageFormatter.formatNumber(items)} items`,
} as const;
