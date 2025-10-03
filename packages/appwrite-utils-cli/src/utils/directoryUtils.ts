/**
 * Directory utility functions for filtering and managing directory traversal
 */

/**
 * List of directories that should be ignored during recursive searches
 * Includes common build outputs, dependencies, caches, and system folders
 */
export const IGNORED_DIRECTORIES = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  '.git',
  '.svn',
  '.hg',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  'venv',
  '.venv',
  'env',
  '.env',
  'target',
  'out',
  'bin',
  'obj',
  '.vs',
  '.vscode',
  '.idea',
  'temp',
  'tmp',
  '.tmp',
  'logs',
  'log',
  '.DS_Store',
  'Thumbs.db'
];

/**
 * Determines if a directory should be ignored during recursive file operations
 *
 * @param dirName - The name of the directory to check
 * @returns true if the directory should be ignored, false otherwise
 *
 * @remarks
 * A directory is ignored if:
 * - It matches one of the entries in IGNORED_DIRECTORIES
 * - It starts with '.git' prefix
 * - It starts with 'node_modules' prefix
 * - It starts with '.' (hidden directory) except for '.appwrite'
 */
export const shouldIgnoreDirectory = (dirName: string): boolean => {
  return IGNORED_DIRECTORIES.includes(dirName) ||
         dirName.startsWith('.git') ||
         dirName.startsWith('node_modules') ||
         (dirName.startsWith('.') && dirName !== '.appwrite');
};
