/**
 * Tool group for organizing related MCP tools
 * @packageDocumentation
 */

import type { z } from 'zod';
import type { StateManager } from '../state/StateManager.js';
import type { ClientRegistry } from '../state/ClientRegistry.js';
import type { AuthResolver } from '../auth/AuthResolver.js';
import type { ToolRegistry } from './ToolRegistry.js';

/**
 * Context provided to tool handlers during execution
 */
export interface ToolContext {
  /** State manager for persistent state */
  stateManager: StateManager;
  /** Registry of Appwrite client instances */
  clientRegistry: ClientRegistry;
  /** Authentication resolver for credentials */
  authResolver: AuthResolver;
  /** Optional project ID for the current operation */
  projectId?: string;
  /** Tool registry — present for meta tools that mutate the enabled-group set */
  toolRegistry?: ToolRegistry;
  /** Send notifications/tools/list_changed to the MCP client */
  notifyToolsChanged?: () => Promise<void>;
}

/**
 * Definition of a single tool that can be invoked
 */
export interface ToolDefinition {
  /** Unique name of the tool */
  name: string;
  /** Human-readable description of what the tool does */
  description: string;
  /** Zod schema for validating input parameters */
  inputSchema: z.ZodSchema;
  /** Handler function that executes the tool's logic */
  handler: (input: unknown, context: ToolContext) => Promise<unknown>;
  /** Whether this tool requires authentication */
  requiresAuth: boolean;
}

/**
 * Definition of a group of related tools
 */
export interface ToolGroupDefinition {
  /** Name of the tool group */
  name: string;
  /** CLI flag to enable this group (e.g., '--databases') */
  flag: string;
  /** Description of the tool group's purpose */
  description: string;
  /** Array of tools in this group */
  tools: ToolDefinition[];
}

/**
 * Container for a group of related tools
 */
export class ToolGroup implements ToolGroupDefinition {
  public readonly name: string;
  public readonly flag: string;
  public readonly description: string;
  public readonly tools: ToolDefinition[];

  constructor(definition: ToolGroupDefinition) {
    this.name = definition.name;
    this.flag = definition.flag;
    this.description = definition.description;
    this.tools = definition.tools;
  }

  /**
   * Find a tool by name within this group
   */
  getTool(toolName: string): ToolDefinition | undefined {
    return this.tools.find((tool) => tool.name === toolName);
  }

  /**
   * Get all tool names in this group
   */
  getToolNames(): string[] {
    return this.tools.map((tool) => tool.name);
  }

  /**
   * Check if a tool exists in this group
   */
  hasTool(toolName: string): boolean {
    return this.tools.some((tool) => tool.name === toolName);
  }
}
