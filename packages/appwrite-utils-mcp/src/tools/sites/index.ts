/**
 * Sites tools for MCP
 * @packageDocumentation
 */

import { z } from 'zod';
import { Sites } from 'node-appwrite';
import type { ToolContext, ToolDefinition, ToolGroupDefinition } from '../ToolGroup.js';
import { ConfigManager, MessageFormatter, SiteManager } from 'appwrite-utils-helpers';
import type { AppwriteSite } from 'appwrite-utils';
import { normalizeQueries } from '../../utils/queryNormalizer.js';
import { clampQueryLimit } from '../../utils/clampQueryLimit.js';

const QUERY_HELP_SUFFIX =
  ' Accepts SDK syntax like Query.limit(10) or limit(10), or JSON wire form. Call query_help for the full reference.';

// ──────────────────────────────────────────────────
// INPUT SCHEMAS
// ──────────────────────────────────────────────────

/**
 * Schema for list_sites - Optional queries/search
 */
const listSitesSchema = z.object({
  queries: z
    .array(z.string())
    .optional()
    .describe('Optional Appwrite Query strings.' + QUERY_HELP_SUFFIX),
  search: z.string().optional().describe('Optional search string'),
}).optional();

/**
 * Schema for get_site - Requires siteId
 */
const getSiteSchema = z.object({
  siteId: z.string().min(1, 'Site ID is required'),
});

/**
 * Schema for create_site - Creates a new site
 */
const createSiteSchema = z.object({
  siteId: z.string().min(1, 'Site ID is required'),
  name: z.string().min(1, 'Site name is required'),
  framework: z.enum([
    'analog', 'angular', 'nextjs', 'react', 'nuxt', 'vue', 'sveltekit',
    'astro', 'tanstack-start', 'remix', 'lynx', 'flutter', 'react-native',
    'vite', 'other',
  ]).describe('Framework to use for the site'),
  buildRuntime: z.string().min(1, 'Build runtime is required').describe('Build runtime (e.g., node-22, bun-1.2, static-1)'),
  adapter: z.enum(['static', 'ssr']).optional().describe('Adapter type: static or ssr'),
  enabled: z.boolean().optional().default(true).describe('Whether the site is enabled'),
  logging: z.boolean().optional().default(true).describe('Whether logging is enabled'),
  timeout: z.number().optional().describe('Timeout in seconds (1-900)'),
  installCommand: z.string().optional().describe('Install command (e.g., npm install)'),
  buildCommand: z.string().optional().describe('Build command (e.g., npm run build)'),
  outputDirectory: z.string().optional().describe('Output directory (e.g., dist, build, .output)'),
  fallbackFile: z.string().optional().describe('Fallback file for SPA routing (e.g., index.html)'),
  installationId: z.string().optional().describe('Installation ID for Git provider'),
  providerRepositoryId: z.string().optional().describe('Git provider repository ID'),
  providerBranch: z.string().optional().describe('Git provider branch'),
  providerSilentMode: z.boolean().optional().describe('Whether to enable silent mode for Git provider'),
  providerRootDirectory: z.string().optional().describe('Root directory in the Git repository'),
  buildSpecification: z.string().optional().describe('Build specification'),
  runtimeSpecification: z.string().optional().describe('Runtime specification'),
});

/**
 * Schema for deploy_site - Deploys a site from a local directory
 */
const deploySiteSchema = z.object({
  siteId: z.string().min(1, 'Site ID is required'),
  path: z.string().min(1, 'Path to site source code is required').describe('Path to the site source code directory'),
  activate: z.boolean().optional().default(true).describe('Whether to activate the deployment'),
  installCommand: z.string().optional().describe('Install command override'),
  buildCommand: z.string().optional().describe('Build command override'),
  outputDirectory: z.string().optional().describe('Output directory override'),
  activationTimeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Max ms to wait for the new deployment to reach status=ready before activating. Default 600000 (10 min).'),
  activationIntervalMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Poll interval (ms) while waiting for the build. Default 3000.'),
});

/**
 * Schema for delete_site - Requires siteId
 */
const deleteSiteSchema = z.object({
  siteId: z.string().min(1, 'Site ID is required'),
});

/**
 * Schema for deploy_site_via_cli - Delegates to the official `appwrite push site` CLI
 */
const deploySiteViaCliSchema = z.object({
  siteId: z.string().min(1, 'Site ID is required'),
  path: z.string().optional().describe('Site source code directory (default: <cwd>/appwrite/sites/<id>/)'),
  async: z.boolean().optional().default(false).describe("Don't wait for the deployment to finish"),
  stream: z.boolean().optional().default(false).describe('Stream CLI output to MCP host (usually false for MCP — output is captured and returned in `result`)'),
});

/**
 * Schema for list_site_variables - Requires siteId
 */
