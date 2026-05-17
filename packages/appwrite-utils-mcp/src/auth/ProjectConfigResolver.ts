/**
 * Resolves project configuration from the MCP server's working directory.
 *
 * Each MCP instance is isolated to its own CWD/configDir — the resolved
 * project belongs to *this* server and never leaks to sibling MCPs running
 * in other project directories.
 *
 * Two config formats are supported:
 *  - `.appwrite/config.yaml` (appwrite-utils format) — has endpoint + project +
 *    full creds inline; can fully authenticate without consulting prefs.json.
 *  - `appwrite.json` (Appwrite CLI format) — has only `projectId` (+ project
 *    metadata); endpoint and creds must come from `~/.appwrite/prefs.json`.
 *
 * @packageDocumentation
 */

import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import {
  ConfigDiscoveryService,
  ConfigLoaderService,
} from "appwrite-utils-helpers";

export interface ResolvedProjectConfig {
  /** Absolute path of the config file that was loaded. */
  source: string;
  /** Config format detected from extension. */
  format: "yaml" | "appwrite-json";
  projectId: string;
  endpoint?: string;
  apiKey?: string;
  sessionCookie?: string;
}

/**
 * Resolve the project this MCP instance is bound to, by scanning the
 * configured working directory for an Appwrite config file.
 *
 * Returns `null` when no config file is found. Returns a partial config when
 * the file lacks fields (e.g. appwrite.json has projectId but no endpoint —
 * downstream auth resolution fills the gap from prefs.json).
 */
export async function resolveProjectConfig(
  workingDir: string
): Promise<ResolvedProjectConfig | null> {
  const discovery = new ConfigDiscoveryService();

  let configPath: string | null = null;
  try {
    configPath = await discovery.findConfig(workingDir);
  } catch {
    // Non-fatal: no project config means we fall through to other auth tiers.
    return null;
  }

  if (!configPath) return null;

  const ext = extname(configPath).toLowerCase();

  // YAML: appwrite-utils format — full creds available inline.
  if (ext === ".yaml" || ext === ".yml") {
    try {
      const loader = new ConfigLoaderService();
      const config = await loader.loadYaml(configPath);
      if (!config.appwriteProject) return null;
      return {
        source: configPath,
        format: "yaml",
        projectId: config.appwriteProject,
        endpoint: config.appwriteEndpoint || undefined,
        apiKey: config.appwriteKey || undefined,
        sessionCookie: config.sessionCookie || undefined,
      };
    } catch {
      return null;
    }
  }

  // JSON: Appwrite CLI format — has projectId only. ConfigLoaderService.loadFromPath
  // throws here (it requires both endpoint and projectId), so read raw.
  if (ext === ".json") {
    try {
      const raw = JSON.parse(await readFile(configPath, "utf-8")) as {
        projectId?: unknown;
      };
      if (typeof raw.projectId !== "string" || !raw.projectId) return null;
      return {
        source: configPath,
        format: "appwrite-json",
        projectId: raw.projectId,
        // Endpoint/creds are not in appwrite.json; downstream auth fills them
        // by matching projectId or endpoint against prefs.json.
      };
    } catch {
      return null;
    }
  }

  // TypeScript configs aren't loaded at MCP startup (would require eval).
  return null;
}
