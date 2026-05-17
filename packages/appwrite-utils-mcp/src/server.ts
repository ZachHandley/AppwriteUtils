/**
 * MCP Server implementation for Appwrite utilities
 * @packageDocumentation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type ListToolsRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { parseFlags, getEnabledToolGroups, type ServerFlags } from './config/FlagParser.js';
import { AuthResolver } from './auth/AuthResolver.js';
import { ClientRegistry } from './state/ClientRegistry.js';
import { StateManager } from './state/StateManager.js';
import { ToolRegistry } from './tools/ToolRegistry.js';
import type { ToolContext } from './tools/ToolGroup.js';
import { randomUUID } from 'crypto';

// Import tool groups
import { configToolGroup } from './tools/config/index.js';
import { functionsToolGroup } from './tools/functions/index.js';
import { metaToolGroup } from './tools/meta/index.js';
import { projectsToolGroup } from './tools/projects/index.js';
import { schemasToolGroup } from './tools/schemas/index.js';
import { sitesToolGroup } from './tools/sites/index.js';
import { storageToolGroup } from './tools/storage/index.js';
import { tablesToolGroup } from './tools/tables/index.js';
import { teamsToolGroup } from './tools/teams/index.js';
import { transferToolGroup } from './tools/transfer/index.js';
import { usersToolGroup } from './tools/users/index.js';

/**
 * AppwriteMCPServer - Main MCP server for Appwrite utilities
 *
 * This server provides MCP tools for interacting with Appwrite instances:
 * - Tables operations (rows, columns, indexes — TablesDB v18+)
 * - Function management (list, create, deploy, execute)
 * - Project-level operations (variables for all functions)
 * - Storage operations (buckets, upload, download)
 * - Team operations (memberships, prefs)
 * - User management (list, create, update, delete)
 * - Transfer operations (backup, restore, migrate)
 * - Schema generation and validation
 * - Config management
 *
 * Authentication uses a 3-tier priority system:
 * 1. Tool parameters (highest priority)
 * 2. Server defaults from CLI flags (medium priority)
 * 3. CLI session discovery (lowest priority)
 */
export class AppwriteMCPServer {
  private readonly server: Server;
  private readonly transport: StdioServerTransport;
  private readonly instanceId: string;

  // Core components
  private readonly authResolver: AuthResolver;
  private readonly clientRegistry: ClientRegistry;
  private readonly stateManager: StateManager;
  private readonly toolRegistry: ToolRegistry;

  private readonly flags: ServerFlags;

  /**
   * Create a new Appwrite MCP server instance
   *
   * @param flags - Server configuration flags from CLI parsing
   */
  constructor(flags: ServerFlags) {
    this.flags = flags;
    this.instanceId = flags.instanceId || randomUUID();

    // Initialize core components
    this.authResolver = new AuthResolver({
      endpoint: flags.endpoint,
      projectId: flags.projectId,
      apiKey: flags.apiKey,
      configDir: flags.configDir,
    });

    this.clientRegistry = new ClientRegistry();
    this.stateManager = new StateManager();

    // Meta tools are always-on except in locked-scope mode (per-group bins).
    const alwaysOnGroups = flags.lockedScope ? [] : ['meta'];
    this.toolRegistry = new ToolRegistry(getEnabledToolGroups(flags), alwaysOnGroups);

    // Register all available tool groups
    if (!flags.lockedScope) {
      this.toolRegistry.registerGroup(metaToolGroup);
    }
    this.toolRegistry.registerGroup(configToolGroup);
    this.toolRegistry.registerGroup(functionsToolGroup);
    this.toolRegistry.registerGroup(projectsToolGroup);
    this.toolRegistry.registerGroup(schemasToolGroup);
    this.toolRegistry.registerGroup(sitesToolGroup);
    this.toolRegistry.registerGroup(storageToolGroup);
    this.toolRegistry.registerGroup(tablesToolGroup);
    this.toolRegistry.registerGroup(teamsToolGroup);
    this.toolRegistry.registerGroup(transferToolGroup);
    this.toolRegistry.registerGroup(usersToolGroup);

    // Create MCP server instance
    this.server = new Server(
      {
        name: 'appwrite-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          // listChanged: true allows the server to send notifications/tools/list_changed
          // when meta tools enable/disable groups at runtime.
          tools: { listChanged: !flags.lockedScope },
        },
        instructions: this.generateServerInstructions(),
      }
    );