const listSiteVariablesSchema = z.object({
  siteId: z.string().min(1, 'Site ID is required'),
});

/**
 * Schema for create_site_variable - Creates a variable on a site
 */
const createSiteVariableSchema = z.object({
  siteId: z.string().min(1, 'Site ID is required'),
  key: z.string().min(1, 'Variable key is required'),
  value: z.string().min(1, 'Variable value is required'),
  secret: z.boolean().optional().default(false).describe('Whether the variable is secret'),
});

// ──────────────────────────────────────────────────
// TOOL HANDLERS
// ──────────────────────────────────────────────────

/**
 * List all sites in the Appwrite project
 */
async function handleListSites(
  input: unknown,
  context: ToolContext
) {
  const validated = listSitesSchema.parse(input) ?? {};

  // Resolve authentication credentials
  const authResult = await context.authResolver.resolve();

  // Get or create authenticated client
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const siteManager = new SiteManager(client);
  const guarded = clampQueryLimit(normalizeQueries(validated.queries), { maxLimit: 100 });
  const result = await siteManager.listSites(
    guarded.queries,
    validated.search
  );

  const out: any = {
    sites: result.sites.map((site: any) => ({
      id: site.$id,
      name: site.name,
      framework: site.framework,
      status: site.latestDeploymentStatus || 'unknown',
    })),
  };
  if (guarded.clamped) {
    out._pagination = { appliedLimit: guarded.effectiveLimit, clamped: true };
  }
  return out;
}

/**
 * Get detailed information about a specific site
 */
async function handleGetSite(
  input: unknown,
  context: ToolContext
): Promise<{
  id: string;
  name: string;
  framework: string;
  buildRuntime: string;
  adapter: string;
  status: string;
  enabled: boolean;
  logging: boolean;
  timeout: number;
  installCommand: string;
  buildCommand: string;
  outputDirectory: string;
  fallbackFile: string;
  installationId?: string;
  providerRepositoryId?: string;
  providerBranch?: string;
}> {
  const validated = getSiteSchema.parse(input);

  // Resolve authentication credentials
  const authResult = await context.authResolver.resolve();

  // Get or create authenticated client
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const siteManager = new SiteManager(client);
  const site: any = await siteManager.getSite(validated.siteId);

  return {
    id: site.$id,
    name: site.name,
    framework: site.framework,
    buildRuntime: site.buildRuntime,
    adapter: site.adapter || '',
    status: site.latestDeploymentStatus || 'unknown',
    enabled: site.enabled,
    logging: site.logging,
    timeout: site.timeout,
    installCommand: site.installCommand || '',
    buildCommand: site.buildCommand || '',
    outputDirectory: site.outputDirectory || '',
    fallbackFile: site.fallbackFile || '',
    installationId: site.installationId,
    providerRepositoryId: site.providerRepositoryId,
    providerBranch: site.providerBranch,
  };
}

/**
 * Create a new site
 */
async function handleCreateSite(
  input: unknown,
  context: ToolContext
): Promise<{
  success: boolean;
  id: string;
  name: string;
  framework: string;
  buildRuntime: string;
}> {
  const validated = createSiteSchema.parse(input);

  // Resolve authentication credentials
  const authResult = await context.authResolver.resolve();

  // Get or create authenticated client
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const siteManager = new SiteManager(client);

  const siteConfig = {
    $id: validated.siteId,
    name: validated.name,
    framework: validated.framework,
    buildRuntime: validated.buildRuntime,
    enabled: validated.enabled,
    logging: validated.logging,
    timeout: validated.timeout,
    installCommand: validated.installCommand,
    buildCommand: validated.buildCommand,
    outputDirectory: validated.outputDirectory,
    adapter: validated.adapter,
    fallbackFile: validated.fallbackFile,
    installationId: validated.installationId,
    providerRepositoryId: validated.providerRepositoryId,
    providerBranch: validated.providerBranch,
    providerSilentMode: validated.providerSilentMode,
    providerRootDirectory: validated.providerRootDirectory,
    buildSpecification: validated.buildSpecification,
    runtimeSpecification: validated.runtimeSpecification,
  };

  const site: any = await siteManager.createSite(siteConfig as any);

  return {
    success: true,
    id: site.$id,
    name: site.name,
    framework: site.framework,
    buildRuntime: site.buildRuntime,
  };
}

/**
 * Deploy a site from a local directory
 */
