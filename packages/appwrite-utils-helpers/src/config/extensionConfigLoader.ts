/**
 * @fileoverview Standalone loader for the new `appwrite-utils.config.yaml`
 * (or `.json`) sidecar format described by `AppwriteUtilsExtensionSchema`.
 *
 * Lives BESIDE the legacy `ConfigManager` (which loads the original
 * AppwriteUtils YAML shape). The two are intentionally decoupled:
 *
 *   - Old code (run/sync/import flows) calls `ConfigManager`.
 *   - New code (function/site deploy delegation, the `--init` flag, MCP
 *     tools) calls `loadExtensionConfig` from this module.
 *
 * Discovery mirrors the pattern used by `ConfigDiscoveryService`: a
 * `find-up` walk from a starting cwd, searching for a fixed priority list
 * of filenames.
 *
 * On owned / referenced / hybrid mode the loader can also materialize the
 * fully-resolved `AppwriteOfficialConfig` for the caller, reusing
 * `resolveIncludes` from the sibling `configBridge` module to mirror the
 * exact semantics of the official Appwrite CLI's `includes` map.
 */

import { randomBytes } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import {
  dirname,
  extname,
  isAbsolute,
  resolve as resolvePath,
} from "node:path";
import { findUp } from "find-up";
import yaml from "js-yaml";
import { ZodError } from "zod";
import {
  AppwriteUtilsExtensionSchema,
  type AppwriteOfficialConfig,
  type AppwriteUtilsExtension,
} from "appwrite-utils";
import {
  detectConfigMode,
  resolveIncludes,
  type ConfigMode,
} from "../cli/configBridge.js";

// ============================================================================
// Public types
// ============================================================================

export interface LoadExtensionConfigOptions {
  /** Directory to start search. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Explicit path to a sidecar file. Skips discovery. */
  path?: string;
  /**
   * Whether to also resolve the linked `appwrite.config.json` (if in
   * referenced/hybrid mode) and embed it as `official`. Default `true`.
   */
  resolveOfficial?: boolean;
}

export interface ExtensionConfigLoadResult {
  /** The validated `AppwriteUtilsExtension` config. */
  ext: AppwriteUtilsExtension;
  /** Absolute path to the sidecar file that was loaded. */
  sidecarPath: string;
  /** Resolved mode after loading. */
  mode: ConfigMode;
  /**
   * Resolved `AppwriteOfficialConfig` (inline + included files merged), if
   * `mode !== "none"` and `resolveOfficial` was true.
   */
  official?: AppwriteOfficialConfig;
  /**
   * Absolute path to the linked `appwrite.config.json`, if
   * `mode === "referenced"` (or `"hybrid"`).
   */
  officialPath?: string;
}

// ============================================================================
// Internal constants
// ============================================================================

/**
 * Sidecar filenames in priority order. The first match found by `find-up`
 * (starting at `cwd` and walking upward) wins.
 */
const SIDECAR_FILENAMES = [
  "appwrite-utils.config.yaml",
  "appwrite-utils.config.yml",
  "appwrite-utils.config.json",
  ".appwrite-utils.yaml",
] as const;

// ============================================================================
// Internal helpers
// ============================================================================

function isYamlExtension(ext: string): boolean {
  const lowered = ext.toLowerCase();
  return lowered === ".yaml" || lowered === ".yml";
}

function isJsonExtension(ext: string): boolean {
  return ext.toLowerCase() === ".json";
}

function isDotYamlSidecar(filePath: string): boolean {
  // Handle the `.appwrite-utils.yaml` dotfile, where `extname` returns the
  // full ".yaml" portion correctly but we still treat it as YAML.
  const lowered = filePath.toLowerCase();
  return lowered.endsWith(".appwrite-utils.yaml");
}

function formatZodIssues(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const pathStr = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `  - ${pathStr}: ${issue.message}`;
    })
    .join("\n");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== null
  );
}

