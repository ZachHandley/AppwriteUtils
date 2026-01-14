import chalk from "chalk";

export interface MessageOptions {
  prefix?: string;
  skipLogging?: boolean;
  logLevel?: "info" | "warn" | "error" | "debug";
}

/**
 * Simple message formatter for schema generation utilities
 * This is a lightweight version suitable for the helpers package
 */
export class MessageFormatter {
  static success(message: string, options: MessageOptions = {}) {
    const formatted = `${chalk.green("✅")} ${options.prefix ? `${options.prefix}: ` : ""}${message}`;
    console.log(formatted);
  }

  static error(message: string, error?: Error | string, options: MessageOptions = {}) {
    const errorDetails = error instanceof Error ? error.message : error;
    const formatted = `${chalk.red("❌")} ${options.prefix ? `${options.prefix}: ` : ""}${message}${errorDetails ? `\n   ${chalk.gray(errorDetails)}` : ""}`;
    console.error(formatted);
  }

  static warning(message: string, options: MessageOptions = {}) {
    const formatted = `${chalk.yellow("⚠️")} ${options.prefix ? `${options.prefix}: ` : ""}${message}`;
    console.log(formatted);
  }

  static info(message: string, options: MessageOptions = {}) {
    const formatted = `${chalk.blue("ℹ️")} ${options.prefix ? `${options.prefix}: ` : ""}${message}`;
    console.log(formatted);
  }

  static processing(message: string, options: MessageOptions = {}) {
    const formatted = `${chalk.cyan("⚙️")} ${options.prefix ? `${options.prefix}: ` : ""}${message}`;
    console.log(formatted);
  }
}
