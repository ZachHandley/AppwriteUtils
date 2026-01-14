/**
 * Converts a string to PascalCase
 * @param str - String to convert
 * @returns PascalCase string
 */
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

/**
 * Converts a string to camelCase
 * @param str - String to convert
 * @returns camelCase string
 */
export const toCamelCase = (str: string): string => {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) =>
      index === 0 ? word.toLowerCase() : word.toUpperCase()
    )
    .replace(/\s+/g, "");
};
