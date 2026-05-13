import path from "node:path";
import fs from "node:fs/promises";
import { findExtensionConfig, MessageFormatter } from "appwrite-utils-helpers";

export interface UpgradeConfigFlowOptions {
  cwd: string;
}

/**
 * Opt-in: rewrite legacy AppwriteUtils config.yaml to the new sidecar format.
 * For now, just informs the user about what would happen. Real translation
 * lives in a follow-up task.
 */
export async function runUpgradeConfigFlow(opts: UpgradeConfigFlowOptions): Promise<void> {
  const existing = await findExtensionConfig({ cwd: opts.cwd });
  if (existing) {
    MessageFormatter.info(`Sidecar already exists at ${existing}. Nothing to upgrade.`, { prefix: "UpgradeConfig" });
    return;
  }
  // Look for legacy config.yaml
  const legacyPaths = [
    path.join(opts.cwd, "appwriteConfig.yaml"),
    path.join(opts.cwd, ".appwrite/config.yaml"),
    path.join(opts.cwd, "appwrite", "config.yaml"),
  ];
  let legacyPath: string | undefined;
  for (const p of legacyPaths) {
    if (await fs.access(p).then(() => true, () => false)) {
      legacyPath = p;
      break;
    }
  }
  if (!legacyPath) {
    MessageFormatter.warning("No legacy config.yaml found to upgrade.", { prefix: "UpgradeConfig" });
    return;
  }
  MessageFormatter.info(
    `Found legacy config at ${legacyPath}. Automatic upgrade lands in a follow-up release. ` +
    `In the meantime, create appwrite-utils.config.yaml manually with: { appwriteConfig: './appwrite.config.json', ... }.`,
    { prefix: "UpgradeConfig" }
  );
}
