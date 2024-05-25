import winston from "winston";
import fs from "fs";
import path from "path";

// Ensure the logs directory exists
const logDir = path.join(process.cwd(), "zlogs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

export const logger = winston.createLogger({
  level: "debug",
  format: winston.format.json({ space: 2 }),
  defaultMeta: { service: "appwrite-utils-cli" },
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
    }),
    new winston.transports.File({
      filename: path.join(logDir, "warn.log"),
      level: "warn",
    }),
    new winston.transports.File({
      filename: path.join(logDir, "info.log"),
      level: "info",
    }),
  ],
});