    // Create stdio transport
    this.transport = new StdioServerTransport();

    // Wire up request handlers
    this.setupRequestHandlers();
  }

  /**
   * Generate server instructions for MCP clients
   */
  private generateServerInstructions(): string {
    const enabledGroups = getEnabledToolGroups(this.flags);
    const groupList = enabledGroups.join(', ') || 'none';

    if (this.flags.lockedScope) {
      return `Appwrite MCP Server (scoped: ${groupList})

This server exposes only the '${groupList}' tool group. No meta/discovery
tools are available — start the unscoped 'appwrite-mcp' binary if you need
to switch groups at runtime.

Authentication priority:
1. Tool parameters (endpoint, projectId, apiKey/sessionCookie)
2. Server defaults (from CLI flags: ${this.flags.endpoint || 'none'})
3. CLI session discovery (from ~/.appwrite/prefs.json)

Server instance ID: ${this.instanceId}
`;
    }

    return `Appwrite MCP Server (progressive disclosure mode)

This server starts with a small tool surface to keep context cheap. Only
the 'meta' group (always-on) and currently-enabled groups are visible:

  Enabled at startup: ${groupList}

To discover and load more tools at runtime, use the meta tools:
  1. list_tool_groups            -> see every group with its tool count
  2. describe_tool_group(group)  -> preview a group's tools without enabling
  3. enable_tool_groups(groups)  -> activate one or more groups; the client
                                    will receive notifications/tools/list_changed
                                    and refresh its visible tool list
  4. disable_tool_groups(groups) -> shrink the surface when done
  5. enable_all_tool_groups      -> open the floodgates (~97 tools)

Pass --all on the CLI to skip the meta dance and pre-enable every group.

Available groups: config, functions, projects, schemas, sites, storage,
tables (Appwrite v18+ TablesDB), teams, transfer, users.

Authentication priority:
1. Tool parameters (endpoint, projectId, apiKey/sessionCookie)
2. Server defaults (from CLI flags: ${this.flags.endpoint || 'none'})
3. CLI session discovery (from ~/.appwrite/prefs.json)

Server instance ID: ${this.instanceId}
`;
  }

  /**
   * Convert a tool's Zod input schema into a JSON Schema object the MCP
   * client can use for parameter validation / autocomplete.
   *
   * Failures are caught per-tool so a single bad schema can't break the
   * entire tools/list response — the fallback exposes the tool with no
   * declared parameters and lets server-side Zod validation catch issues.
   */
  private toInputSchema(toolName: string, schema: z.ZodSchema): Record<string, unknown> {
    try {
      const json = z.toJSONSchema(schema) as Record<string, unknown>;
      // Strip top-level $schema so MCP clients don't see a stray draft URI.
      delete json.$schema;
      // MCP requires the root inputSchema to be an object schema.
      if (json.type !== 'object') {
        return { type: 'object', properties: {} };
      }
      return json;
    } catch (err) {
      console.error(
        `[appwrite-mcp] Failed to convert Zod schema for tool '${toolName}' to JSON Schema:`,
        err
      );
      return { type: 'object', properties: {} };
    }
  }

  /**
   * Serialize a tool handler's return value to the string body of an MCP
   * `content: [{ type: 'text', text: ... }]` entry.
   *
   * Handles two edge cases that bare `JSON.stringify` gets wrong:
   *  - `bigint` values (e.g. Appwrite TablesDB row `sequence` from node-appwrite)
   *    cause `JSON.stringify` to throw `TypeError: Do not know how to serialize
   *    a BigInt` — converted to string here to preserve precision.
   *  - `undefined`/`null` results would serialize to the JS value `undefined`,
   *    which violates MCP's requirement that `text` be a string.
   */
  private serializeToolResult(result: unknown): string {
    if (typeof result === 'string') return this.guardLargeText(result);
    if (result === undefined || result === null) return '';
    try {
      const serialized = JSON.stringify(
        result,
        (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
        2
      );
      const out = typeof serialized === 'string' ? serialized : String(result);
      return this.guardLargeText(out);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `[serialization failed: ${msg}]`;
    }
  }

  /**
   * Hard ceiling on the serialized result. Many Claude Code / MCP host
   * implementations cap a single tool result around 100K chars; oversized
   * results either get rejected outright or are spilled to disk for the
   * agent to re-fetch. Truncate at 85K (leaving headroom for the footer)
   * and tell the agent exactly which queries to use to constrain the call.
   */
  private guardLargeText(text: string): string {
    const HARD_LIMIT = 90_000;
    const TRUNCATE_TO = 85_000;
    if (text.length <= HARD_LIMIT) return text;
    return (
      text.slice(0, TRUNCATE_TO) +
      `\n\n[TRUNCATED — result was ${text.length.toLocaleString()} chars (cap ${HARD_LIMIT.toLocaleString()}). ` +
      "Re-run with Query.limit(N), Query.select([...]) to project fewer fields, " +
      "or summary:true on tools that support it. Call query_help for query syntax.]"
    );
  }

  /**
   * Set up MCP request handlers for tools
   */
  private setupRequestHandlers(): void {
    // Handle tools/list request - returns all enabled tools
    this.server.setRequestHandler(ListToolsRequestSchema, async (request: ListToolsRequest) => {
      const enabledTools = this.toolRegistry.getEnabledTools();

      return {
        tools: enabledTools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: this.toInputSchema(tool.name, tool.inputSchema),
        })),
      };
    });

    // Handle tools/call request - routes to ToolRegistry
    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      const { name, arguments: args } = request.params;

      // Create tool context
      const context: ToolContext = {
        authResolver: this.authResolver,
        clientRegistry: this.clientRegistry,
        stateManager: this.stateManager,
        projectId: this.flags.projectId,
        configDir: this.flags.configDir,
        toolRegistry: this.toolRegistry,
        notifyToolsChanged: this.flags.lockedScope
          ? undefined
          : () => this.server.sendToolListChanged(),
      };

      try {
        // Execute tool through registry
        const result = await this.toolRegistry.handleToolCall(name, args || {}, context);

        // Record successful operation
        this.stateManager.recordOperation(name, args, true);

        // Return result
        return {
          content: [
            {
              type: 'text' as const,
              text: this.serializeToolResult(result),
            },
          ],
        };
      } catch (error) {
        // Record failed operation
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.stateManager.recordOperation(name, args, false, errorMessage);

        // Return error
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error executing tool '${name}': ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Start the MCP server
   *
   * Connects the server to stdio transport and begins processing requests.
   * This is a long-running operation that will continue until the process exits.
   */
  async start(): Promise<void> {
    // Connect server to transport
    await this.server.connect(this.transport);

    // Log server startup
    const mode = this.flags.lockedScope ? 'locked-scope' : 'progressive';
    const visibleTools = this.toolRegistry.getEnabledTools().length;
    console.error(`[appwrite-mcp] Server started (instance: ${this.instanceId}, mode: ${mode})`);
    console.error(`[appwrite-mcp] Enabled tool groups: ${getEnabledToolGroups(this.flags).join(', ') || 'none'}`);
    if (!this.flags.lockedScope) {
      console.error(`[appwrite-mcp] Meta tools active — agent can enable more groups via enable_tool_groups()`);
    }
    console.error(`[appwrite-mcp] Visible tool count: ${visibleTools}`);
    console.error(`[appwrite-mcp] Default endpoint: ${this.flags.endpoint || 'none (will use tool params or CLI session)'}`);
    console.error(`[appwrite-mcp] Default project: ${this.flags.projectId || 'none (will use tool params or CLI session)'}`);
    console.error('[appwrite-mcp] Ready to accept MCP requests via stdio');
  }

  /**
   * Stop the MCP server gracefully
   */
  async stop(): Promise<void> {
    console.error('[appwrite-mcp] Shutting down server...');

    // Close transport
    await this.transport.close();

    // Clean up client cache
    this.clientRegistry.invalidate();

    console.error('[appwrite-mcp] Server stopped');
  }

  /**
   * Get the server's unique instance ID
   */
  getInstanceId(): string {
    return this.instanceId;
  }

  /**
   * Get operation statistics from state manager
   */
  getStats() {
    return {
      instance: this.instanceId,
      operations: this.stateManager.getOperationStats(),
      cache: this.clientRegistry.getCacheStats(),
      state: this.stateManager.getCacheStats(),
    };
  }
}
