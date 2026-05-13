import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import {
  findProjectRoot,
  loadExtensionConfig,
  saveExtensionConfig,
  syncExtensionStubsFromOfficial,
  MessageFormatter,
} from "appwrite-utils-helpers";

export interface SyncExtensionsFlowOptions {
  /** From --config <path>. When set, dirname(resolve(configPath)) is project root. */
  configPath?: string;
}

/**
 * Drives the `--sync-extensions` flag: load sidecar + resolved official config,
 * stub any `$id`s missing from `ext.extensions.<resource>`, warn about orphans,
 * and write the sidecar back if anything was added.
 */
export async function runSyncExtensionsFlow(
  opts: SyncExtensionsFlowOptions
): Promise<void> {
  let projectRoot: string;
  if (opts.configPath) {
    const abs = isAbsolute(opts.configPath)
      ? opts.configPath
      : resolvePath(process.cwd(), opts.configPath);
    projectRoot = dirname(abs);
  } else {
    const { root } = await findProjectRoot();
    projectRoot = root;
  }

  const loaded = await loadExtensionConfig({
    cwd: projectRoot,
    ...(opts.configPath ? { path: opts.configPath } : {}),
    resolveOfficial: true,
  });

  if (!loaded.official) {
    throw new Error(
      `--sync-extensions: sidecar at '${loaded.sidecarPath}' has no resolvable official config (mode='${loaded.mode}'). ` +
        `Run 'appwrite-migrate --init' first or add an 'appwrite' / 'appwriteConfig' block to the sidecar.`
    );
  }

  const { ext, added, orphaned } = syncExtensionStubsFromOfficial(
    loaded.ext,
    loaded.official
  );

  if (orphaned.length > 0) {
    MessageFormatter.warning(
      `${orphaned.length} orphaned extension entr${orphaned.length === 1 ? "y" : "ies"} preserved (in sidecar but missing from official): ${orphaned.join(", ")}`,
      { prefix: "SyncExtensions" }
    );
  }

  if (added.length === 0) {
    MessageFormatter.info("Sidecar extensions already in sync with official config.", {
      prefix: "SyncExtensions",
    });
    return;
  }

  await saveExtensionConfig(ext, loaded.sidecarPath);

  MessageFormatter.success(
    `Added ${added.length} stub${added.length === 1 ? "" : "s"} to ${loaded.sidecarPath}: ${added.join(", ")}`,
    { prefix: "SyncExtensions" }
  );
}