async function handleDeploySite(
  input: unknown,
  context: ToolContext
): Promise<{
  success: boolean;
  deploymentId: string;
  siteId: string;
  status: string;
}> {
  const validated = deploySiteSchema.parse(input);

  // Resolve authentication credentials
  const authResult = await context.authResolver.resolve();

  // Get or create authenticated client
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const siteManager = new SiteManager(client);

  // Get site details first so we have a remote fallback for the config
  const site: any = await siteManager.getSite(validated.siteId);

  // Prefer the local YAML entry for this site so spec/build-command/env-
  // affecting fields get pushed on deploy. Fall back to a remote-derived
  // config if no YAML entry matches this $id.
  let localConfig: AppwriteSite | undefined;
  try {
    const configManager = ConfigManager.getInstance();
    if (!configManager.hasConfig()) {
      await configManager.loadConfig({ validate: false, reportValidation: false });
    }
    const config = configManager.getConfig();
    localConfig = (config.sites ?? []).find((s) => s?.$id === validated.siteId);
  } catch (error) {
    MessageFormatter.warning(
      `Could not load local AppwriteConfig: ${error instanceof Error ? error.message : String(error)}. ` +
        `Falling back to remote-derived site config; spec/build-command changes from local YAML will NOT be applied.`,
      { prefix: 'Sites' }
    );
  }

  if (!localConfig) {
    MessageFormatter.warning(
      `No local YAML entry found for site $id '${validated.siteId}'. ` +
        `Falling back to remote-derived config; spec/build-command changes from local YAML will NOT be applied.`,
      { prefix: 'Sites' }
    );
  }

  const siteConfig: AppwriteSite = localConfig
    ? {
        ...localConfig,
        installCommand: validated.installCommand || localConfig.installCommand,
        buildCommand: validated.buildCommand || localConfig.buildCommand,
        outputDirectory: validated.outputDirectory || localConfig.outputDirectory,
      }
    : ({
        $id: site.$id,
        name: site.name,
        framework: site.framework,
        buildRuntime: site.buildRuntime,
        enabled: site.enabled,
        logging: site.logging,
        timeout: site.timeout,
        installCommand: validated.installCommand || site.installCommand,
        buildCommand: validated.buildCommand || site.buildCommand,
        outputDirectory: validated.outputDirectory || site.outputDirectory,
        adapter: site.adapter,
        fallbackFile: site.fallbackFile,
        installationId: site.installationId,
        providerRepositoryId: site.providerRepositoryId,
        providerBranch: site.providerBranch,
        providerSilentMode: site.providerSilentMode,
        providerRootDirectory: site.providerRootDirectory,
        buildSpecification: site.buildSpecification,
        runtimeSpecification: site.runtimeSpecification,
      } as unknown as AppwriteSite);

  const deployment: any = await siteManager.deploySite(
    siteConfig,
    validated.path,
    {
      activate: validated.activate,
      installCommand: validated.installCommand,
      buildCommand: validated.buildCommand,
      outputDirectory: validated.outputDirectory,
      verbose: false,
      pollOptions:
        validated.activationTimeoutMs !== undefined || validated.activationIntervalMs !== undefined
          ? { timeoutMs: validated.activationTimeoutMs, intervalMs: validated.activationIntervalMs }
          : undefined,
    }
  );

  return {
    success: true,
    deploymentId: deployment.$id,
    siteId: site.$id,
    status: deployment.status,
  };
}

/**
 * Delete a site by ID
 */
async function handleDeleteSite(
  input: unknown,
  context: ToolContext
): Promise<{ success: boolean; siteId: string }> {
  const validated = deleteSiteSchema.parse(input);

  // Resolve authentication credentials
  const authResult = await context.authResolver.resolve();

  // Get or create authenticated client
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const siteManager = new SiteManager(client);
  await siteManager.deleteSite(validated.siteId);

  return {
    success: true,
    siteId: validated.siteId,
  };
}

/**
 * List variables for a site
 */
async function handleListSiteVariables(
  input: unknown,
  context: ToolContext
): Promise<{ variables: Array<{ id: string; key: string; value: string; secret: boolean }> }> {
  const validated = listSiteVariablesSchema.parse(input);

  // Resolve authentication credentials
  const authResult = await context.authResolver.resolve();

  // Get or create authenticated client
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const siteManager = new SiteManager(client);
  const result = await siteManager.listVariables(validated.siteId);

  return {
    variables: result.variables.map((v: any) => ({
      id: v.$id,
      key: v.key,
      value: v.value,
      secret: v.secret || false,
    })),
  };
}

/**
 * Create a variable on a site
 */
async function handleCreateSiteVariable(
  input: unknown,
  context: ToolContext
): Promise<{ success: boolean; id: string; key: string }> {
  const validated = createSiteVariableSchema.parse(input);

  // Resolve authentication credentials
  const authResult = await context.authResolver.resolve();

  // Get or create authenticated client
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });

  const siteManager = new SiteManager(client);
  const variable: any = await siteManager.createVariable(
    validated.siteId,
    validated.key,
    validated.value,
    validated.secret,
  );

  return {
    success: true,
    id: variable.$id,
    key: variable.key,
  };
}

/**
 * Deploy a site via the official `appwrite push site` CLI command.
 *
 * Fetches the existing site from Appwrite to build a minimal site descriptor,
 * then delegates the actual push to the CLI runner.
 */
