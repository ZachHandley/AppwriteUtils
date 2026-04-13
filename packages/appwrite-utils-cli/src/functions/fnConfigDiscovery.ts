import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { homedir } from 'node:os';
import { AppwriteFunctionSchema, type AppwriteFunction } from 'appwrite-utils';
import { shouldIgnoreDirectory } from 'appwrite-utils-helpers';
import { MessageFormatter } from 'appwrite-utils-helpers';

function findGitRoot(startDir: string): string {
  let dir = path.resolve(startDir);
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir);
}

function expandTilde(p: string): string {
  if (!p) return p;
  if (p === '~' || p.startsWith('~/')) return p.replace(/^~(?=$|\/|\\)/, homedir());
  return p;
}

export function discoverFnConfigs(startDir: string): AppwriteFunction[] {
  const root = findGitRoot(startDir);
  const results: AppwriteFunction[] = [];

  const visit = (dir: string, depth = 0) => {
    if (depth > 5) return; // cap depth
    const base = path.basename(dir);
    if (shouldIgnoreDirectory(base)) return;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    // Check for .fnconfig.yaml / .fnconfig.yml
    for (const fname of ['.fnconfig.yaml', '.fnconfig.yml']) {
      const cfgPath = path.join(dir, fname);
      if (fs.existsSync(cfgPath)) {
        try {
          const raw = fs.readFileSync(cfgPath, 'utf8');
          const data = yaml.load(raw) as any;
          const parsed = AppwriteFunctionSchema.parse({
            $id: data.id || data.$id,
            name: data.name,
            runtime: data.runtime,
            execute: data.execute || [],
            events: data.events || [],
            schedule: data.schedule,
            timeout: data.timeout,
            enabled: data.enabled,
            logging: data.logging,
            entrypoint: data.entrypoint,
            commands: data.commands,
            scopes: data.scopes,
            installationId: data.installationId,
            providerRepositoryId: data.providerRepositoryId,
            providerBranch: data.providerBranch,
            providerSilentMode: data.providerSilentMode,
            providerRootDirectory: data.providerRootDirectory,
            templateRepository: data.templateRepository,
            templateOwner: data.templateOwner,
            templateRootDirectory: data.templateRootDirectory,
            templateVersion: data.templateVersion,
            buildSpecification: data.buildSpecification,
            runtimeSpecification: data.runtimeSpecification,
            dirPath: data.dirPath,
            predeployCommands: data.predeployCommands,
            deployDir: data.deployDir,
            ignore: data.ignore,
          });

          // Resolve dirPath relative to the config file directory
          let dirPath = parsed.dirPath || '.';
          dirPath = expandTilde(dirPath);
          if (!path.isAbsolute(dirPath)) dirPath = path.resolve(path.dirname(cfgPath), dirPath);
          const merged: AppwriteFunction = { ...parsed, dirPath };
          results.push(merged);
        } catch (e) {
          MessageFormatter.warning(`Failed to parse ${cfgPath}: ${e instanceof Error ? e.message : String(e)}`, { prefix: 'Functions' });
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

export function mergeDiscoveredFunctions(
  central: AppwriteFunction[] = [],
  discovered: AppwriteFunction[] = []
): AppwriteFunction[] {
  const map = new Map<string, AppwriteFunction>();
  for (const f of central) if (f?.$id) map.set(f.$id, f);
  for (const f of discovered) if (f?.$id) map.set(f.$id, f); // discovered overrides
  return Array.from(map.values());
}

