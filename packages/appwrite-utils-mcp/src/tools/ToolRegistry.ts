/**
 * Registry for managing all MCP tools
 * @packageDocumentation
 */

import {
  ToolGroup,
  type ToolGroupDefinition,
  type ToolDefinition,
  type ToolContext,
} from './ToolGroup.js';

/**
 * Error thrown when a tool is not found in the registry
 */
export class ToolNotFoundError extends Error {
  constructor(toolName: string) {
    super(`Tool '${toolName}' not found in registry`);
    this.name = 'ToolNotFoundError';
  }
}

/**
 * Error thrown when authentication is required but not provided
 */
export class AuthenticationRequiredError extends Error {
  constructor(toolName: string) {
    super(`Tool '${toolName}' requires authentication`);
    this.name = 'AuthenticationRequiredError';
  }
}

/**
 * Error thrown when input validation fails
 */
export class ValidationError extends Error {
  constructor(toolName: string, validationError: unknown) {
    super(`Input validation failed for tool '${toolName}': ${String(validationError)}`);
    this.name = 'ValidationError';
  }
}

/**
 * Registry that manages tool groups and routes tool calls
 */
export class ToolRegistry {
  private groups: Map<string, ToolGroup>;
  private enabledFlags: Set<string>;

  /**
   * Create a new tool registry with specified enabled groups
   * @param enabledGroups - Array of flag names to enable (e.g., ['--databases', '--functions'])
   */
  constructor(enabledGroups: string[] = []) {
    this.groups = new Map();
    this.enabledFlags = new Set(enabledGroups);
  }

  /**
   * Register a tool group with the registry
   * @param groupDef - Tool group definition to register
   */
  registerGroup(groupDef: ToolGroupDefinition): void {
    const group = new ToolGroup(groupDef);
    this.groups.set(group.flag, group);
  }

  /**
   * Get all tools from enabled groups
   * @returns Array of all enabled tool definitions
   */
  getEnabledTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    for (const [flag, group] of this.groups.entries()) {
      // Include tools if no flags specified (all enabled) or if flag is enabled
      if (this.enabledFlags.size === 0 || this.enabledFlags.has(flag)) {
        tools.push(...group.tools);
      }
    }

    return tools;
  }

  /**
   * Get all registered groups (regardless of enabled status)
   * @returns Array of all registered tool groups
   */
  getAllGroups(): ToolGroup[] {
    return Array.from(this.groups.values());
  }

  /**
   * Get only enabled groups
   * @returns Array of enabled tool groups
   */
  getEnabledGroups(): ToolGroup[] {
    return Array.from(this.groups.values()).filter((group) => {
      return this.enabledFlags.size === 0 || this.enabledFlags.has(group.flag);
    });
  }

  /**
   * Find a tool by name across all enabled groups
   * @param toolName - Name of the tool to find
   * @returns Tool definition if found, undefined otherwise
   */
  private findTool(toolName: string): ToolDefinition | undefined {
    const enabledTools = this.getEnabledTools();
    return enabledTools.find((tool) => tool.name === toolName);
  }

  /**
   * Handle a tool call by name
   * @param name - Name of the tool to invoke
   * @param input - Input parameters for the tool
   * @param context - Execution context containing state, clients, and auth
   * @returns Promise resolving to the tool's output
   * @throws {ToolNotFoundError} If tool is not found or not enabled
   * @throws {AuthenticationRequiredError} If tool requires auth but context lacks credentials
   * @throws {ValidationError} If input validation fails
   */
  async handleToolCall(
    name: string,
    input: unknown,
    context: ToolContext
  ): Promise<unknown> {
    // Find the tool
    const tool = this.findTool(name);
    if (!tool) {
      throw new ToolNotFoundError(name);
    }

    // Check authentication requirements
    if (tool.requiresAuth) {
      try {
        await context.authResolver.resolve();
      } catch (error) {
        throw new AuthenticationRequiredError(name);
      }
    }

    // Validate input against schema
    try {
      const validatedInput = tool.inputSchema.parse(input);

      // Execute the tool handler
      return await tool.handler(validatedInput, context);
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        throw new ValidationError(name, error);
      }
      // Re-throw other errors as-is
      throw error;
    }
  }

  /**
   * Check if a specific tool is available (enabled and registered)
   * @param toolName - Name of the tool to check
   * @returns True if the tool is available
   */
  hasToolEnabled(toolName: string): boolean {
    return this.findTool(toolName) !== undefined;
  }

  /**
   * Get list of all enabled tool names
   * @returns Array of enabled tool names
   */
  getEnabledToolNames(): string[] {
    return this.getEnabledTools().map((tool) => tool.name);
  }

  /**
   * Enable additional tool groups by flag
   * @param flags - Array of flag names to enable
   */
  enableGroups(flags: string[]): void {
    for (const flag of flags) {
      this.enabledFlags.add(flag);
    }
  }

  /**
   * Disable tool groups by flag
   * @param flags - Array of flag names to disable
   */
  disableGroups(flags: string[]): void {
    for (const flag of flags) {
      this.enabledFlags.delete(flag);
    }
  }

  /**
   * Clear all enabled flags (enables all groups)
   */
  enableAllGroups(): void {
    this.enabledFlags.clear();
  }
}
