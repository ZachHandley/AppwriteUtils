import { Client, Sites, Framework, BuildRuntime, Adapter, type Models } from "node-appwrite";
import type { AppwriteSite } from "appwrite-utils";
import { join, relative } from "node:path";
import fs from "node:fs";
import pLimit from "p-limit";
import { tryAwaitWithRetry } from "../utils/helperFunctions.js";
import { MessageFormatter } from "../shared/messageFormatter.js";

// Concurrency limits
const siteLimit = pLimit(5);
const queryLimit = pLimit(25);

export interface SiteSearchOptions {
  searchPaths?: string[];
  caseSensitive?: boolean;
  allowFuzzyMatch?: boolean;
  verbose?: boolean;
}

export interface SiteDeploymentOptions {
  activate?: boolean;
  installCommand?: string;
  buildCommand?: string;
  outputDirectory?: string;
  ignored?: string[];
  verbose?: boolean;
  /**
   * When true (or `siteConfig.prebuilt === true`), run installCommand then
   * buildCommand LOCALLY in the site directory before tarring, ship the
   * build output (dist/, .output/, node_modules) inside the tarball, and
   * tell Appwrite to skip its build step (empty install+build commands).
   */
  prebuilt?: boolean;
  /**
   * @deprecated The site config is now always pushed when the site exists;
   * this flag is retained for back-compat and is a no-op.
   */
  forceRedeploy?: boolean;
  /**
   * Polling knobs for the post-upload wait-until-ready loop that runs when
   * `activate !== false`. Defaults: `intervalMs=3000`, `timeoutMs=600000`.
   */
  pollOptions?: { intervalMs?: number; timeoutMs?: number };
}

export class SiteManager {
  private client: Client;
  private sites: Sites;

  constructor(client: Client) {
    this.client = client;
    this.sites = new Sites(client);
  }

  /**
   * Improved site directory detection with multiple strategies
   */
  public async findSiteDirectory(
    siteName: string,
    options: SiteSearchOptions = {}
  ): Promise<string | null> {
    const {
      searchPaths = [process.cwd()],
      caseSensitive = false,
      allowFuzzyMatch = true,
      verbose = false,
    } = options;

    if (verbose) {
      MessageFormatter.info(`Searching for site: ${siteName}`, { prefix: "Sites" });
    }

    const normalizedName = caseSensitive ? siteName : siteName.toLowerCase();
    const nameVariations = this.generateNameVariations(normalizedName);

    // Strategy 1: Check standard locations first
    const standardPaths = this.getStandardSitePaths(searchPaths, siteName);
    for (const path of standardPaths) {
      if (await this.isValidSiteDirectory(path)) {
        if (verbose) {
          MessageFormatter.success(`Found site at standard location: ${path}`, { prefix: "Sites" });
        }
        return path;
      }
    }

    // Strategy 2: Recursive directory search with fuzzy matching
    if (allowFuzzyMatch) {
      for (const searchPath of searchPaths) {
        const foundPath = await this.recursiveDirectorySearch(
          searchPath,
          nameVariations,
          { caseSensitive, verbose }
        );
        if (foundPath) {
          if (verbose) {
            MessageFormatter.success(`Found site via fuzzy search: ${foundPath}`, { prefix: "Sites" });
          }
          return foundPath;
        }
      }
    }

    if (verbose) {
      MessageFormatter.warning(`Site directory not found: ${siteName}`, { prefix: "Sites" });
    }
    return null;
  }

  private generateNameVariations(name: string): Set<string> {
    const variations = new Set<string>([
      name,
      name.toLowerCase(),
      name.replace(/\s+/g, "-"),
      name.replace(/\s+/g, "_"),
      name.replace(/[^a-z0-9]/gi, ""),
      name.replace(/[-_\s]+/g, ""),
      name.replace(/[-_\s]+/g, "-").toLowerCase(),
      name.replace(/[-_\s]+/g, "_").toLowerCase(),
    ]);

    return variations;
  }

  private getStandardSitePaths(searchPaths: string[], siteName: string): string[] {
    const normalizedName = siteName.toLowerCase().replace(/\s+/g, "-");
    const paths: string[] = [];

    for (const basePath of searchPaths) {
      paths.push(
        join(basePath, "sites", siteName),
        join(basePath, "sites", normalizedName),
        join(basePath, "src", "sites", siteName),
        join(basePath, "src", "sites", normalizedName),
        join(basePath, siteName),
        join(basePath, normalizedName),
        join(basePath, "appwrite", "sites", siteName),
        join(basePath, "appwrite", "sites", normalizedName)
      );
    }

    return paths;
  }

