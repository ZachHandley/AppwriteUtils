import fs from "node:fs";
import path from "node:path";

export const toPascalCase = (str: string): string => {
  return (
    str
      // Split the string into words on spaces or camelCase transitions
      .split(/(?:\s+)|(?:([A-Z][a-z]+))/g)
      // Filter out empty strings that can appear due to the split regex
      .filter(Boolean)
      // Capitalize the first letter of each word and join them together
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join("")
  );
};

export const toCamelCase = (str: string): string => {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) =>
      index === 0 ? word.toLowerCase() : word.toUpperCase()
    )
    .replace(/\s+/g, "");
};

export const ensureDirectoryExistence = (filePath: string) => {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
};

export const writeFileSync = (
  filePath: string,
  content: string,
  options: { flag: string }
) => {
  ensureDirectoryExistence(filePath);
  fs.writeFileSync(filePath, content, options);
};

export const readFileSync = (filePath: string) => {
  return fs.readFileSync(filePath, "utf8");
};

export const existsSync = (filePath: string) => {
  return fs.existsSync(filePath);
};

export const mkdirSync = (filePath: string) => {
  ensureDirectoryExistence(filePath);
  fs.mkdirSync(filePath);
};

export const readdirSync = (filePath: string) => {
  return fs.readdirSync(filePath);
};

export const safeParseDate = (dateStr: string | undefined): string | null => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date.toISOString();
};

export const areCollectionNamesSame = (a: string, b: string) => {
  return (
    a.toLowerCase().trim().replace(" ", "") ===
    b.toLowerCase().trim().replace(" ", "")
  );
};