/**
 * Deep-merge two plain records, with `overrides` winning on key collisions
 * for non-record leaves. Arrays from `overrides` replace base arrays
 * wholesale (matching the official-config "inline wins" rule used by
 * `configBridge`).
 */
function deepMergeRecords(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, overrideValue] of Object.entries(overrides)) {
    const baseValue = result[key];
    if (isPlainRecord(baseValue) && isPlainRecord(overrideValue)) {
      result[key] = deepMergeRecords(baseValue, overrideValue);
    } else {
      result[key] = overrideValue;
    }
  }
  return result;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Search for a sidecar config file in `cwd` and its ancestors via `find-up`.
 *
 * Priority order:
 *   1. `opts.path` (if provided — used verbatim, returned as an absolute path)
 *   2. `appwrite-utils.config.yaml`
 *   3. `appwrite-utils.config.yml`
 *   4. `appwrite-utils.config.json`
 *   5. `.appwrite-utils.yaml`
 *
 * @returns Absolute path of the first match, or `undefined` if none found.
 */
export async function findExtensionConfig(opts?: {
  cwd?: string;
  path?: string;
}): Promise<string | undefined> {
  if (opts?.path !== undefined && opts.path.length > 0) {
    return isAbsolute(opts.path) ? opts.path : resolvePath(opts.path);
  }

  const cwd = opts?.cwd ?? process.cwd();

  for (const filename of SIDECAR_FILENAMES) {
    const found = await findUp(filename, { cwd });
    if (found) {
      return found;
    }
  }

  return undefined;
}

/**
 * Load and validate a sidecar `appwrite-utils.config.{yaml,yml,json}` file.
 *
 * Behavior:
 *   - Reads the file at the resolved path (UTF-8).
 *   - Parses as YAML or JSON based on the file extension.
 *   - Validates against `AppwriteUtilsExtensionSchema`.
 *   - If `mode === "referenced"` or `"hybrid"` and `resolveOfficial !== false`:
 *     resolves `ext.appwriteConfig` relative to the sidecar's directory,
 *     calls `resolveIncludes()`, and returns the materialized official
 *     config in `official` (with `ext.appwrite` merged on top for hybrid).
 *   - If `mode === "owned"` and `resolveOfficial !== false`:
 *     `official` is just `ext.appwrite` (no additional I/O).
 *   - If `mode === "none"`: `official` and `officialPath` stay undefined.
 *
 * @throws if the file is missing, unparseable, or fails validation, or if
 * referenced/hybrid mode is selected but the linked `appwrite.config.json`
 * cannot be loaded.
 */
