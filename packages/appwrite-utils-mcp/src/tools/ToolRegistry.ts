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
  private alwaysOn: Set<string>;

  /**
   * Create a new tool registry with specified enabled groups
   * @param enabledGroups - Array of flag names to enable (e.g., ['tables', 'functions']).
   *                       Empty array means no optional groups are enabled — only `alwaysOn` groups will be exposed.
   * @param alwaysOnGroups - Array of flag names that are always exposed and cannot be disabled.
   *                        Defaults to empty (no always-on groups).
   */
  constructor(enabledGroups: string[] = [], alwaysOnGroups: string[] = []) {
    this.groups = new Map();
    this.enabledFlags = new Set(enabledGroups);
    this.alwaysOn = new Set(alwaysOnGroups);
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
   * Check whether a group flag is currently exposed (either always-on or enabled).
   */
  isGroupActive(flag: string): boolean {
    return this.alwaysOn.has(flag) || this.enabledFlags.has(flag);
  }

  /**
   * Get the set of always-on group flags.
   */
  getAlwaysOnFlags(): string[] {
    return Array.from(this.alwaysOn);
  }

  /**
   * Get the set of currently-enabled optional group flags (excludes always-on groups).
   */
  getEnabledFlags(): string[] {
    return Array.from(this.enabledFlags);
  }

  /**
   * Get all tools from enabled groups (including always-on groups)
   * @returns Array of all enabled tool definitions
   */
  getEnabledTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    for (const [flag, group] of this.groups.entries()) {
      if (this.isGroupActive(flag)) {
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
   * Get only enabled groups (including always-on groups)
   * @returns Array of enabled tool groups
   */
  getEnabledGroups(): ToolGroup[] {
    return Array.from(this.groups.values()).filter((group) => this.isGroupActive(group.flag));
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
   * @returns Array of flag names that were newly enabled (already-enabled and unknown flags are skipped)
   */
  enableGroups(flags: string[]): string[] {
    const newlyEnabled: string[] = [];
    for (const flag of flags) {
      if (!this.groups.has(flag)) continue;
      if (this.isGroupActive(flag)) continue;
      this.enabledFlags.add(flag);
      newlyEnabled.push(flag);
    }
    return newlyEnabled;
  }

  /**
   * Disable tool groups by flag. Always-on groups cannot be disabled.
   * @param flags - Array of flag names to disable
   * @returns Object with `disabled` (flags actually removed) and `refused` (flags that were always-on)
   */
  disableGroups(flags: string[]): { disabled: string[]; refused: string[] } {
    const disabled: string[] = [];
    const refused: string[] = [];
    for (const flag of flags) {
      if (this.alwaysOn.has(flag)) {
        refused.push(flag);
        continue;
      }
      if (this.enabledFlags.delete(flag)) {
        disabled.push(flag);
      }
    }
    return { disabled, refused };
  }

  /**
   * Enable every registered group.
   * @returns Array of flag names that were newly enabled.
   */
  enableAllGroups(): string[] {
    const newlyEnabled: string[] = [];
    for (const flag of this.groups.keys()) {
      if (this.isGroupActive(flag)) continue;
      this.enabledFlags.add(flag);
      newlyEnabled.push(flag);
    }
    return newlyEnabled;
  }
}
