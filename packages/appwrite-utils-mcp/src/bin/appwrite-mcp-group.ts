#!/usr/bin/env node
/**
 * Shared entrypoint for per-group Appwrite MCP binaries.
 *
 * Each bin alias (appwrite-mcp-tables, appwrite-mcp-storage, …) is a symlink
 * to this script. The script reads `process.argv[1]` to determine which group
 * was invoked, force-enables only that group, and starts the server in
 * locked-scope mode (no meta tools, no runtime group switching).
 *
 * @packageDocumentation
 */

// Stdout is the JSON-RPC channel — see appwrite-mcp.ts for context.
console.log = console.error.bind(console);
console.info = console.error.bind(console);
console.warn = console.error.bind(console);

import { basename } from 'node:path';
import { AppwriteMCPServer } from '../server.js';
import { parseFlags, type ServerFlags } from '../config/FlagParser.js';
import { getResolvedLogPath, logToolError } from '../utils/errorLogger.js';

const BIN_PREFIX = 'appwrite-mcp-';

const SUPPORTED_GROUPS = new Set([
  'tables',
  'functions',
  'storage',
  'users',
  'teams',
  'sites',
  'projects',
  'schemas',
  'transfer',
  'config',
]);

/**
 * Derive the target group from the binary name. Supports:
 *   - appwrite-mcp-storage          -> 'storage'
 *   - appwrite-mcp-storage.js       -> 'storage'
 *   - appwrite-mcp-group --group=X  -> X (fallback when invoked directly)
 */
function resolveGroup(argv: string[]): string {
  const binName = basename(argv[1] ?? '').replace(/\.(c?js|mjs|ts)$/, '');

  if (binName.startsWith(BIN_PREFIX)) {
    const group = binName.slice(BIN_PREFIX.length);
    if (SUPPORTED_GROUPS.has(group)) return group;
  }

  // Fallback for direct invocation: `node appwrite-mcp-group.js --group=storage`
  const groupFlagIdx = argv.findIndex((a) => a === '--group' || a.startsWith('--group='));
  if (groupFlagIdx !== -1) {
    const arg = argv[groupFlagIdx];
    const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[groupFlagIdx + 1];
    if (value && SUPPORTED_GROUPS.has(value)) return value;
  }

  throw new Error(
    `Could not determine target group from bin name '${binName}'. ` +
      `Invoke via one of: ${Array.from(SUPPORTED_GROUPS).map((g) => BIN_PREFIX + g).join(', ')}, ` +
      `or pass --group=<name>.`
  );
}

async function main() {
  try {
    const group = resolveGroup(process.argv);

    // Strip --group flags from the args the parser sees so they don't show as
    // unknown options; everything else (--endpoint, --projectId, …) passes through.
    const passthrough = process.argv.slice(2).filter((arg, idx, arr) => {
      if (arg === '--group') return false;
      if (arg.startsWith('--group=')) return false;
      // drop the value that followed `--group` (if separate)
      const prev = arr[idx - 1];
      if (prev === '--group') return false;
      return true;
    });

    const baseFlags = parseFlags(passthrough);

    // Force-scope: only the selected group is on; lockedScope disables meta.
    const flags: ServerFlags = {
      ...baseFlags,
      tables: group === 'tables',
      functions: group === 'functions',
      storage: group === 'storage',
      users: group === 'users',
      teams: group === 'teams',
      sites: group === 'sites',
      projects: group === 'projects',
      schemas: group === 'schemas',
      transfer: group === 'transfer',
      config: group === 'config',
      all: false,
      databases: undefined,
      lockedScope: true,
    };

    const server = new AppwriteMCPServer(flags);
    await server.start();

    const logPath = getResolvedLogPath();
    console.error(
      `[appwrite-mcp-${group}][info] error log: ${logPath ?? 'disabled (stderr only)'}`
    );

    const shutdown = async (signal: string) => {
      console.error(`\n[appwrite-mcp-${group}] Received ${signal}, shutting down...`);
      try {
        await server.stop();
        process.exit(0);
      } catch (error) {
        console.error(`[appwrite-mcp-${group}] Error during shutdown:`, error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    process.on('uncaughtException', (error) => {
      logToolError({
        toolName: `<process:uncaughtException:${group}>`,
        args: {},
        error,
      });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      logToolError({
        toolName: `<process:unhandledRejection:${group}>`,
        args: {},
        error: reason,
      });
      process.exit(1);
    });
  } catch (error) {
    console.error('[appwrite-mcp-group] Failed to start server:', error);
    process.exit(1);
  }
}

main();