export async function loadExtensionConfig(
  opts?: LoadExtensionConfigOptions,
): Promise<ExtensionConfigLoadResult> {
  const sidecarPath = await findExtensionConfig({
    cwd: opts?.cwd,
    path: opts?.path,
  });

  if (sidecarPath === undefined) {
    throw new Error(
      `No AppwriteUtils sidecar config found. Searched for [${SIDECAR_FILENAMES.join(
        ", ",
      )}] starting at '${opts?.cwd ?? process.cwd()}'.`,
    );
  }

  let raw: string;
  try {
    raw = await readFile(sidecarPath, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to read AppwriteUtils sidecar config at '${sidecarPath}': ${message}`,
    );
  }

  const fileExt = extname(sidecarPath);
  let parsed: unknown;

  if (isJsonExtension(fileExt)) {
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to parse JSON sidecar config at '${sidecarPath}': ${message}`,
      );
    }
  } else if (isYamlExtension(fileExt) || isDotYamlSidecar(sidecarPath)) {
    try {
      parsed = yaml.load(raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to parse YAML sidecar config at '${sidecarPath}': ${message}`,
      );
    }
  } else {
    throw new Error(
      `Unsupported sidecar config extension '${fileExt}' at '${sidecarPath}'. Expected one of: .yaml, .yml, .json.`,
    );
  }

  let ext: AppwriteUtilsExtension;
  try {
    ext = AppwriteUtilsExtensionSchema.parse(parsed);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new Error(
        `Sidecar config at '${sidecarPath}' failed validation against AppwriteUtilsExtensionSchema:\n${formatZodIssues(
          err,
        )}`,
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Sidecar config at '${sidecarPath}' failed validation: ${message}`,
    );
  }

  const mode = detectConfigMode(ext);
  const shouldResolveOfficial = opts?.resolveOfficial !== false;

  let official: AppwriteOfficialConfig | undefined;
  let officialPath: string | undefined;

  if (shouldResolveOfficial && mode !== "none") {
    if (mode === "owned") {
      // `appwrite` is guaranteed defined when mode is "owned".
      official = ext.appwrite as AppwriteOfficialConfig;
    } else {
      // referenced or hybrid: load and resolve the linked file.
      const linkedRel = ext.appwriteConfig;
      if (typeof linkedRel !== "string" || linkedRel.length === 0) {
        throw new Error(
          `Sidecar config at '${sidecarPath}' is in '${mode}' mode but 'appwriteConfig' is empty.`,
        );
      }
      const sidecarDir = dirname(sidecarPath);
      const absLinked = isAbsolute(linkedRel)
        ? linkedRel
        : resolvePath(sidecarDir, linkedRel);

      let resolved: AppwriteOfficialConfig;
      try {
        resolved = await resolveIncludes(absLinked);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Failed to resolve linked official config '${absLinked}' referenced from sidecar '${sidecarPath}': ${message}`,
        );
      }

      officialPath = absLinked;

      if (mode === "hybrid" && ext.appwrite !== undefined) {
        // Inline `appwrite` wins over the resolved file, matching the
        // "inline wins" rule documented on the schema.
        const merged = deepMergeRecords(
          resolved as unknown as Record<string, unknown>,
          ext.appwrite as unknown as Record<string, unknown>,
        );
        official = merged as unknown as AppwriteOfficialConfig;
      } else {
        official = resolved;
      }
    }
  }

  return {
    ext,
    sidecarPath,
    mode,
    official,
    officialPath,
  };
}

/**
 * Save a sidecar `AppwriteUtilsExtension` config to disk.
 *
 * - Validates against `AppwriteUtilsExtensionSchema` BEFORE writing.
 * - Serializes as YAML for `.yaml`/`.yml` extensions, JSON for `.json`,
 *   and YAML as the fallback if the extension is unrecognized.
 * - Write is atomic: serialize to `<filePath>.tmp-<random>`, then `rename()`.
 */
export async function saveExtensionConfig(
  ext: AppwriteUtilsExtension,
  filePath: string,
): Promise<void> {
  let validated: AppwriteUtilsExtension;
  try {
    validated = AppwriteUtilsExtensionSchema.parse(ext);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new Error(
        `Refusing to save sidecar config to '${filePath}': value failed AppwriteUtilsExtensionSchema validation:\n${formatZodIssues(
          err,
        )}`,
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Refusing to save sidecar config to '${filePath}': ${message}`,
    );
  }

  const absPath = isAbsolute(filePath) ? filePath : resolvePath(filePath);
  const fileExt = extname(absPath);

  let serialized: string;
  if (isJsonExtension(fileExt)) {
    serialized = `${JSON.stringify(validated, null, 2)}\n`;
  } else if (isYamlExtension(fileExt) || isDotYamlSidecar(absPath) || fileExt === "") {
    serialized = yaml.dump(validated, { lineWidth: 120, noRefs: true });
  } else {
    // Unknown extension — default to YAML and let the caller's filename
    // carry whatever extension they chose. We do not rename their file.
    serialized = yaml.dump(validated, { lineWidth: 120, noRefs: true });
  }

  const tmpPath = `${absPath}.tmp-${randomBytes(8).toString("hex")}`;
  await writeFile(tmpPath, serialized, "utf8");
  await rename(tmpPath, absPath);
}
