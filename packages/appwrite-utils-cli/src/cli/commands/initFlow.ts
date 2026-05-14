import path from "node:path";
import { access } from "node:fs/promises";
import {
  runAppwriteCli,
  injectCredentials,
  appwriteWhoami,
  findExtensionConfig,
  findProjectRoot,
  loadExtensionConfig,
  resolveEndpoint,
  saveExtensionConfig,
  MessageFormatter,
  type AppwriteCliCredentials,
} from "appwrite-utils-helpers";
import type { AppwriteUtilsExtensionInput } from "appwrite-utils";

/**
 * Best-effort: read the sidecar's `auth:` block from disk if a sidecar exists
 * at or above the given root. Never throws — missing/invalid sidecars resolve
 * to `undefined`.
 */
async function loadSidecarAuth(cwd: string): Promise<
  | { endpoint?: string; projectId?: string; apiKey?: string; sessionCookie?: string }
  | undefined
> {
  try {
    const loaded = await loadExtensionConfig({ cwd, resolveOfficial: false });
    return (loaded.ext as { auth?: typeof loaded.ext.auth }).auth;
  } catch {
    return undefined;
  }
}

/**
 * Resolve credentials for `runInitFlow` by layering argv (opts.credentials) on
 * top of env and sidecar.auth. Returns `undefined` if no endpoint is resolvable.
 */
async function resolveInitCredentials(
  cwd: string,
  argvCreds?: AppwriteCliCredentials
): Promise<AppwriteCliCredentials | undefined> {
  const sidecarAuth = await loadSidecarAuth(cwd);
  return resolveEndpoint({
    argv: argvCreds,
    sidecarAuth,
  });
}

const PRE_INIT_PULL_WARNING =
  "Heads up: `appwrite init project` will ask 'Pull all resources?'. Answer N — we'll show a focused selection menu next (functions + tables + filtered buckets, no teams).";

export interface InitFlowOptions {
  cwd: string;
  credentials?: AppwriteCliCredentials;
  /**
   * Explicit sidecar path from --config <path>. When set,
   * dirname(resolve(configPath)) is the project root and findProjectRoot is skipped.
   */
  configPath?: string;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function runInitFlow(opts: InitFlowOptions): Promise<void> {
  // 1. Resolve project root early so we can find the sidecar and its `auth:` block.
  let projectRoot: string;
  let absoluteConfigPath: string | undefined;
  let appwriteConfigJsonExists = false;

  if (opts.configPath) {
    absoluteConfigPath = path.isAbsolute(opts.configPath)
      ? opts.configPath
      : path.resolve(process.cwd(), opts.configPath);
    projectRoot = path.dirname(absoluteConfigPath);
    appwriteConfigJsonExists = await fileExists(
      path.join(projectRoot, "appwrite.config.json")
    );
  } else {
    try {
      const result = await findProjectRoot(opts.cwd);
      projectRoot = result.root;
      appwriteConfigJsonExists = result.anchor === "official-config";
    } catch {
      MessageFormatter.warning(
        `Could not locate project root from ${opts.cwd} (no sidecar, no appwrite.config.json, no .git). Initializing in place.`,
        { prefix: "Init" }
      );
      projectRoot = opts.cwd;
      appwriteConfigJsonExists = await fileExists(
        path.join(projectRoot, "appwrite.config.json")
      );
    }
  }

  // 2. Resolve and (when possible) pre-inject the endpoint so the official CLI
  //    talks to the right server. Layers argv → APPWRITE_* env → sidecar.auth.
  const resolvedCreds = await resolveInitCredentials(projectRoot, opts.credentials);
  if (resolvedCreds) {
    MessageFormatter.info(
      `Configuring appwrite client → ${resolvedCreds.endpoint}`,
      { prefix: "Init" }
    );
    try {
      await injectCredentials(resolvedCreds, { cwd: projectRoot });
    } catch (err) {
      MessageFormatter.warning(
        `Could not pre-configure appwrite client (continuing): ${
          err instanceof Error ? err.message : String(err)
        }`,
        { prefix: "Init" }
      );
    }
  }

  // 3. Auth check (now that the endpoint, if known, is set).
  const who = await appwriteWhoami();
  if (!who.authenticated) {
    MessageFormatter.warning(
      "Not authenticated. Run `appwrite login` (or pass --endpoint --projectId --apiKey) first.",
      { prefix: "Init" }
    );
    return;
  }

  // 4. appwrite.config.json — run `appwrite init project` if missing.
  if (appwriteConfigJsonExists) {
    MessageFormatter.info(
      `appwrite.config.json already exists at ${path.join(projectRoot, "appwrite.config.json")} — skipping init`,
      { prefix: "Init" }
    );
  } else {
    MessageFormatter.info(PRE_INIT_PULL_WARNING, { prefix: "Init" });
    MessageFormatter.info("Running `appwrite init project` to bootstrap Appwrite config...", { prefix: "Init" });
    await runAppwriteCli(["init", "project"], {
      cwd: projectRoot,
      stream: true,
      force: false,
      credentials: resolvedCreds ?? opts.credentials,
    });
  }

  // 5. Sidecar — write if missing
  if (absoluteConfigPath) {
    // Explicit --config: sidecar location is fixed, no walk-up.
    if (await fileExists(absoluteConfigPath)) {
      MessageFormatter.info(`Sidecar already exists at ${absoluteConfigPath} — skipping`, { prefix: "Init" });
    } else {
      const sidecar: AppwriteUtilsExtensionInput = {
        appwriteConfig: "./appwrite.config.json",
        apiMode: "auto",
        enableBackups: true,
        backupInterval: 3600,
        backupRetention: 30,
        enableBackupCleanup: true,
        enableMockData: false,
        documentBucketId: "documents",
        usersCollectionName: "Members",
      };
      await saveExtensionConfig(sidecar as any, absoluteConfigPath);
      MessageFormatter.success(`Created sidecar config at ${absoluteConfigPath}`, { prefix: "Init" });
    }
  } else {
    const sidecarPath = await findExtensionConfig({ cwd: projectRoot });
    if (!sidecarPath) {
      const newSidecarPath = path.join(projectRoot, "appwrite-utils.config.yaml");
      const sidecar: AppwriteUtilsExtensionInput = {
        appwriteConfig: "./appwrite.config.json",
        apiMode: "auto",
        enableBackups: true,
        backupInterval: 3600,
        backupRetention: 30,
        enableBackupCleanup: true,
        enableMockData: false,
        documentBucketId: "documents",
        usersCollectionName: "Members",
      };
      await saveExtensionConfig(sidecar as any, newSidecarPath);
      MessageFormatter.success(`Created sidecar config at ${newSidecarPath}`, { prefix: "Init" });
    } else {
      MessageFormatter.info(`Sidecar already exists at ${sidecarPath} — skipping`, { prefix: "Init" });
    }
  }

  // 6. Post-link selective pull (functions + tables + filtered buckets, no teams by default).
  // Wrapped in a try/catch: the link itself succeeded, so a pull failure should
  // surface but not abort the whole flow.
  try {
    const { runSelectivePullFlow } = await import("./selectivePullFlow.js");
    await runSelectivePullFlow({
      projectRoot,
      configPath: opts.configPath,
      credentials: opts.credentials,
    });
  } catch (err) {
    MessageFormatter.warning(
      `Post-link pull failed (link is still complete): ${
        err instanceof Error ? err.message : String(err)
      }`,
      { prefix: "Init" }
    );
  }
}