  private async recursiveDirectorySearch(
    searchPath: string,
    nameVariations: Set<string>,
    options: { caseSensitive: boolean; verbose: boolean }
  ): Promise<string | null> {
    const { caseSensitive, verbose } = options;

    try {
      const stats = await fs.promises.stat(searchPath);
      if (!stats.isDirectory()) return null;

      const entries = await fs.promises.readdir(searchPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        if (this.shouldSkipDirectory(entry.name)) continue;

        const entryPath = join(searchPath, entry.name);

        const entryNameToCheck = caseSensitive ? entry.name : entry.name.toLowerCase();
        if (nameVariations.has(entryNameToCheck)) {
          if (await this.isValidSiteDirectory(entryPath)) {
            return entryPath;
          }
        }

        const result = await this.recursiveDirectorySearch(entryPath, nameVariations, options);
        if (result) return result;
      }
    } catch (error) {
      if (verbose) {
        MessageFormatter.debug(`Skipping inaccessible directory: ${searchPath}`, undefined, { prefix: "Sites" });
      }
    }

    return null;
  }

  private shouldSkipDirectory(dirName: string): boolean {
    const skipDirs = new Set([
      "node_modules",
      ".git",
      ".vscode",
      ".idea",
      "coverage",
      ".nyc_output",
      "tmp",
      "temp",
      ".cache",
      "__pycache__",
      ".pytest_cache",
      "venv",
      ".venv",
      "env",
      ".env",
    ]);

    return skipDirs.has(dirName) || dirName.startsWith(".");
  }

