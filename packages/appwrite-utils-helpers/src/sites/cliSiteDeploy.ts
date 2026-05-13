/**
 * @fileoverview CLI-backed site deployment path.
 *
 * Delegates `deploySiteViaCli` to the official Appwrite CLI's `appwrite push site`
 * command. This is an opt-in alternative to {@link import("./siteManager.js").SiteManager.deploySite},
 * which keeps using the Appwrite Node SDK directly.
 *
 * Workflow:
 *   1. Resolve a working directory (caller-supplied or a fresh temp dir).
 *   2. Stage the site source code under `<cwd>/appwrite/sites/<siteId>/`,
 *      copying from `opts.codePath` or `siteConfig.dirPath` if those point
 *      elsewhere.
 *   3. Emit a minimal `appwrite.config.json` + `appwrite/sites.json` (split
 *      layout) via {@link import("../cli/configBridge.js").writeOfficialConfig}.
 *   4. Invoke `bunx --bun appwrite push site --site-id <id>` via
 *      {@link import("../cli/appwriteCliRunner.js").runAppwriteCli}.
 *   5. Optionally clean up the temp directory.
 *
 * The minimal `appwrite.config.json` carries ONLY the single site entry the
 * caller requested. The official CLI will read the file, find the site by
 * `$id`, and push it. No other resources are emitted.
 */

