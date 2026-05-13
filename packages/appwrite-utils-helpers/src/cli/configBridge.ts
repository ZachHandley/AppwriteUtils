/**
 * @fileoverview Translation bridge between AppwriteUtils' sidecar extension
 * config (which embeds — or references — the official `appwrite.config.json`)
 * and the on-disk official format consumed by the Appwrite CLI.
 *
 * The official CLI supports a multi-file layout via the `includes` block at
 * the root of `appwrite.config.json`: each top-level resource array can be
 * pulled out into its own file (e.g. `./appwrite/collections.json`). This
 * module produces and consumes that layout.
 *
 * Path-traversal rules for `includes` paths mirror the official CLI source
 * (`tmp/appwrite-cli/lib/commands/config.ts` + `tmp/appwrite-cli/lib/config.ts`):
 * no null bytes, no `..` segments, no absolute paths, no URL schemes, must
 * end in `.json`.
 */

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import {
  AppwriteOfficialConfigSchema,
  type AppwriteOfficialConfig,
  type AppwriteUtilsExtension,
} from "appwrite-utils";

// ============================================================================
// Public types
// ============================================================================

/**
 * On-disk layout for an emitted official config.
 *
 * - `monolithic`: the entire config (including resource arrays) lives in a
 *   single `appwrite.config.json` file.
 * - `split`: resource arrays are emitted to `appwrite/<resource>.json` and the
 *   root file references them via the `includes` map.
 */
export type OfficialConfigLayout = "monolithic" | "split";

export interface WriteOfficialConfigOptions {
  /**
   * Output directory root. The file `appwrite.config.json` is written here.
   * In `split` layout, per-resource files go to `<outRoot>/appwrite/<resource>.json`.
   */
  outRoot: string;
  /** Default `"split"`. */
  layout?: OfficialConfigLayout;
  /** If `true`, overwrite existing files. Default `true`. */
  overwrite?: boolean;
}

export interface WriteOfficialConfigResult {
  /** Absolute path to the written `appwrite.config.json`. */
  configPath: string;
  /** Absolute paths to any included resource files written (only populated in `split` mode). */
  includedFiles: string[];
}

/**
 * Source-of-truth mode for an extension's official config.
 *
 * - `owned`: `ext.appwrite` set, `ext.appwriteConfig` unset.
 * - `referenced`: `ext.appwriteConfig` set, `ext.appwrite` unset.
 * - `hybrid`: both set (inline wins for content, path is preserved).
 * - `none`: neither set.
 */
export type ConfigMode = "owned" | "referenced" | "hybrid" | "none";

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Resource arrays that may appear at the top level of an official config and
 * therefore are valid keys for the `includes` map. Matches the official CLI's
 * `TOP_LEVEL_RESOURCE_ARRAY_KEYS` set.
 */
const TOP_LEVEL_RESOURCE_KEYS = [
  "functions",
  "sites",
  "databases",
  "collections",
  "tablesDB",
  "tables",
  "buckets",
  "teams",
  "webhooks",
  "topics",
  "messages",
] as const;

type ResourceKey = (typeof TOP_LEVEL_RESOURCE_KEYS)[number];

const TOP_LEVEL_RESOURCE_KEY_SET: ReadonlySet<string> = new Set(
  TOP_LEVEL_RESOURCE_KEYS,
);

