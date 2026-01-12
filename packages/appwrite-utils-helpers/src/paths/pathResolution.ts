import { existsSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { MessageFormatter } from '../shared/messageFormatter.js';
import { logger } from '../shared/logging.js';

/**
 * Expands tilde (~) in paths to the user's home directory
 * @param pathStr - Path string that may contain ~
 * @returns Expanded path with home directory
 */
export function expandTildePath(pathStr: string): string {
  if (!pathStr) return pathStr;

  if (pathStr.startsWith('~/') || pathStr === '~') {
    const expandedPath = pathStr.replace(/^~(?=$|\/|\\)/, homedir());
    logger.debug('Expanded tilde path', { original: pathStr, expanded: expandedPath });
    return expandedPath;
  }

  return pathStr;
}

/**
 * Normalizes function name to standard format (lowercase, dashes instead of spaces)
 * @param name - Function name to normalize
 * @returns Normalized function name
 */
export function normalizeFunctionName(name: string): string {
  if (!name) return name;

  const normalized = name.toLowerCase().replace(/\s+/g, '-');

  if (normalized !== name) {
    logger.debug('Normalized function name', { original: name, normalized });
  }

  return normalized;
}

/**
 * Validates that a directory exists and contains function markers
 * @param dirPath - Directory path to validate
 * @returns True if directory is a valid function directory
 */
export function validateFunctionDirectory(dirPath: string): boolean {
  try {
    // Check if directory exists
    if (!existsSync(dirPath)) {
      logger.debug('Directory does not exist', { dirPath });
      return false;
    }

    // Check if it's actually a directory
    const stats = statSync(dirPath);
    if (!stats.isDirectory()) {
      logger.debug('Path is not a directory', { dirPath });
      return false;
    }

    // Check for function markers
    const contents = readdirSync(dirPath);
    const hasPackageJson = contents.includes('package.json');
    const hasPyprojectToml = contents.includes('pyproject.toml');
    const hasSrcDir = contents.includes('src');

    const isValid = hasPackageJson || hasPyprojectToml || hasSrcDir;

    logger.debug('Function directory validation', {
      dirPath,
      isValid,
      markers: {
        hasPackageJson,
        hasPyprojectToml,
        hasSrcDir
      }
    });

    return isValid;
  } catch (error) {
    logger.debug('Error validating function directory', {
      dirPath,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

/**
 * Finds the git root directory by walking up from the given path
 * @param startPath - Starting directory path
 * @returns Git root path or undefined if not in a git repo
 */
function findGitRoot(startPath: string): string | undefined {
  let currentDir = resolve(startPath);
  const root = resolve('/');

  while (currentDir !== root) {
    if (existsSync(join(currentDir, '.git'))) {
      return currentDir;
    }
    const parentDir = resolve(currentDir, '..');
    if (parentDir === currentDir) break; // Hit filesystem root
    currentDir = parentDir;
  }

  return undefined;
}

/**
 * Case-insensitive search for a function directory within a functions/ folder
 * @param functionsDir - Path to the functions/ directory
 * @param functionName - Function name to search for (any case)
 * @returns Matched directory path or undefined
 */
function findFunctionCaseInsensitive(
  functionsDir: string,
  functionName: string
): string | undefined {
  if (!existsSync(functionsDir)) return undefined;

  try {
    const stats = statSync(functionsDir);
    if (!stats.isDirectory()) return undefined;

    const entries = readdirSync(functionsDir);
    const normalizedSearch = functionName.toLowerCase();

    // Find case-insensitive match
    const match = entries.find(entry => entry.toLowerCase() === normalizedSearch);

    if (match) {
      const matchPath = join(functionsDir, match);
      if (validateFunctionDirectory(matchPath)) {
        return matchPath;
      }
    }
  } catch (error) {
    logger.debug('Error searching functions directory', {
      functionsDir,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return undefined;
}

/**
 * Helper function to search for function in standard locations
 * Walks up directory tree from config to git root, with case-insensitive matching
 * @param configDirPath - Directory where config file is located
 * @param normalizedName - Normalized function name
 * @param originalName - Original function name (for case-insensitive matching)
 * @returns First valid function directory path or undefined
 */
export function findFunctionInStandardLocations(
  configDirPath: string,
  normalizedName: string,
  originalName?: string
): string | undefined {
  const gitRoot = findGitRoot(configDirPath);
  const searchedPaths: string[] = [];

  logger.debug('Searching for function in standard locations', {
    normalizedName,
    originalName,
    configDirPath,
    gitRoot
  });

  // Walk up from configDirPath to git root (or filesystem root if no git)
  let currentDir = resolve(configDirPath);
  const stopAt = gitRoot ? resolve(gitRoot, '..') : resolve('/');

  while (currentDir !== stopAt) {
    const functionsDir = join(currentDir, 'functions');
    searchedPaths.push(functionsDir);

    // Try case-insensitive match with normalized name
    let foundPath = findFunctionCaseInsensitive(functionsDir, normalizedName);
    if (foundPath) {
      logger.debug('Found function via case-insensitive search', { foundPath, searchDir: functionsDir });
      return foundPath;
    }

    // Also try original name if different
    if (originalName && originalName !== normalizedName) {
      foundPath = findFunctionCaseInsensitive(functionsDir, originalName);
      if (foundPath) {
        logger.debug('Found function via original name search', { foundPath, searchDir: functionsDir });
        return foundPath;
      }
    }

    // Move up one directory
    const parentDir = resolve(currentDir, '..');
    if (parentDir === currentDir) break; // Hit filesystem root
    currentDir = parentDir;
  }

  // Also check current working directory
  const cwdFunctionsDir = join(process.cwd(), 'functions');
  if (!searchedPaths.includes(cwdFunctionsDir)) {
    const foundPath = findFunctionCaseInsensitive(cwdFunctionsDir, normalizedName);
    if (foundPath) {
      logger.debug('Found function in cwd/functions', { foundPath });
      return foundPath;
    }
  }

  logger.debug('Function not found in any standard location', {
    normalizedName,
    originalName,
    searchedPaths
  });
  return undefined;
}

/**
 * Resolves the absolute path to a function directory
 * Handles multiple resolution strategies with proper priority
 *
 * @param functionName - Name of the function
 * @param configDirPath - Directory where config file is located
 * @param dirPath - Optional explicit dirPath from config
 * @param explicitPath - Optional path passed as parameter (highest priority)
 * @returns Absolute path to the function directory
 * @throws Error if function directory cannot be found or is invalid
 */
export function resolveFunctionDirectory(
  functionName: string,
  configDirPath: string,
  dirPath?: string,
  explicitPath?: string
): string {
  logger.debug('Resolving function directory', {
    functionName,
    configDirPath,
    dirPath,
    explicitPath
  });

  const normalizedName = normalizeFunctionName(functionName);

  // Priority 1: Explicit path parameter (highest priority)
  if (explicitPath) {
    logger.debug('Using explicit path parameter');
    const expandedPath = expandTildePath(explicitPath);
    const resolvedPath = isAbsolute(expandedPath)
      ? expandedPath
      : resolve(process.cwd(), expandedPath);

    if (!validateFunctionDirectory(resolvedPath)) {
      const errorMsg = `Explicit path is not a valid function directory: ${resolvedPath}`;
      logger.error(errorMsg);
      MessageFormatter.error('Invalid function directory', errorMsg, { prefix: 'Path Resolution' });
      throw new Error(errorMsg);
    }

    logger.debug('Resolved using explicit path', { resolvedPath });
    MessageFormatter.debug(`Resolved function directory using explicit path: ${resolvedPath}`, undefined, { prefix: 'Path Resolution' });
    return resolvedPath;
  }

  // Priority 2: dirPath from config (relative to config location)
  if (dirPath) {
    logger.debug('Using dirPath from config');
    const expandedPath = expandTildePath(dirPath);
    const resolvedPath = isAbsolute(expandedPath)
      ? expandedPath
      : resolve(configDirPath, expandedPath);

    if (!validateFunctionDirectory(resolvedPath)) {
      const errorMsg = `Config dirPath is not a valid function directory: ${resolvedPath}`;
      logger.error(errorMsg);
      MessageFormatter.error('Invalid function directory', errorMsg, { prefix: 'Path Resolution' });
      throw new Error(errorMsg);
    }

    logger.debug('Resolved using config dirPath', { resolvedPath });
    MessageFormatter.debug(`Resolved function directory using config dirPath: ${resolvedPath}`, undefined, { prefix: 'Path Resolution' });
    return resolvedPath;
  }

  // Priority 3: Search standard locations (walks up to git root with case-insensitive matching)
  logger.debug('Searching standard locations for function');
  const foundPath = findFunctionInStandardLocations(configDirPath, normalizedName, functionName);

  if (foundPath) {
    logger.debug('Resolved using standard location search', { foundPath });
    MessageFormatter.debug(`Found function directory in standard location: ${foundPath}`, undefined, { prefix: 'Path Resolution' });
    return foundPath;
  }

  // Priority 4: Not found - build list of searched locations for error message
  const searchedLocations: string[] = [];
  let searchDir = resolve(configDirPath);
  const gitRoot = (() => {
    let dir = searchDir;
    while (dir !== resolve('/')) {
      if (existsSync(join(dir, '.git'))) return dir;
      const parent = resolve(dir, '..');
      if (parent === dir) break;
      dir = parent;
    }
    return undefined;
  })();
  const stopAt = gitRoot ? resolve(gitRoot, '..') : resolve('/');

  while (searchDir !== stopAt) {
    searchedLocations.push(join(searchDir, 'functions', normalizedName));
    const parent = resolve(searchDir, '..');
    if (parent === searchDir) break;
    searchDir = parent;
  }
  searchedLocations.push(join(process.cwd(), 'functions', normalizedName));

  const errorMsg = `Function directory not found for '${functionName}' (normalized: '${normalizedName}'). ` +
    `Searched locations (up to git root):\n${searchedLocations.map(p => `  - ${p}`).join('\n')}`;

  logger.error('Function directory not found', {
    functionName,
    normalizedName,
    searchedLocations
  });

  MessageFormatter.error(
    'Function directory not found',
    errorMsg,
    { prefix: 'Path Resolution' }
  );

  throw new Error(errorMsg);
}
