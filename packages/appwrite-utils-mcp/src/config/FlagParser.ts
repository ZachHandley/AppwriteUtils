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

  /**
   * When true, the server runs in scoped/locked mode: no meta tools are
   * exposed and the agent cannot enable additional groups at runtime.
   * Used by per-group binaries (appwrite-mcp-storage, etc.).
   */
  lockedScope?: boolean;

  /**
   * Optional absolute path to append tool-error log lines to. When set, every
   * call to `logToolError` writes one JSON line to this file in addition to
   * the always-on stderr output. Default: undefined (stderr only).
   */
  logFile?: string;
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
    .option('logFile', {
      type: 'string',
      description:
        'Optional absolute path to append tool-error log lines to (JSON-per-line). ' +
        'Default: stderr only.',
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
    logFile: parsed.logFile,
  };
}

/**
 * Get list of enabled tool groups based on flags.
 *
 * When no group flags are passed, only `config` is enabled by default —
 * the agent uses meta tools (always exposed in non-locked mode) to enable
 * other groups on demand. Pass `--all` to pre-enable every group.
 *
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

  // Default surface when no group flags are passed: just `config` so the
  // agent can introspect auth/config status, plus the always-on meta group
  // (added by the server, not here).
  if (enabled.length === 0) {
    enabled.push('config');
  }

  return enabled;
}
