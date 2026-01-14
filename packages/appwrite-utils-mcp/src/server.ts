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
import { parseFlags, getEnabledToolGroups, type ServerFlags } from './config/FlagParser.js';
import { AuthResolver } from './auth/AuthResolver.js';
import { ClientRegistry } from './state/ClientRegistry.js';
import { StateManager } from './state/StateManager.js';
import { ToolRegistry } from './tools/ToolRegistry.js';
import type { ToolContext } from './tools/ToolGroup.js';
import { randomUUID } from 'crypto';

// Import tool groups
import { databasesToolGroup } from './tools/databases/index.js';
import { functionsToolGroup } from './tools/functions/index.js';
import { storageToolGroup } from './tools/storage/index.js';
import { usersToolGroup } from './tools/users/index.js';
import { transferToolGroup } from './tools/transfer/index.js';
import { schemasToolGroup } from './tools/schemas/index.js';
import { configToolGroup } from './tools/config/index.js';

/**
 * AppwriteMCPServer - Main MCP server for Appwrite utilities
 *
 * This server provides MCP tools for interacting with Appwrite instances:
 * - Database operations (list, create, sync, backup, restore)
 * - Function management (list, create, deploy, execute)
 * - Storage operations (buckets, upload, download)
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
    });

    this.clientRegistry = new ClientRegistry();
    this.stateManager = new StateManager();
    this.toolRegistry = new ToolRegistry(getEnabledToolGroups(flags));

    // Register all available tool groups
    this.toolRegistry.registerGroup(databasesToolGroup);
    this.toolRegistry.registerGroup(functionsToolGroup);
    this.toolRegistry.registerGroup(storageToolGroup);
    this.toolRegistry.registerGroup(usersToolGroup);
    this.toolRegistry.registerGroup(transferToolGroup);
    this.toolRegistry.registerGroup(schemasToolGroup);
    this.toolRegistry.registerGroup(configToolGroup);

    // Create MCP server instance
    this.server = new Server(
      {
        name: 'appwrite-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {}, // Enable tool capability
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
    const groupList = enabledGroups.length > 0
      ? enabledGroups.join(', ')
      : 'all';

    return `Appwrite MCP Server

This server provides tools for managing Appwrite instances.

Enabled tool groups: ${groupList}

Authentication priority:
1. Tool parameters (endpoint, projectId, apiKey/sessionCookie)
2. Server defaults (from CLI flags: ${this.flags.endpoint || 'none'})
3. CLI session discovery (from ~/.appwrite/prefs.json)

Available operations:
- Database: List, create, sync, backup, restore databases and collections
- Functions: List, create, deploy, delete, execute Appwrite functions
- Storage: Manage buckets, upload/download files
- Users: List, create, update, delete users and sessions
- Transfer: Backup, restore, migrate data between instances
- Schemas: Generate and validate TypeScript schemas
- Config: Read, write, validate appwrite.json configuration

Server instance ID: ${this.instanceId}
`;
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
          inputSchema: {
            type: 'object' as const,
            properties: {},
            // TODO: Convert Zod schema to JSON Schema for proper input validation
            // For now, we rely on runtime Zod validation in the tool handler
          },
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
              text: typeof result === 'string'
                ? result
                : JSON.stringify(result, null, 2),
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
    console.error(`[appwrite-mcp] Server started (instance: ${this.instanceId})`);
    console.error(`[appwrite-mcp] Enabled tool groups: ${getEnabledToolGroups(this.flags).join(', ') || 'all'}`);
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
