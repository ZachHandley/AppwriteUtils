import winston from "winston";

export const logger = winston.createLogger({
  level: "info",
  format: winston.format.prettyPrint(),
  defaultMeta: { service: "appwrite-utils-cli" },
  transports: [
    //
    // - Write all logs with importance level of `error` or less to `error.log`
    // - Write all logs with importance level of `info` or less to `combined.log`
    //
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});
