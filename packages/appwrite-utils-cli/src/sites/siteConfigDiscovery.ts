import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { homedir } from "node:os";
import { AppwriteSiteSchema, type AppwriteSite } from "appwrite-utils";
import { shouldIgnoreDirectory } from "appwrite-utils-helpers";
import { MessageFormatter } from "appwrite-utils-helpers";

function findGitRoot(startDir: string): string {
  let dir = path.resolve(startDir);
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir);
}

function expandTilde(p: string): string {
  if (!p) return p;
  if (p === "~" || p.startsWith("~/"))
    return p.replace(/^~(?=$|\/|\\)/, homedir());
  return p;
}

export function discoverSiteConfigs(startDir: string): AppwriteSite[] {
  const root = findGitRoot(startDir);
  const results: AppwriteSite[] = [];

  const visit = (dir: string, depth = 0) => {
    if (depth > 5) return; // cap depth
    const base = path.basename(dir);
    if (shouldIgnoreDirectory(base)) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    // Check for .siteconfig.yaml / .siteconfig.yml
    for (const fname of [".siteconfig.yaml", ".siteconfig.yml"]) {
      const cfgPath = path.join(dir, fname);
      if (fs.existsSync(cfgPath)) {
        try {
          const raw = fs.readFileSync(cfgPath, "utf8");
          const data = yaml.load(raw) as any;
          const parsed = AppwriteSiteSchema.parse({
            $id: data.id || data.$id,
            name: data.name,
            framework: data.framework,
            buildRuntime: data.buildRuntime,
            enabled: data.enabled,
            logging: data.logging,
            timeout: data.timeout,
            installCommand: data.installCommand,
            buildCommand: data.buildCommand,
            outputDirectory: data.outputDirectory,
            adapter: data.adapter,
            fallbackFile: data.fallbackFile,
            installationId: data.installationId,
            providerRepositoryId: data.providerRepositoryId,
            providerBranch: data.providerBranch,
            providerSilentMode: data.providerSilentMode,
            providerRootDirectory: data.providerRootDirectory,
            buildSpecification: data.buildSpecification,
            runtimeSpecification: data.runtimeSpecification,
            dirPath: data.dirPath,
            predeployCommands: data.predeployCommands,
            deployDir: data.deployDir,
            ignore: data.ignore,
          });

          // Resolve dirPath relative to the config file directory
          let dirPath = parsed.dirPath || ".";
          dirPath = expandTilde(dirPath);
          if (!path.isAbsolute(dirPath))
            dirPath = path.resolve(path.dirname(cfgPath), dirPath);
          const merged: AppwriteSite = { ...parsed, dirPath };
          results.push(merged);
        } catch (e) {
          MessageFormatter.warning(
            `Failed to parse ${cfgPath}: ${e instanceof Error ? e.message : String(e)}`,
            { prefix: "Sites" }
          );
        }
      }
    }

    for (const entry of entries) {
      if (entry.isDirectory()) visit(path.join(dir, entry.name), depth + 1);
    }
  };

  visit(root, 0);
  return results;
}

export function mergeDiscoveredSites(
  central: AppwriteSite[] = [],
  discovered: AppwriteSite[] = []
): AppwriteSite[] {
  const map = new Map<string, AppwriteSite>();
  for (const s of central) if (s?.$id) map.set(s.$id, s);
  for (const s of discovered) if (s?.$id) map.set(s.$id, s); // discovered overrides
  return Array.from(map.values());
}
