import winston from "winston";
import fs from "fs";
import path from "path";

export interface LoggingConfig {
  enabled: boolean;
  level: string;
  logDirectory?: string;
  console: boolean;
}

const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  enabled: false,
  level: "info",
  console: false,
};

let loggingConfig: LoggingConfig = DEFAULT_LOGGING_CONFIG;

export const configureLogging = (config: Partial<LoggingConfig> = {}) => {
  loggingConfig = { ...DEFAULT_LOGGING_CONFIG, ...config };
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
    const logDir = loggingConfig.logDirectory || path.join(process.cwd(), "zlogs");
    
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