function isResourceKey(value: string): value is ResourceKey {
  return TOP_LEVEL_RESOURCE_KEY_SET.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function pathExists(absPath: string): Promise<boolean> {
  try {
    await stat(absPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates a single include path against the rules enforced by the official
 * CLI. Mirrors `assertValidIncludePath` from `tmp/appwrite-cli/lib/config.ts`.
 *
 * @throws Error with a descriptive message if any rule is violated.
 */
function assertValidIncludePath(resource: string, includePath: unknown): string {
  if (typeof includePath !== "string" || includePath.trim() === "") {
    throw new Error(`Config include for '${resource}' must be a file path.`);
  }

  const normalized = includePath.trim();

  if (normalized.includes("\0")) {
    throw new Error(`Config include '${resource}' cannot contain null bytes.`);
  }
  if (normalized.includes("#")) {
    throw new Error(
      `Config include '${resource}' must be a file path without a JSON pointer fragment.`,
    );
  }
  if (normalized.split(/[\\/]+/).includes("..")) {
    throw new Error(
      `Config include '${resource}' cannot contain parent directory segments.`,
    );
  }
  if (isAbsolute(normalized)) {
    throw new Error(
      `Config include '${resource}' must be a relative file path.`,
    );
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) {
    throw new Error(`Config include '${resource}' must be a local file path.`);
  }
  if (!normalized.toLowerCase().endsWith(".json")) {
    throw new Error(`Config include '${resource}' must point to a JSON file.`);
  }

  return normalized;
}

async function writeJsonFile(
  absPath: string,
  data: unknown,
  overwrite: boolean,
): Promise<void> {
  if (!overwrite && (await pathExists(absPath))) {
    throw new Error(
      `Refusing to overwrite existing file at '${absPath}' (overwrite=false).`,
    );
  }
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, `${JSON.stringify(data, jsonReplacer, 2)}\n`, "utf8");
}

/**
 * `JSON.stringify` replacer that emits bigints as numeric strings without the
 * trailing `n`. The official CLI uses `json-bigint` to do the same round-trip;
 * since our schema validates numeric strings back into bigints we keep parity.
 */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Inspect an extension and return which mode its official config is in.
 */
export function detectConfigMode(ext: AppwriteUtilsExtension): ConfigMode {
  const hasInline = ext.appwrite !== undefined && ext.appwrite !== null;
  const hasPath =
    typeof ext.appwriteConfig === "string" && ext.appwriteConfig.length > 0;

  if (hasInline && hasPath) return "hybrid";
  if (hasInline) return "owned";
  if (hasPath) return "referenced";
  return "none";
}

/**
 * Generate `appwrite.config.json` (and optional `appwrite/*.json` include
 * files) from an `AppwriteUtilsExtension` config that is in `owned` or
 * `hybrid` mode (i.e. has an inline `appwrite` block).
 *
 * For `referenced` mode (where the user owns the appwrite.config.json file
 * directly), this throws — callers must not invoke this. The Appwrite CLI
 * will read/write that file itself.
 */
export async function writeOfficialConfig(
  ext: AppwriteUtilsExtension,
  opts: WriteOfficialConfigOptions,
): Promise<WriteOfficialConfigResult> {
  const mode = detectConfigMode(ext);
  if (mode === "referenced" || mode === "none") {
    throw new Error(
      `writeOfficialConfig requires an inline 'appwrite' block on the extension (mode='${mode}'). For 'referenced' mode, the user owns appwrite.config.json — do not call this.`,
    );
  }

  // Validate the inline official config before we emit anything.
  const parsed = AppwriteOfficialConfigSchema.safeParse(ext.appwrite);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Inline 'appwrite' block does not match AppwriteOfficialConfigSchema:\n${issues}`,
    );
  }
  const official: AppwriteOfficialConfig = parsed.data;

  const layout: OfficialConfigLayout = opts.layout ?? "split";
  const overwrite = opts.overwrite ?? true;
  const outRoot = resolvePath(opts.outRoot);
  const configPath = resolvePath(outRoot, "appwrite.config.json");

  await mkdir(outRoot, { recursive: true });

  if (layout === "monolithic") {
    // Strip any pre-existing `includes` map — in monolithic layout, resources
    // live inline and includes is meaningless.
    const { includes: _drop, ...rest } = official;
    void _drop;
    await writeJsonFile(configPath, rest, overwrite);
    return { configPath, includedFiles: [] };
  }

  // ---- Split layout ----
  const includes: Record<string, string> = {};
  const includedFiles: string[] = [];

  // Strip resource arrays + existing includes from the root copy.
  const rootCopy: Record<string, unknown> = { ...official };
  delete rootCopy.includes;

  for (const key of TOP_LEVEL_RESOURCE_KEYS) {
    const value = (official as Record<string, unknown>)[key];
    if (Array.isArray(value) && value.length > 0) {
      const relPath = `./appwrite/${key}.json`;
      const absPath = resolvePath(outRoot, "appwrite", `${key}.json`);
      await writeJsonFile(absPath, value, overwrite);
      includes[key] = relPath;
      includedFiles.push(absPath);
    }
    // Remove the inline array from the root copy regardless — split layout
    // moves all resource arrays out, even when empty (we just don't emit a
    // file for empty ones).
    delete rootCopy[key];
  }

  if (Object.keys(includes).length > 0) {
    rootCopy.includes = includes;
  }

  await writeJsonFile(configPath, rootCopy, overwrite);

  return { configPath, includedFiles };
}

/**
 * Read an `appwrite.config.json` and follow its `includes` map. Returns a
 * normalized in-memory copy where every resource array is materialized inline.
 *
 * @param rootJsonPath  Absolute or relative path to `appwrite.config.json`.
 * @returns The fully-resolved config, validated against `AppwriteOfficialConfigSchema`.
 */
export async function resolveIncludes(
  rootJsonPath: string,
): Promise<AppwriteOfficialConfig> {
  const absRoot = resolvePath(rootJsonPath);
  let rootContent: string;
  try {
    rootContent = await readFile(absRoot, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read config file '${absRoot}': ${message}`);
  }

  let rootData: unknown;
  try {
    rootData = JSON.parse(rootContent);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse JSON at '${absRoot}': ${message}`);
  }

  if (!isRecord(rootData)) {
    throw new Error(
      `Config at '${absRoot}' must be a JSON object at the top level.`,
    );
  }

  const merged: Record<string, unknown> = { ...rootData };
  const rawIncludes = merged.includes;
  delete merged.includes;

  if (rawIncludes !== undefined) {
    if (!isRecord(rawIncludes)) {
      throw new Error(`Config 'includes' at '${absRoot}' must be an object.`);
    }

    const rootDir = dirname(absRoot);
    for (const [resource, includePath] of Object.entries(rawIncludes)) {
      if (!isResourceKey(resource)) {
        throw new Error(
          `Unsupported config include '${resource}' at '${absRoot}'.`,
        );
      }

      const validatedRel = assertValidIncludePath(resource, includePath);
      const absInclude = resolvePath(rootDir, validatedRel);

      if (rootData[resource] !== undefined) {
        throw new Error(
          `Config resource '${resource}' cannot be defined both inline and in includes (at '${absRoot}').`,
        );
      }

      let includeContent: string;
      try {
        includeContent = await readFile(absInclude, "utf8");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Failed to read include file '${absInclude}' (resource '${resource}'): ${message}`,
        );
      }

      let parsedInclude: unknown;
      try {
        parsedInclude = JSON.parse(includeContent);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Failed to parse include file '${absInclude}' (resource '${resource}'): ${message}`,
        );
      }

      if (!Array.isArray(parsedInclude)) {
        throw new Error(
          `Include file '${absInclude}' (resource '${resource}') must contain a JSON array.`,
        );
      }

      merged[resource] = parsedInclude;
    }
  }

  const result = AppwriteOfficialConfigSchema.safeParse(merged);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Resolved config at '${absRoot}' does not match AppwriteOfficialConfigSchema:\n${issues}`,
    );
  }
  return result.data;
}

/**
 * After `appwrite pull all`, fold the freshly-pulled official config into an
 * existing sidecar.
 *
 * - In `owned` mode, replaces `ext.appwrite` with the pulled snapshot.
 * - In `hybrid` mode, replaces `ext.appwrite` while leaving `ext.appwriteConfig`
 *   untouched (so the path reference is preserved).
 * - In `referenced` mode, returns the extension unchanged: the user owns the
 *   official JSON file directly and the pulled state is written there by a
 *   different code path, not by this function.
 * - In `none` mode, treats the extension as newly adopting an owned config
 *   and sets `ext.appwrite` to the pulled snapshot.
 *
 * Preserves `auth`, `extensions`, and all other project-wide AppwriteUtils
 * settings exactly. Pure function — performs no I/O.
 */
export function mergePulledConfig(
  pulledOfficial: AppwriteOfficialConfig,
  existingExt: AppwriteUtilsExtension,
): AppwriteUtilsExtension {
  const mode = detectConfigMode(existingExt);

  if (mode === "referenced") {
    return existingExt;
  }

  return {
    ...existingExt,
    appwrite: pulledOfficial,
  };
}
