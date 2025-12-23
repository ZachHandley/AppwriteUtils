/**
 * Command-line flag parser for MCP server
 * @packageDocumentation
 */

import yargs from 'yargs';

/**
 * Server flags interface defining all supported CLI flags
 */
export interface ServerFlags {
  // Tool group flags
  databases: boolean;
  functions: boolean;
  storage: boolean;
  users: boolean;
  transfer: boolean;
  schemas: boolean;
  config: boolean;
  all: boolean;

  // Configuration flags
  endpoint?: string;
  projectId?: string;
  apiKey?: string;
  configDir?: string;
  instanceId?: string;
}

/**
 * Parse command-line arguments into ServerFlags
 * @param argv - Command-line arguments (pre-cleaned, without node executable and script path)
 * @returns Parsed server flags
 */
export function parseFlags(argv: string[]): ServerFlags {
  const parsed = yargs(argv)
    .option('databases', {
      type: 'boolean',
      description: 'Enable database tools',
      default: false,
    })
    .option('functions', {
      type: 'boolean',
      description: 'Enable function tools',
      default: false,
    })
    .option('storage', {
      type: 'boolean',
      description: 'Enable storage tools',
      default: false,
    })
    .option('users', {
      type: 'boolean',
      description: 'Enable user tools',
      default: false,
    })
    .option('transfer', {
      type: 'boolean',
      description: 'Enable transfer tools',
      default: false,
    })
    .option('schemas', {
      type: 'boolean',
      description: 'Enable schema tools',
      default: false,
    })
    .option('config', {
      type: 'boolean',
      description: 'Enable config tools',
      default: false,
    })
    .option('all', {
      type: 'boolean',
      description: 'Enable all tools',
      default: false,
    })
    .option('endpoint', {
      type: 'string',
      description: 'Default Appwrite endpoint',
    })
    .option('projectId', {
      type: 'string',
      description: 'Default project ID',
    })
    .option('apiKey', {
      type: 'string',
      description: 'Default API key',
    })
    .option('configDir', {
      type: 'string',
      description: 'Path to .appwrite config directory',
    })
    .option('instanceId', {
      type: 'string',
      description: 'Instance identifier for multi-instance',
    })
    .help()
    .alias('help', 'h')
    .version()
    .alias('version', 'v')
    .parseSync();

  return {
    databases: parsed.databases,
    functions: parsed.functions,
    storage: parsed.storage,
    users: parsed.users,
    transfer: parsed.transfer,
    schemas: parsed.schemas,
    config: parsed.config,
    all: parsed.all,
    endpoint: parsed.endpoint,
    projectId: parsed.projectId,
    apiKey: parsed.apiKey,
    configDir: parsed.configDir,
    instanceId: parsed.instanceId,
  };
}

/**
 * Get list of enabled tool groups based on flags
 * @param flags - Parsed server flags
 * @returns Array of enabled tool group names
 */
export function getEnabledToolGroups(flags: ServerFlags): string[] {
  // If --all is specified, enable all tool groups
  if (flags.all) {
    return ['databases', 'functions', 'storage', 'users', 'transfer', 'schemas', 'config'];
  }

  const enabled: string[] = [];

  if (flags.databases) enabled.push('databases');
  if (flags.functions) enabled.push('functions');
  if (flags.storage) enabled.push('storage');
  if (flags.users) enabled.push('users');
  if (flags.transfer) enabled.push('transfer');
  if (flags.schemas) enabled.push('schemas');
  if (flags.config) enabled.push('config');

  return enabled;
}
