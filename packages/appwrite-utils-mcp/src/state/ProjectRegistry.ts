/**
 * Persistent registry mapping Appwrite project IDs to the absolute project
 * directory (the dir containing that project's `appwriteConfig.yaml` /
 * `appwrite.json` / etc.).
 *
 * Backed by `~/.appwrite/projects.json` — sibling to the Appwrite CLI's
 * `prefs.json`, but written and read independently. This module MUST NOT read
 * or write `prefs.json` — that file is owned by the upstream Appwrite CLI and
 * touching it risks corrupting the user's CLI session state.
 *
 * Schema:
 * ```jsonc
 * {
 *   "<projectId>": {
 *     "projectDir": "/abs/path/to/project",
 *     "endpoint": "https://cloud.appwrite.io/v1", // optional
 *     "lastSelectedAt": "2026-05-29T12:34:56.789Z"
 *   }
 * }
 * ```
 *
 * @packageDocumentation
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";

export interface ProjectRegistryEntry {
  projectDir: string;
  endpoint?: string;
  lastSelectedAt: string;
}

export interface ProjectRegistrySnapshot {
  [projectId: string]: ProjectRegistryEntry;
}

/**
 * Default location: `~/.appwrite/projects.json`. Lives alongside prefs.json
 * but is fully independent — the Appwrite CLI never reads or writes it.
 */
function defaultRegistryPath(): string {
  return join(homedir(), ".appwrite", "projects.json");
}

/**
 * Persistent project-directory registry. Safe for concurrent MCP instances:
 * writes go through an atomic tmp-file rename so a crash mid-write can't
 * leave a half-written JSON file. Reads tolerate a missing or corrupt file
 * (treated as empty) — losing the registry is annoying, not catastrophic.
 */
export class ProjectRegistry {
  private readonly filePath: string;
  private cache: ProjectRegistrySnapshot | null = null;

  constructor(filePath: string = defaultRegistryPath()) {
    this.filePath = filePath;
  }

  /**
   * Where the registry is persisted on disk. Surfaced for debugging /
   * `list_appwrite_projects` output.
   */
  public getFilePath(): string {
    return this.filePath;
  }

  /**
   * Load the registry from disk. Cached after first call. A missing or
   * corrupt file becomes an empty snapshot — never throws.
   */
  public async load(): Promise<ProjectRegistrySnapshot> {
    if (this.cache) return this.cache;
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      this.cache = normalize(parsed);
    } catch {
      this.cache = {};
    }
    return this.cache;
  }

  /**
   * Look up the registry entry for a project ID. Returns null when unknown.
   */
  public async get(projectId: string): Promise<ProjectRegistryEntry | null> {
    if (!projectId) return null;
    const snapshot = await this.load();
    const entry = snapshot[projectId];
    return entry ? { ...entry } : null;
  }

  /**
   * Upsert an entry for a project ID. Always stamps `lastSelectedAt` with
   * the current ISO timestamp. Persists atomically to disk.
   */
  public async set(
    projectId: string,
    entry: Omit<ProjectRegistryEntry, "lastSelectedAt"> & {
      lastSelectedAt?: string;
    }
  ): Promise<ProjectRegistryEntry> {
    if (!projectId) throw new Error("ProjectRegistry.set: projectId is required");
    if (!entry.projectDir) {
      throw new Error("ProjectRegistry.set: projectDir is required");
    }
    const snapshot = await this.load();
    const next: ProjectRegistryEntry = {
      projectDir: entry.projectDir,
      endpoint: entry.endpoint,
      lastSelectedAt: entry.lastSelectedAt ?? new Date().toISOString(),
    };
    snapshot[projectId] = next;
    this.cache = snapshot;
    await this.persist(snapshot);
    return { ...next };
  }

  /**
   * Remove an entry for a project ID. No-op when the entry doesn't exist.
   */
  public async remove(projectId: string): Promise<boolean> {
    if (!projectId) return false;
    const snapshot = await this.load();
    if (!(projectId in snapshot)) return false;
    delete snapshot[projectId];
    this.cache = snapshot;
    await this.persist(snapshot);
    return true;
  }

  /**
   * Return every registered project as a flat array, sorted by most-recently
   * selected first.
   */
  public async list(): Promise<
    Array<ProjectRegistryEntry & { projectId: string }>
  > {
    const snapshot = await this.load();
    return Object.entries(snapshot)
      .map(([projectId, entry]) => ({ projectId, ...entry }))
      .sort((a, b) => (b.lastSelectedAt ?? "").localeCompare(a.lastSelectedAt ?? ""));
  }

  /**
   * Drop the in-memory cache. Next read will hit disk. Useful in tests so
   * one test's writes don't leak into the next.
   */
  public invalidate(): void {
    this.cache = null;
  }

  /**
   * Write the snapshot to disk via tmp-file + rename so a crash mid-write
   * can't leave a half-written JSON file. Creates the parent directory if
   * needed (mode 0700 since prefs/projects can contain endpoint strings).
   */
  private async persist(snapshot: ProjectRegistrySnapshot): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const tmpPath = `${this.filePath}.${randomBytes(6).toString("hex")}.tmp`;
    const body = `${JSON.stringify(snapshot, null, 2)}\n`;
    await writeFile(tmpPath, body, { mode: 0o600 });
    await rename(tmpPath, this.filePath);
  }
}

/**
 * Coerce arbitrary parsed JSON into a valid registry snapshot. Drops entries
 * that don't have a string `projectDir`. Never throws.
 */
function normalize(parsed: unknown): ProjectRegistrySnapshot {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: ProjectRegistrySnapshot = {};
  for (const [pid, raw] of Object.entries(parsed as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as {
      projectDir?: unknown;
      endpoint?: unknown;
      lastSelectedAt?: unknown;
    };
    if (typeof entry.projectDir !== "string" || !entry.projectDir) continue;
    out[pid] = {
      projectDir: entry.projectDir,
      endpoint:
        typeof entry.endpoint === "string" && entry.endpoint ? entry.endpoint : undefined,
      lastSelectedAt:
        typeof entry.lastSelectedAt === "string" && entry.lastSelectedAt
          ? entry.lastSelectedAt
          : new Date(0).toISOString(),
    };
  }
  return out;
}