  private async isValidSiteDirectory(path: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(path);
      if (!stats.isDirectory()) return false;

      const files = await fs.promises.readdir(path);

      // Check for common site indicators
      const hasPackageJson = files.includes("package.json");
      const hasIndexHtml = files.includes("index.html");
      const hasDistDir = files.includes("dist");
      const hasBuildDir = files.includes("build");
      const hasPublicDir = files.includes("public");
      const hasSrcDir = files.includes("src");
      const hasNextConfig = files.some((file) => file.match(/^next\.config\.(js|ts|mjs|cjs)$/i));
      const hasNuxtConfig = files.some((file) => file.match(/^nuxt\.config\.(js|ts|mjs|cjs)$/i));
      const hasSvelteConfig = files.some((file) => file.match(/^svelte\.config\.(js|ts|mjs|cjs)$/i));
      const hasAstroConfig = files.some((file) => file.match(/^astro\.config\.(js|ts|mjs|cjs)$/i));
      const hasViteConfig = files.some((file) => file.match(/^vite\.config\.(js|ts|mjs|cjs)$/i));
      const hasAngularJson = files.includes("angular.json");

      return (
        hasPackageJson ||
        hasIndexHtml ||
        hasDistDir ||
        hasBuildDir ||
        hasPublicDir ||
        hasSrcDir ||
        hasNextConfig ||
        hasNuxtConfig ||
        hasSvelteConfig ||
        hasAstroConfig ||
        hasViteConfig ||
        hasAngularJson
      );
    } catch {
      return false;
    }
  }

  /**
   * Enhanced site deployment with better error handling and validation
   */
  public async deploySite(
    siteConfig: AppwriteSite,
    sitePath: string,
    options: SiteDeploymentOptions = {}
  ): Promise<Models.Deployment> {
    const prebuilt =
      options.prebuilt === true || siteConfig.prebuilt === true;
    const {
      activate = true,
      outputDirectory = siteConfig.outputDirectory,
      verbose = false,
      pollOptions,
    } = options;
    // installCommand/buildCommand/ignored have prebuilt-aware defaults:
    // empty install+build so Appwrite skips its build; slim ignore so built
    // artifacts ship.
    const installCommand =
      options.installCommand ?? (prebuilt ? "" : siteConfig.installCommand);
    const buildCommand =
      options.buildCommand ?? (prebuilt ? "" : siteConfig.buildCommand);
    const ignored =
      options.ignored ??
      (prebuilt
        ? [".git", ".vscode", ".DS_Store"]
        : ["node_modules", ".git", ".vscode", ".DS_Store", "__pycache__", ".venv"]);

    return await siteLimit(async () => {
      if (verbose) {
        MessageFormatter.processing(`Deploying site: ${siteConfig.name}`, { prefix: "Sites" });
        MessageFormatter.debug(`Path: ${sitePath}`, undefined, { prefix: "Sites" });
      }

      // Validate site directory
      if (!(await this.isValidSiteDirectory(sitePath))) {
        throw new Error(`Invalid site directory: ${sitePath}`);
      }

      // Ensure site exists
      let siteExists = false;
      try {
        await this.getSite(siteConfig.$id);
        siteExists = true;
      } catch (error) {
        if (verbose) {
          MessageFormatter.info(`Site ${siteConfig.$id} does not exist, creating...`, { prefix: "Sites" });
        }
      }

      // Create site if it doesn't exist, otherwise always push the local
      // config (specs, build/install commands, env-affecting fields) before
      // uploading new code — mirrors the CLI's deployLocalSite behavior.
      if (!siteExists) {
        await this.createSite(siteConfig, { verbose });
      } else {
        await this.updateSite(siteConfig, { verbose });
      }

      // Execute pre-deploy commands if specified
      if (siteConfig.predeployCommands?.length) {
        await this.executePredeployCommands(siteConfig.predeployCommands, sitePath, { verbose });
      }

      // Prebuilt: run installCommand then buildCommand LOCALLY in sitePath so
      // the build output lands inside the tarball.
      if (prebuilt) {
        const localSteps: Array<{ label: string; command?: string }> = [
          { label: "install", command: siteConfig.installCommand },
          { label: "build", command: siteConfig.buildCommand },
        ];
        for (const step of localSteps) {
          if (!step.command || step.command.trim().length === 0) continue;
          if (verbose) {
            MessageFormatter.processing(
              `[prebuilt] Running ${step.label} locally: ${step.command}`,
              { prefix: "Sites" }
            );
          }
          await this.executePredeployCommands([step.command], sitePath, { verbose });
        }
      }

      // Deploy the site
      const deployment = await this.createDeployment(siteConfig.$id, sitePath, {
        activate,
        installCommand,
        buildCommand,
        outputDirectory,
        ignored,
        verbose,
        pollOptions,
      });

      if (verbose) {
        MessageFormatter.success(`Site ${siteConfig.name} deployed successfully`, { prefix: "Sites" });
      }

      return deployment;
    });
  }

  public async createSite(
    siteConfig: AppwriteSite,
    options: { verbose?: boolean } = {}
  ): Promise<Models.Site> {
    const { verbose = false } = options;

    if (verbose) {
      MessageFormatter.processing(`Creating site: ${siteConfig.name}`, { prefix: "Sites" });
    }

    return await tryAwaitWithRetry(async () => {
      return await this.sites.create({
        siteId: siteConfig.$id,
        name: siteConfig.name,
        framework: siteConfig.framework as Framework,
        buildRuntime: siteConfig.buildRuntime as BuildRuntime,
        enabled: siteConfig.enabled !== false,
        logging: siteConfig.logging !== false,
        timeout: siteConfig.timeout,
        installCommand: siteConfig.installCommand,
        buildCommand: siteConfig.buildCommand,
        outputDirectory: siteConfig.outputDirectory,
        adapter: siteConfig.adapter as Adapter | undefined,
        fallbackFile: siteConfig.fallbackFile,
        installationId: siteConfig.installationId,
        providerRepositoryId: siteConfig.providerRepositoryId,
        providerBranch: siteConfig.providerBranch,
        providerSilentMode: siteConfig.providerSilentMode,
        providerRootDirectory: siteConfig.providerRootDirectory,
        buildSpecification: siteConfig.buildSpecification,
        runtimeSpecification: siteConfig.runtimeSpecification,
      });
    });
  }

  public async updateSite(
    siteConfig: AppwriteSite,
    options: { verbose?: boolean } = {}
  ): Promise<Models.Site> {
    const { verbose = false } = options;

    if (verbose) {
      MessageFormatter.processing(`Updating site: ${siteConfig.name}`, { prefix: "Sites" });
    }

    return await tryAwaitWithRetry(async () => {
      return await this.sites.update({
        siteId: siteConfig.$id,
        name: siteConfig.name,
        framework: siteConfig.framework as Framework,
        buildRuntime: siteConfig.buildRuntime as BuildRuntime,
        enabled: siteConfig.enabled !== false,
        logging: siteConfig.logging !== false,
        timeout: siteConfig.timeout,
        installCommand: siteConfig.installCommand,
        buildCommand: siteConfig.buildCommand,
        outputDirectory: siteConfig.outputDirectory,
        adapter: siteConfig.adapter as Adapter | undefined,
        fallbackFile: siteConfig.fallbackFile,
        installationId: siteConfig.installationId,
        providerRepositoryId: siteConfig.providerRepositoryId,
        providerBranch: siteConfig.providerBranch,
        providerSilentMode: siteConfig.providerSilentMode,
        providerRootDirectory: siteConfig.providerRootDirectory,
        buildSpecification: siteConfig.buildSpecification,
        runtimeSpecification: siteConfig.runtimeSpecification,
      });
    });
  }

  public async getSite(siteId: string): Promise<Models.Site> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () => await this.sites.get({ siteId }))
    );
  }

  public async waitForDeploymentReady(
    siteId: string,
    deploymentId: string,
    options: { intervalMs?: number; timeoutMs?: number } = {}
  ): Promise<Models.Deployment> {
    const intervalMs = options.intervalMs ?? 3000;
    const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
    const startedAt = Date.now();

    while (true) {
      const deployment = await tryAwaitWithRetry(async () =>
        await this.sites.getDeployment({ siteId, deploymentId })
      );
      const status = deployment.status;

      if (status === "ready") {
        return deployment;
      }

      if (status === "failed" || status === "canceled") {
        const log = (deployment.buildLogs ?? "").slice(-2000);
        throw new Error(
          `Site deployment ${deploymentId} ended with status "${status}".${
            log ? `\nBuild log (tail):\n${log}` : ""
          }`
        );
      }

      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(
          `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for site deployment ${deploymentId} to become ready (last status: "${status}").`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  public async activateDeployment(
    siteId: string,
    deploymentId: string
  ): Promise<Models.Site> {
    return await tryAwaitWithRetry(async () =>
      await this.sites.updateSiteDeployment({ siteId, deploymentId })
    );
  }

  public async listSites(
    queries?: string[],
    search?: string
  ): Promise<Models.SiteList> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.sites.list({
          ...(queries && queries.length > 0 ? { queries } : {}),
          ...(search ? { search } : {}),
        })
      )
    );
  }

  public async deleteSite(siteId: string): Promise<void> {
    await siteLimit(() =>
      tryAwaitWithRetry(async () => await this.sites.delete({ siteId }))
    );
  }

  public async createDeployment(
    siteId: string,
    codePath: string,
    options: SiteDeploymentOptions & { verbose?: boolean } = {}
  ): Promise<Models.Deployment> {
    const {
      activate = true,
      installCommand,
      buildCommand,
      outputDirectory,
      ignored = [],
      verbose = false,
      pollOptions,
    } = options;

    const { InputFile } = await import("node-appwrite/file");
    const { create: createTarball } = await import("tar");

    const tarPath = join(process.cwd(), `site-${siteId}-${Date.now()}.tar.gz`);

    try {
      if (verbose) {
        MessageFormatter.processing("Creating deployment archive...", { prefix: "Sites" });
      }

      // Create tarball
      await createTarball(
        {
          gzip: true,
          file: tarPath,
          cwd: codePath,
          filter: (path) => {
            const relativePath = relative(codePath, join(codePath, path)).toLowerCase();
            const shouldIgnore = ignored.some(
              (pattern) =>
                relativePath.startsWith(pattern.toLowerCase()) ||
                relativePath.includes(`/${pattern.toLowerCase()}`) ||
                relativePath.includes(`\\${pattern.toLowerCase()}`)
            );

            if (shouldIgnore && verbose) {
              MessageFormatter.debug(`Ignoring: ${path}`, undefined, { prefix: "Sites" });
            }

            return !shouldIgnore;
          },
        },
        ["."]
      );

      // Read and upload
      const fileBuffer = await fs.promises.readFile(tarPath);
      const fileObject = InputFile.fromBuffer(
        new Uint8Array(fileBuffer),
        `site-${siteId}.tar.gz`
      );

      if (verbose) {
        MessageFormatter.processing("Uploading deployment...", { prefix: "Sites" });
      }

      const deployment = await tryAwaitWithRetry(async () => {
        return await this.sites.createDeployment({
          siteId,
          code: fileObject as any,
          installCommand,
          buildCommand,
          outputDirectory,
          activate,
        });
      });

      if (!activate) {
        return deployment;
      }

      if (verbose) {
        MessageFormatter.processing(
          `Waiting for site deployment ${deployment.$id} to finish building...`,
          { prefix: "Sites" }
        );
      }
      const readyDeployment = await this.waitForDeploymentReady(
        siteId,
        deployment.$id,
        pollOptions
      );
      await this.activateDeployment(siteId, readyDeployment.$id);
      if (verbose) {
        MessageFormatter.success(
          `Activated site deployment ${readyDeployment.$id}`,
          { prefix: "Sites" }
        );
      }
      return readyDeployment;
    } finally {
      // Clean up tarball
      try {
        await fs.promises.unlink(tarPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Validate site configuration
   */
  public validateSiteConfig(config: AppwriteSite): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.$id) {
      errors.push("Site ID is required");
    }

    if (!config.name) {
      errors.push("Site name is required");
    }

    if (!config.framework) {
      errors.push("Site framework is required");
    }

    if (!config.buildRuntime) {
      errors.push("Site build runtime is required");
    }

    // Validate timeout
    if (config.timeout && (config.timeout < 1 || config.timeout > 900)) {
      errors.push("Site timeout must be between 1 and 900 seconds");
    }

    return { valid: errors.length === 0, errors };
  }

  public async executePredeployCommands(
    commands: string[],
    workingDir: string,
    options: { verbose?: boolean } = {}
  ): Promise<void> {
    const { verbose = false } = options;
    const { execSync } = await import("child_process");
    const { platform } = await import("node:os");

    if (verbose) {
      MessageFormatter.processing("Executing pre-deploy commands...", { prefix: "Sites" });
    }

    const isWindows = platform() === "win32";

    for (const command of commands) {
      if (verbose) {
        MessageFormatter.debug(`$ ${command}`, undefined, { prefix: "Sites" });
      }

      try {
        execSync(command, {
          cwd: workingDir,
          stdio: verbose ? "inherit" : "pipe",
          shell: isWindows ? "cmd.exe" : "/bin/sh",
          windowsHide: true,
        });
      } catch (error) {
        MessageFormatter.error(`Failed to execute command: ${command}`, error as Error, { prefix: "Sites" });
        throw error;
      }
    }

    if (verbose) {
      MessageFormatter.success("Pre-deploy commands completed", { prefix: "Sites" });
    }
  }

  // ──────────────────────────────────────────────────
  // VARIABLE MANAGEMENT
  // ──────────────────────────────────────────────────

  public async listVariables(siteId: string): Promise<Models.VariableList> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () => await this.sites.listVariables({ siteId }))
    );
  }

  public async createVariable(
    siteId: string,
    key: string,
    value: string,
    secret?: boolean
  ): Promise<Models.Variable> {
    return await siteLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.sites.createVariable({ siteId, key, value, secret })
      )
    );
  }

  public async getVariable(siteId: string, variableId: string): Promise<Models.Variable> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.sites.getVariable({ siteId, variableId })
      )
    );
  }

  public async updateVariable(
    siteId: string,
    variableId: string,
    key: string,
    value?: string,
    secret?: boolean
  ): Promise<Models.Variable> {
    return await siteLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.sites.updateVariable({ siteId, variableId, key, value, secret })
      )
    );
  }

  public async deleteVariable(siteId: string, variableId: string): Promise<void> {
    await siteLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.sites.deleteVariable({ siteId, variableId })
      )
    );
  }

  /**
   * Deploy a site via the official Appwrite CLI (`appwrite push site`).
   * Alternative to {@link SiteManager.deploySite} — uses the official tooling
   * instead of the SDK directly.
   */
  public async deploySiteViaCli(
    siteConfig: AppwriteSite,
    opts?: import("./cliSiteDeploy.js").DeploySiteViaCliOptions
  ): Promise<import("../cli/appwriteCliRunner.js").AppwriteCliResult> {
    const { deploySiteViaCli } = await import("./cliSiteDeploy.js");
    return deploySiteViaCli(siteConfig, opts);
  }
}
