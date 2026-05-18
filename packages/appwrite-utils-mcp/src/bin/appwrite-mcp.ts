#!/usr/bin/env node
/**
 * Entry point for appwrite-mcp CLI
 * @packageDocumentation
 */

// Stdout is the JSON-RPC channel in an MCP context; any stray console.log
// from dependency code (notably appwrite-utils-helpers' MessageFormatter,
// which prints ✅/⚠️/ℹ️ status lines) corrupts the protocol. Redirect every
// non-error console writer to stderr before any other module loads.
console.log = console.error.bind(console);
console.info = console.error.bind(console);
console.warn = console.error.bind(console);

import { AppwriteMCPServer } from '../server.js';
import { parseFlags } from '../config/FlagParser.js';
import { logToolError } from '../utils/errorLogger.js';

/**
 * Main entry point for the Appwrite MCP server
 *
 * Parses command-line arguments, creates the server instance,
 * and starts listening for MCP requests over stdio.
 */
async function main() {
  try {
    // Parse command-line arguments
    // process.argv format: [node, script, ...args]
    // We need to skip the first two elements
    const args = process.argv.slice(2);
    const flags = parseFlags(args);

    // Create and start the server
    const server = new AppwriteMCPServer(flags);
    await server.start();

    // Set up graceful shutdown handlers
    const shutdown = async (signal: string) => {
      console.error(`\n[appwrite-mcp] Received ${signal}, shutting down...`);
      try {
        await server.stop();
        process.exit(0);
      } catch (error) {
        console.error('[appwrite-mcp] Error during shutdown:', error);
        process.exit(1);
      }
    };

    // Handle graceful shutdown signals
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Handle uncaught errors — route through the unified error logger so the
    // event is captured to the log file too (if --logFile was set) and gets a
    // structured JSON line on stderr instead of a bare console.error dump.
    process.on('uncaughtException', (error) => {
      logToolError({ toolName: '<process:uncaughtException>', args: {}, error });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      logToolError({ toolName: '<process:unhandledRejection>', args: {}, error: reason });
      process.exit(1);
    });

  } catch (error) {
    console.error('[appwrite-mcp] Failed to start server:', error);

    // Provide helpful error messages for common issues
    if (error instanceof Error) {
      if (error.message.includes('EACCES')) {
        console.error('[appwrite-mcp] Permission denied. Try running with appropriate permissions.');
      } else if (error.message.includes('EADDRINUSE')) {
        console.error('[appwrite-mcp] Address already in use. Another instance may be running.');
      } else if (error.message.includes('Authentication')) {
        console.error('[appwrite-mcp] Authentication error. Please check your credentials or run "appwrite login".');
      }
    }

    process.exit(1);
  }
}

// Run the main function
main();
