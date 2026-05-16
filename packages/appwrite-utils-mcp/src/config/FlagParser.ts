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
  tables: boolean;
  functions: boolean;
  storage: boolean;
  users: boolean;
  transfer: boolean;
  schemas: boolean;
  config: boolean;
  sites: boolean;
  projects: boolean;
  teams: boolean;
  all: boolean;

  // Deprecated alias for --tables (Appwrite v18+ renamed databases → tables)
  databases?: boolean;

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
    .option('tables', {
      type: 'boolean',
      description: 'Enable TablesDB tools (rows, columns, indexes — Appwrite v18+)',
      default: false,
    })
    .alias('databases', 'tables')
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
    .option('sites', {
      type: 'boolean',
      description: 'Enable sites tools',
      default: false,
    })
    .option('projects', {
      type: 'boolean',
      description: 'Enable Project-level configuration tools (project variables)',
      default: false,
    })
    .option('teams', {
      type: 'boolean',
      description: 'Enable Teams tools (teams + memberships)',
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
    tables: Boolean(parsed.tables || parsed.databases),
    functions: parsed.functions,
    storage: parsed.storage,
    users: parsed.users,
    transfer: parsed.transfer,
    schemas: parsed.schemas,
    config: parsed.config,
    sites: parsed.sites,
    projects: parsed.projects,
    teams: parsed.teams,
    all: parsed.all,
    databases: parsed.databases,
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
    return ['config', 'functions', 'projects', 'schemas', 'sites', 'storage', 'tables', 'teams', 'transfer', 'users'];
  }

  const enabled: string[] = [];

  if (flags.tables) enabled.push('tables');
  if (flags.functions) enabled.push('functions');
  if (flags.storage) enabled.push('storage');
  if (flags.users) enabled.push('users');
  if (flags.transfer) enabled.push('transfer');
  if (flags.schemas) enabled.push('schemas');
  if (flags.config) enabled.push('config');
  if (flags.sites) enabled.push('sites');
  if (flags.projects) enabled.push('projects');
  if (flags.teams) enabled.push('teams');

  return enabled;
}