async function handleDeploySiteViaCli(
  input: unknown,
  context: ToolContext
): Promise<{ result: string; exitCode: number; tail: string }> {
  const validated = deploySiteViaCliSchema.parse(input);
  const authResult = await context.authResolver.resolve();

  // Fetch the existing site from Appwrite to construct the required
  // AppwriteSite shape for the CLI deploy helper.
  const { client } = await context.clientRegistry.getOrCreate({
    endpoint: authResult.credentials.endpoint,
    projectId: authResult.credentials.projectId,
    apiKey: authResult.credentials.apiKey,
    sessionCookie: authResult.credentials.sessionCookie,
    authMethod: authResult.credentials.authMethod,
  });
  const sites = new Sites(client);
  const site: any = await sites.get(validated.siteId);

  // Lazy-import the CLI deploy helper to avoid loading execa for
  // non-MCP-CLI users.
  const { deploySiteViaCli } = await import('appwrite-utils-helpers');
  const res = await deploySiteViaCli(
    {
      $id: site.$id,
      name: site.name,
      framework: site.framework,
      buildCommand: site.buildCommand ?? '',
      installCommand: site.installCommand ?? '',
      outputDirectory: site.outputDirectory ?? '',
      buildRuntime: site.buildRuntime,
      adapter: site.adapter,
      path: `./sites/${site.$id}`,
      timeout: site.timeout ?? 30,
    } as any,
    {
      codePath: validated.path,
      credentials: {
        endpoint: authResult.credentials.endpoint,
        projectId: authResult.credentials.projectId,
        apiKey: authResult.credentials.apiKey,
      },
      stream: validated.stream,
      async: validated.async,
    }
  );

  // Tail the last 30 lines of combined output for the MCP response.
  const tail = (res.stdout + '\n' + res.stderr).split('\n').slice(-30).join('\n');
  return {
    result: res.exitCode === 0 ? 'success' : 'failed',
    exitCode: res.exitCode,
    tail,
  };
}

// ──────────────────────────────────────────────────
// TOOL DEFINITIONS
// ──────────────────────────────────────────────────

const listSitesTool: ToolDefinition = {
  name: 'list_sites',
  description: 'List all sites in the Appwrite project',
  inputSchema: listSitesSchema || z.object({}),
  handler: handleListSites,
  requiresAuth: true,
};

const getSiteTool: ToolDefinition = {
  name: 'get_site',
  description: 'Get detailed information about a specific site by ID',
  inputSchema: getSiteSchema,
  handler: handleGetSite,
  requiresAuth: true,
};

const createSiteTool: ToolDefinition = {
  name: 'create_site',
  description: 'Create a new site with framework, build runtime, and optional configuration',
  inputSchema: createSiteSchema,
  handler: handleCreateSite,
  requiresAuth: true,
};

const deploySiteTool: ToolDefinition = {
  name: 'deploy_site',
  description: 'Deploy a site from a local directory path',
  inputSchema: deploySiteSchema,
  handler: handleDeploySite,
  requiresAuth: true,
};

const deleteSiteTool: ToolDefinition = {
  name: 'delete_site',
  description: 'Delete a site by ID',
  inputSchema: deleteSiteSchema,
  handler: handleDeleteSite,
  requiresAuth: true,
};

const listSiteVariablesTool: ToolDefinition = {
  name: 'list_site_variables',
  description: 'List all environment variables for a site',
  inputSchema: listSiteVariablesSchema,
  handler: handleListSiteVariables,
  requiresAuth: true,
};

const createSiteVariableTool: ToolDefinition = {
  name: 'create_site_variable',
  description: 'Create an environment variable on a site',
  inputSchema: createSiteVariableSchema,
  handler: handleCreateSiteVariable,
  requiresAuth: true,
};

const deploySiteViaCliTool: ToolDefinition = {
  name: 'deploy_site_via_cli',
  description:
    'Deploy a site by delegating to the official `appwrite push site` CLI command. Returns the CLI exit code and a tail of its combined stdout/stderr output.',
  inputSchema: deploySiteViaCliSchema,
  handler: handleDeploySiteViaCli,
  requiresAuth: true,
};

// ──────────────────────────────────────────────────
// TOOL GROUP EXPORT
// ──────────────────────────────────────────────────

/**
 * Sites tools group for MCP
 */
export const sitesToolGroup: ToolGroupDefinition = {
  name: 'Sites',
  flag: 'sites',
  description: 'Tools for managing Appwrite sites and deployments',
  tools: [
    listSitesTool,
    getSiteTool,
    createSiteTool,
    deploySiteTool,
    deleteSiteTool,
    listSiteVariablesTool,
    createSiteVariableTool,
    deploySiteViaCliTool,
  ],
};