import { cp, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import type {
  AppwriteSite,
  AppwriteUtilsExtension,
  OfficialSite,
} from "appwrite-utils";
import {
  runAppwriteCli,
  type AppwriteCliCredentials,
  type AppwriteCliResult,
} from "../cli/appwriteCliRunner.js";
import { writeOfficialConfig } from "../cli/configBridge.js";

// ============================================================================
// Public API
// ============================================================================

export interface DeploySiteViaCliOptions {
  /**
   * Working directory where `appwrite.config.json` + `appwrite/sites.json`
   * should live. If unset, a fresh `os.tmpdir()` entry is created (and cleaned
   * up afterward unless `cleanup === false`).
   */
  cwd?: string;
  /**
   * Source directory containing the site's code. The CLI's `path` field for
   * the emitted site entry will reference a staged copy under
   * `<cwd>/appwrite/sites/<siteId>/`.
   *
   * Resolution order:
   *   1. `opts.codePath` if provided.
   *   2. `siteConfig.dirPath` if set.
   *   3. The canonical layout: `<cwd>/appwrite/sites/<siteId>/` (already in
   *      place — no copy performed).
   */
  codePath?: string;
  /** Credentials. If unset, falls back to env vars (see `resolveCredentialsFromEnv`). */
  credentials?: AppwriteCliCredentials;
  /** Skip the auth bridge — caller has already configured `appwrite client`. Default `false`. */
  skipAuthBridge?: boolean;
  /** Delete the temp directory after deployment. Only applies when `opts.cwd` is unset. Default `true`. */
  cleanup?: boolean;
  /** Stream CLI stdout/stderr to the parent process. Default `true`. */
  stream?: boolean;
  /** Pass `--async` to the CLI so it does not wait for the deployment to finish. Default `false`. */
  async?: boolean;
}

/**
 * Deploy a single site via `bunx --bun appwrite push site --site-id <id>`.
 *
 * @param siteConfig  The internal {@link AppwriteSite} description (must have
 *                    `$id`, `name`, and `framework`).
 * @param opts        See {@link DeploySiteViaCliOptions}.
 * @returns The {@link AppwriteCliResult} from the underlying CLI invocation.
 * @throws If `siteConfig` is missing required fields, or if the CLI exits non-zero.
 */
export async function deploySiteViaCli(
  siteConfig: AppwriteSite,
  opts: DeploySiteViaCliOptions = {},
): Promise<AppwriteCliResult> {
  // ---- Validate required fields ------------------------------------------
  if (!siteConfig.$id) {
    throw new Error("deploySiteViaCli: siteConfig.$id is required.");
  }
  if (!siteConfig.name) {
    throw new Error("deploySiteViaCli: siteConfig.name is required.");
  }
  if (!siteConfig.framework) {
    throw new Error("deploySiteViaCli: siteConfig.framework is required.");
  }

  const {
    credentials,
    skipAuthBridge = false,
    cleanup = true,
    stream = true,
    async: asyncDeploy = false,
  } = opts;

  // ---- Resolve cwd --------------------------------------------------------
  const cwdProvided = typeof opts.cwd === "string" && opts.cwd.length > 0;
  const cwd = cwdProvided
    ? resolvePath(opts.cwd as string)
    : await mkdtemp(join(tmpdir(), "appwrite-utils-site-"));

  try {
    // ---- Stage site code at <cwd>/appwrite/sites/<siteId>/ --------------
    const stagedSiteDir = resolvePath(cwd, "appwrite", "sites", siteConfig.$id);
    await mkdir(stagedSiteDir, { recursive: true });

    const sourceCodePath = opts.codePath ?? siteConfig.dirPath;
    if (sourceCodePath) {
      const absSource = resolvePath(sourceCodePath);
      // Only copy if the source is a different directory than the staging
      // target. If they're identical (e.g. caller already laid out the
      // canonical structure), skip the copy entirely.
      if (absSource !== stagedSiteDir) {
        const sourceStat = await stat(absSource).catch(() => null);
        if (!sourceStat || !sourceStat.isDirectory()) {
          throw new Error(
            `deploySiteViaCli: codePath '${absSource}' does not exist or is not a directory.`,
          );
        }
        await cp(absSource, stagedSiteDir, {
          recursive: true,
          force: true,
          errorOnExist: false,
        });
      }
    }

    // ---- Build minimal AppwriteUtilsExtension ---------------------------
    // The official site entry's `path` is RELATIVE to the `appwrite/sites.json`
    // file (which lives at `<cwd>/appwrite/sites.json`). So the staged code
    // directory `<cwd>/appwrite/sites/<id>` becomes `./sites/<id>`.
    const officialSite: OfficialSite = {
      $id: siteConfig.$id,
      name: siteConfig.name,
      path: `./sites/${siteConfig.$id}`,
      framework: siteConfig.framework,
      buildRuntime: siteConfig.buildRuntime,
      adapter: siteConfig.adapter,
      installCommand: siteConfig.installCommand,
      buildCommand: siteConfig.buildCommand,
      outputDirectory: siteConfig.outputDirectory,
      fallbackFile: siteConfig.fallbackFile,
      buildSpecification: siteConfig.buildSpecification,
      runtimeSpecification: siteConfig.runtimeSpecification,
      timeout: siteConfig.timeout,
      logging: siteConfig.logging,
    };

    // Strip undefined keys so the emitted JSON stays tidy and the strict
    // OfficialSite schema doesn't see explicit `undefined`s.
    const cleanSite = Object.fromEntries(
      Object.entries(officialSite).filter(([, v]) => v !== undefined),
    ) as OfficialSite;

    // Pull projectId / endpoint from credentials (falling back to env vars).
    const resolvedProjectId =
      credentials?.projectId ?? process.env.APPWRITE_PROJECT_ID ?? "";
    const resolvedEndpoint =
      credentials?.endpoint ?? process.env.APPWRITE_ENDPOINT;

    if (!resolvedProjectId) {
      throw new Error(
        "deploySiteViaCli: projectId is required. Provide it via opts.credentials or the APPWRITE_PROJECT_ID env var.",
      );
    }

    const ext: AppwriteUtilsExtension = {
      apiMode: "auto",
      enableBackups: true,
      backupInterval: 3600,
      backupRetention: 30,
      enableBackupCleanup: true,
      enableMockData: false,
      documentBucketId: "documents",
      usersCollectionName: "Members",
      auth: credentials
        ? {
            authMode: credentials.apiKey ? "apiKey" : "auto",
            endpoint: credentials.endpoint,
            projectId: credentials.projectId,
            apiKey: credentials.apiKey,
          }
        : { authMode: "auto" },
      appwrite: {
        projectId: resolvedProjectId,
        ...(resolvedEndpoint ? { endpoint: resolvedEndpoint } : {}),
        sites: [cleanSite],
      },
    };

    await writeOfficialConfig(ext, {
      outRoot: cwd,
      layout: "split",
      overwrite: true,
    });

    // ---- Invoke `appwrite push site --site-id <id>` ---------------------
    // The official CLI's `push site` subcommand reads the site ID from the
    // `-f, --site-id <site-id>` flag (commander option, NOT a positional).
    // Passing the id as a positional would trip Commander's unknown-argument
    // check, so we use the flag form here.
    const args = ["push", "site", "--site-id", siteConfig.$id];
    if (asyncDeploy) {
      args.push("--async");
    }

    const result = await runAppwriteCli(args, {
      cwd,
      credentials,
      skipAuthBridge,
      stream,
      // runAppwriteCli auto-appends --force when force !== false, so we don't
      // need to add it here.
    });

    return result;
  } finally {
    // Only clean up the temp dir if WE created it (i.e. caller didn't supply cwd).
    if (!cwdProvided && cleanup) {
      await rm(cwd, { recursive: true, force: true }).catch(() => {
        // Best-effort cleanup; ignore failures.
      });
    }
  }
}
