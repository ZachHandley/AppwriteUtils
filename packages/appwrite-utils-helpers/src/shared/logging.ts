import winston from "winston";
import fs from "fs";
import os from "os";
import path from "path";

export interface LoggingConfig {
  enabled: boolean;
  level: string;
  logDirectory?: string;
  console: boolean;
}

/**
 * The CLI's stable, predictable log directory. Lives under the user's home so
 * a single path is always valid regardless of cwd — that's what users paste
 * when something breaks. Override with config.logging.logDirectory or
 * --logDir.
 */
export const DEFAULT_LOG_DIRECTORY = path.join(
  os.homedir(),
  ".appwrite-utils-cli",
  "logs"
);

/**
 * Predefined logging configurations for common debugging scenarios
 */
export const LOGGING_PRESETS = {
  /** Minimal logging - errors only to console */
  minimal: {
    enabled: false,
    level: 'error',
    console: true
  },
  /** Standard logging - info level to file and console */
  standard: {
    enabled: true,
    level: 'info',
    console: true
  },
  /** Debug logging - verbose debug output for troubleshooting */
  debug: {
    enabled: true,
    level: 'debug',
    console: true
  },
  /** File-only: capture everything to disk without spamming the user's terminal. The default for any CLI run. */
  file: {
    enabled: true,
    level: 'info',
    console: false
  },
  /** Silent - no logging output */
  silent: {
    enabled: false,
    level: 'error',
    console: false
  }
} as const;

const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  enabled: false,
  level: "info",
  console: false,
};

let loggingConfig: LoggingConfig = DEFAULT_LOGGING_CONFIG;

export const configureLogging = (config: Partial<LoggingConfig> = {}) => {
  loggingConfig = { ...DEFAULT_LOGGING_CONFIG, ...config };
};

/**
 * Configure logging using a preset
 */
export const configureLoggingPreset = (preset: keyof typeof LOGGING_PRESETS, logDirectory?: string) => {
  const presetConfig = LOGGING_PRESETS[preset];
  configureLogging({
    ...presetConfig,
    ...(logDirectory && { logDirectory })
  });
  updateLogger();
};

const createLogger = () => {
  const transports: winston.transport[] = [];

  // Add console transport if enabled
  if (loggingConfig.console) {
    transports.push(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }));
  }

  // Add file transports if logging is enabled
  if (loggingConfig.enabled) {
    const logDir = loggingConfig.logDirectory || DEFAULT_LOG_DIRECTORY;

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, "error.log"),
        level: "error",
      }),
      new winston.transports.File({
        filename: path.join(logDir, "combined.log"),
      })
    );
  }

  return winston.createLogger({
    level: loggingConfig.level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { service: "appwrite-utils-cli" },
    transports,
    silent: !loggingConfig.enabled && !loggingConfig.console,
  });
};

export let logger = createLogger();

// Recreate logger when config changes
export const updateLogger = () => {
  logger = createLogger();
};

/**
 * Enable debug logging for troubleshooting push process issues
 * This is a convenience function for quickly enabling comprehensive logging
 */
export const enableDebugLogging = (logDirectory?: string) => {
  configureLogging({
    enabled: true,
    level: 'debug',
    console: true,
    logDirectory
  });
  updateLogger();
  logger.info('Debug logging enabled for push process troubleshooting', {
    level: 'debug',
    console: true,
    logDirectory: logDirectory || 'zlogs',
    operation: 'enableDebugLogging'
  });
};

/**
 * Disable logging (reset to default)
 */
export const disableLogging = () => {
  configureLogging(DEFAULT_LOGGING_CONFIG);
  updateLogger();
};

/**
 * Get current logging configuration
 */
export const getLoggingConfig = () => ({ ...loggingConfig });

/**
 * Return the absolute paths the file transports are writing to right now, or
 * null when file logging is disabled. main.ts uses this to print the paths up
 * front and on failure so the user has one thing to paste.
 */
export const getActiveLogPaths = (): {
  directory: string;
  combined: string;
  error: string;
} | null => {
  if (!loggingConfig.enabled) return null;
  const directory = loggingConfig.logDirectory || DEFAULT_LOG_DIRECTORY;
  return {
    directory,
    combined: path.join(directory, "combined.log"),
    error: path.join(directory, "error.log"),
  };
};
