import path from "node:path";
import { access } from "node:fs/promises";
import {
  runAppwriteCli,
  appwriteWhoami,
  findExtensionConfig,
  findProjectRoot,
  saveExtensionConfig,
  MessageFormatter,
  type AppwriteCliCredentials,
} from "appwrite-utils-helpers";
import type { AppwriteUtilsExtensionInput } from "appwrite-utils";

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
  // 1. Auth check
  const who = await appwriteWhoami();
  if (!who.authenticated) {
    MessageFormatter.warning(
      "Not authenticated. Run `appwrite login` (or pass --endpoint --projectId --apiKey) first.",
      { prefix: "Init" }
    );
    return;
  }

  // 2. appwrite.config.json — resolve project root, then run `appwrite init project` if missing.
  let projectRoot: string;
  let absoluteConfigPath: string | undefined;
  if (opts.configPath) {
    // Explicit --config: skip walk-up; root is the sidecar's directory.
    absoluteConfigPath = path.isAbsolute(opts.configPath)
      ? opts.configPath
      : path.resolve(process.cwd(), opts.configPath);
    projectRoot = path.dirname(absoluteConfigPath);
    const appwriteConfigJsonPath = path.join(projectRoot, "appwrite.config.json");
    if (await fileExists(appwriteConfigJsonPath)) {
      MessageFormatter.info(
        `appwrite.config.json already exists at ${appwriteConfigJsonPath} — skipping init`,
        { prefix: "Init" }
      );
    } else {
      MessageFormatter.info("Running `appwrite init project` to bootstrap Appwrite config...", { prefix: "Init" });
      await runAppwriteCli(["init", "project"], {
        cwd: projectRoot,
        stream: true,
        force: false,
        credentials: opts.credentials,
      });
    }
  } else {
    try {
      const result = await findProjectRoot(opts.cwd);
      projectRoot = result.root;
      if (result.anchor === "official-config") {
        MessageFormatter.info(
          `appwrite.config.json already exists at ${result.anchorPath} — skipping init`,
          { prefix: "Init" }
        );
      } else {
        // sidecar or git anchor: bootstrap appwrite.config.json at the resolved root
        MessageFormatter.info("Running `appwrite init project` to bootstrap Appwrite config...", { prefix: "Init" });
        await runAppwriteCli(["init", "project"], {
          cwd: projectRoot,
          stream: true,
          force: false,
          credentials: opts.credentials,
        });
      }
    } catch {
      // No anchor anywhere — fall back to opts.cwd as the project root
      MessageFormatter.warning(
        `Could not locate project root from ${opts.cwd} (no sidecar, no appwrite.config.json, no .git). Initializing in place.`,
        { prefix: "Init" }
      );
      projectRoot = opts.cwd;
      MessageFormatter.info("Running `appwrite init project` to bootstrap Appwrite config...", { prefix: "Init" });
      await runAppwriteCli(["init", "project"], {
        cwd: projectRoot,
        stream: true,
        force: false,
        credentials: opts.credentials,
      });
    }
  }

  // 3. Sidecar — write if missing
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
}
