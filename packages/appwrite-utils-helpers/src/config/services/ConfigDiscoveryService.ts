import fs from "fs";
import path from "path";
import { findUp } from "find-up";
import { MessageFormatter } from "../../shared/messageFormatter.js";
import { shouldIgnoreDirectory } from "../../utils/directoryUtils.js";

/**
 * Heuristic schema validator for YAML candidates produced by the sniff
 * walker. We only need to know "is this an Appwrite config" without
 * pulling in the full YAML parser, so a regex against the first few KB is
 * enough — Appwrite YAML configs always declare `appwriteProject` (or
 * `appwriteEndpoint`) at the top level. Comments and string values that
 * happen to mention these tokens are filtered out by requiring a `:` and
 * a leading non-indented position.
 */
async function isYamlAppwriteConfig(absPath: string): Promise<boolean> {
  let head: string;
  try {
    const buf = await fs.promises.readFile(absPath);
    head = buf.subarray(0, 4096).toString("utf-8");
  } catch {
    return false;
  }
  return /^\s*(appwriteProject|appwriteEndpoint)\s*:/m.test(head);
}

/**
 * Heuristic schema validator for JSON candidates. Parses the whole file
 * (these files are tiny — Appwrite CLI's `appwrite.json` typically <100KB)
 * and confirms the top level has a string `projectId` field, which is the
 * defining property of the Appwrite CLI config schema.
 */
async function isJsonAppwriteConfig(absPath: string): Promise<boolean> {
  let raw: string;
  try {
    raw = await fs.promises.readFile(absPath, "utf-8");
  } catch {
    return false;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  return (
    !!parsed &&
    typeof parsed === "object" &&
    typeof (parsed as { projectId?: unknown }).projectId === "string" &&
    (parsed as { projectId: string }).projectId.length > 0
  );
}

/**
 * Result of discovering configuration files or collections/tables
 */
export interface DiscoveryResult {
  found: boolean;
  path?: string;
  type: "yaml" | "typescript" | "json" | "none";
  files?: string[];
}

/**
 * Service for discovering Appwrite configuration files and collection/table definitions.
 *
 * Uses find-up for intelligent searching with git repository boundary detection:
 * 1. Finds .git directory to establish repo root boundary
 * 2. Searches UP from current directory to repo root
 * 3. Searches DOWN recursively within repo root
 *
 * Search Priority:
 * 1. YAML configs (.appwrite/config.yaml, .appwrite/config.yml, etc.)
 * 2. JSON configs (appwrite.config.json, appwrite.json)
 * 3. TypeScript configs (appwriteConfig.ts)
 */
// ──────────────────────────────────────────────────────────────────────────
// SOURCE OF TRUTH — config discovery filename patterns.
//
// These are module-level exports (not class fields) so the legacy sync entry
// points like `findYamlConfig` / `findAppwriteConfig` in yamlConfig.ts /
// configDiscovery.ts can share the EXACT same list as ConfigDiscoveryService.
// When users invent a new layout (e.g. `awconfig/appwriteConfig.yaml`),
// add it HERE in one place and every discovery path picks it up.
// ──────────────────────────────────────────────────────────────────────────

/**
 * YAML configuration file paths to search for (strict / fast path).
 *
 * Includes both the canonical `.appwrite/` (dot-prefix) location and the
 * common `appwrite/` (no-dot) sibling layout that people set up by hand.
 * Anything outside this list still has a chance via the schema-sniff
 * fallback in {@link ConfigDiscoveryService.findYamlConfig}.
 */
export const YAML_FILENAMES: readonly string[] = Object.freeze([
  ".appwrite/config.yaml",
  ".appwrite/config.yml",
  ".appwrite/appwriteConfig.yaml",
  ".appwrite/appwriteConfig.yml",
  "appwrite/config.yaml",
  "appwrite/config.yml",
  "appwrite/appwriteConfig.yaml",
  "appwrite/appwriteConfig.yml",
  "appwrite.yaml",
  "appwrite.yml",
]);

/**
 * JSON configuration file names to search for (strict / fast path).
 * Sniff fallback also looks for these basenames in any subdirectory.
 */
export const JSON_FILENAMES: readonly string[] = Object.freeze([
  "appwrite.config.json",
  "appwrite.json",
]);

/**
 * Basenames the schema-sniff fallback is allowed to open.
 * Kept narrow so we never accidentally parse e.g. a Vite `config.yaml`.
 */
export const YAML_SNIFF_BASENAMES: readonly string[] = Object.freeze([
  "config.yaml",
  "config.yml",
  "appwriteConfig.yaml",
  "appwriteConfig.yml",
  "appwrite.yaml",
  "appwrite.yml",
]);

export const JSON_SNIFF_BASENAMES: readonly string[] = Object.freeze([
  "appwrite.config.json",
  "appwrite.json",
]);

/**
 * TypeScript configuration file names to search for
 */
export const TS_FILENAMES: readonly string[] = Object.freeze(["appwriteConfig.ts"]);

export class ConfigDiscoveryService {
  // Filename constants live at module scope (see top of file). Keep these
  // private aliases so existing `this.X` call sites in this class continue to
  // work without churn.
  private readonly YAML_FILENAMES = YAML_FILENAMES;
  private readonly JSON_FILENAMES = JSON_FILENAMES;
  private readonly YAML_SNIFF_BASENAMES = YAML_SNIFF_BASENAMES;
  private readonly JSON_SNIFF_BASENAMES = JSON_SNIFF_BASENAMES;
  private readonly TS_FILENAMES = TS_FILENAMES;

  /**
   * Finds the git repository root directory
   * @param startDir The directory to start searching from
   * @returns Path to the repository root, or startDir if no .git found
   */
  private async findRepoRoot(startDir: string): Promise<string> {
    const gitDir = await findUp(".git", {
      cwd: startDir,
      type: "directory",
    });

    return gitDir ? path.dirname(gitDir) : startDir;
  }

  /**
   * Recursively searches downward for files matching patterns
   * @param dir Directory to search in
   * @param patterns File patterns to match
   * @param maxDepth Maximum depth to search
   * @param currentDepth Current recursion depth
   * @returns First matching file path or null
   */
  private async searchDownward(
    dir: string,
    patterns: readonly string[],
    maxDepth: number = 5,
    currentDepth: number = 0
  ): Promise<string | null> {
    if (currentDepth > maxDepth) return null;
    if (shouldIgnoreDirectory(path.basename(dir))) return null;

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      // Check current directory for matches
      for (const pattern of patterns) {
        const fullPath = path.join(dir, pattern);
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }

      // Recurse into subdirectories
      for (const entry of entries) {
        if (entry.isDirectory() && !shouldIgnoreDirectory(entry.name)) {
          const result = await this.searchDownward(
            path.join(dir, entry.name),
            patterns,
            maxDepth,
            currentDepth + 1
          );
          if (result) return result;
        }
      }
    } catch (error) {
      // Ignore permission errors
    }

    return null;
  }

  /**
   * Walks downward from `dir`, opens every file whose basename is in
   * `basenames`, and returns the first one for which `validate(absPath)`
   * resolves to true.
   *
   * Used as the last-resort fallback when strict path patterns miss — lets
   * us discover Appwrite configs in arbitrary directory layouts (e.g.
   * `apps/api/appwrite/config.yaml`) without pattern whack-a-mole.
   */
  private async searchDownwardWithSniff(
    dir: string,
    basenames: readonly string[],
    validate: (absPath: string) => Promise<boolean>,
    maxDepth: number = 6,
    currentDepth: number = 0
  ): Promise<string | null> {
    if (currentDepth > maxDepth) return null;
    if (shouldIgnoreDirectory(path.basename(dir))) return null;

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return null;
    }

    // Files first — sniff any candidate basename in this directory.
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!basenames.includes(entry.name)) continue;
      const absPath = path.join(dir, entry.name);
      try {
        if (await validate(absPath)) return absPath;
      } catch {
        // ignore unreadable / unparseable candidates and keep walking
      }
    }

    // Then recurse.
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (shouldIgnoreDirectory(entry.name)) continue;
      const result = await this.searchDownwardWithSniff(
        path.join(dir, entry.name),
        basenames,
        validate,
        maxDepth,
        currentDepth + 1
      );
      if (result) return result;
    }

    return null;
  }

  /**
   * Finds any configuration file with configurable priority
   * @param startDir The directory to start searching from
   * @param preferJson If true, prioritizes appwrite.config.json over YAML (default: false)
   * @returns Path to the configuration file or null if not found
   *
   * Default priority: YAML → JSON → TypeScript
   * With preferJson=true: JSON → YAML → TypeScript
   */
  public async findConfig(startDir: string, preferJson: boolean = false): Promise<string | null> {
    // Find repo root to establish boundary
    const repoRoot = await this.findRepoRoot(startDir);

    if (preferJson) {
      // Try JSON first when --appwrite-config flag is used
      const jsonConfig = await this.findProjectConfig(startDir, repoRoot);
      if (jsonConfig) return jsonConfig;

      // Try YAML second
      const yamlConfig = await this.findYamlConfig(startDir, repoRoot);
      if (yamlConfig) return yamlConfig;

      // Try TypeScript last (lowest priority)
      const tsConfig = await this.findTypeScriptConfig(startDir, repoRoot);
      if (tsConfig) return tsConfig;
    } else {
      // Default priority: YAML → JSON → TypeScript
      const yamlConfig = await this.findYamlConfig(startDir, repoRoot);
      if (yamlConfig) return yamlConfig;

      const jsonConfig = await this.findProjectConfig(startDir, repoRoot);
      if (jsonConfig) return jsonConfig;

      const tsConfig = await this.findTypeScriptConfig(startDir, repoRoot);
      if (tsConfig) return tsConfig;
    }

    return null;
  }

  /**
   * Finds YAML configuration files
   * Searches UP to repo root, then DOWN from repo root
   * @param startDir The directory to start searching from
   * @param repoRoot The repository root boundary
   * @returns Path to the YAML config file or null if not found
   */
  public async findYamlConfig(
    startDir: string,
    repoRoot?: string
  ): Promise<string | null> {
    const boundary = repoRoot || (await this.findRepoRoot(startDir));

    // Search UP to repo root
    const upwardResult = await findUp(this.YAML_FILENAMES, {
      cwd: startDir,
      stopAt: boundary,
    });

    if (upwardResult) return upwardResult;

    // Search DOWN from repo root with known relative patterns first
    const strictHit = await this.searchDownward(boundary, this.YAML_FILENAMES);
    if (strictHit) return strictHit;

    // Last resort: walk every subdir, open any file matching the sniff
    // basenames, and accept it only if it parses as an Appwrite YAML config
    // (has `appwriteProject` or `appwriteEndpoint`). Covers ad-hoc layouts
    // like `myapp/server/appwrite/config.yaml`.
    return await this.searchDownwardWithSniff(
      boundary,
      this.YAML_SNIFF_BASENAMES,
      isYamlAppwriteConfig
    );
  }

  /**
   * Finds JSON project configuration files (appwrite.config.json, appwrite.json)
   * @param startDir The directory to start searching from
   * @param repoRoot The repository root boundary
   * @returns Path to the JSON config file or null if not found
   */
  public async findProjectConfig(
    startDir: string,
    repoRoot?: string
  ): Promise<string | null> {
    const boundary = repoRoot || (await this.findRepoRoot(startDir));

    // Search UP to repo root
    const upwardResult = await findUp(this.JSON_FILENAMES, {
      cwd: startDir,
      stopAt: boundary,
    });

    if (upwardResult) return upwardResult;

    // Search DOWN from repo root with strict patterns first
    const strictHit = await this.searchDownward(boundary, this.JSON_FILENAMES);
    if (strictHit) return strictHit;

    // Schema-sniff fallback: walk every subdir, parse any file matching the
    // sniff basenames, accept only if it has an Appwrite-CLI `projectId`.
    return await this.searchDownwardWithSniff(
      boundary,
      this.JSON_SNIFF_BASENAMES,
      isJsonAppwriteConfig
    );
  }

  /**
   * Finds TypeScript configuration files (appwriteConfig.ts)
   * @param startDir The directory to start searching from
   * @param repoRoot The repository root boundary
   * @returns Path to the TypeScript config file or null if not found
   */
  public async findTypeScriptConfig(
    startDir: string,
    repoRoot?: string
  ): Promise<string | null> {
    const boundary = repoRoot || (await this.findRepoRoot(startDir));

    // Search UP to repo root
    const upwardResult = await findUp(this.TS_FILENAMES, {
      cwd: startDir,
      stopAt: boundary,
    });

    if (upwardResult) return upwardResult;

    // Search DOWN from repo root
    return await this.searchDownward(boundary, this.TS_FILENAMES);
  }

  /**
   * Discovers collection YAML files in a collections/ directory
   * @param collectionsDir Path to the collections directory
   * @returns Discovery result with file paths
   */
  public async discoverCollections(collectionsDir: string): Promise<DiscoveryResult> {
    if (!fs.existsSync(collectionsDir)) {
      return {
        found: false,
        type: "none",
        files: [],
      };
    }

    try {
      const files = fs.readdirSync(collectionsDir);
      const collectionFiles = files.filter(
        (file) =>
          (file.endsWith(".yaml") ||
            file.endsWith(".yml") ||
            file.endsWith(".ts")) &&
          file !== "index.ts"
      );

      if (collectionFiles.length === 0) {
        return {
          found: false,
          type: "none",
          files: [],
        };
      }

      MessageFormatter.success(
        `Discovered ${collectionFiles.length} collection file(s) in ${collectionsDir}`,
        { prefix: "Discovery" }
      );

      return {
        found: true,
        path: collectionsDir,
        type: "yaml",
        files: collectionFiles,
      };
    } catch (error) {
      MessageFormatter.error(
        `Error discovering collections in ${collectionsDir}`,
        error instanceof Error ? error : undefined,
        { prefix: "Discovery" }
      );
      return {
        found: false,
        type: "none",
        files: [],
      };
    }
  }

  /**
   * Discovers table YAML files in a tables/ directory
   * @param tablesDir Path to the tables directory
   * @returns Discovery result with file paths
   */
  public async discoverTables(tablesDir: string): Promise<DiscoveryResult> {
    if (!fs.existsSync(tablesDir)) {
      return {
        found: false,
        type: "none",
        files: [],
      };
    }

    try {
      const files = fs.readdirSync(tablesDir);
      const tableFiles = files.filter(
        (file) =>
          (file.endsWith(".yaml") ||
            file.endsWith(".yml") ||
            file.endsWith(".ts")) &&
          file !== "index.ts"
      );

      if (tableFiles.length === 0) {
        return {
          found: false,
          type: "none",
          files: [],
        };
      }

      MessageFormatter.success(
        `Discovered ${tableFiles.length} table file(s) in ${tablesDir}`,
        { prefix: "Discovery" }
      );

      return {
        found: true,
        path: tablesDir,
        type: "yaml",
        files: tableFiles,
      };
    } catch (error) {
      MessageFormatter.error(
        `Error discovering tables in ${tablesDir}`,
        error instanceof Error ? error : undefined,
        { prefix: "Discovery" }
      );
      return {
        found: false,
        type: "none",
        files: [],
      };
    }
  }

  /**
   * Finds the .appwrite configuration directory
   * @param startDir The directory to start searching from
   * @returns Path to .appwrite directory or null if not found
   */
  public async findAppwriteDirectory(startDir: string): Promise<string | null> {
    const repoRoot = await this.findRepoRoot(startDir);

    // Search UP to repo root
    const upwardResult = await findUp(".appwrite", {
      cwd: startDir,
      type: "directory",
      stopAt: repoRoot,
    });

    if (upwardResult) return upwardResult;

    // Search DOWN from repo root
    return await this.searchDownward(repoRoot, [".appwrite"]);
  }

  /**
   * Finds the functions directory
   * @param startDir The directory to start searching from
   * @returns Path to functions directory or null if not found
   */
  public async findFunctionsDirectory(startDir: string): Promise<string | null> {
    const repoRoot = await this.findRepoRoot(startDir);

    // Search UP to repo root
    const upwardResult = await findUp("functions", {
      cwd: startDir,
      type: "directory",
      stopAt: repoRoot,
    });

    if (upwardResult) return upwardResult;

    // Search DOWN from repo root
    return await this.searchDownward(repoRoot, ["functions"]);
  }

  /**
   * Gets a summary of all discoverable configuration files
   * Useful for debugging configuration issues
   * @param startDir The directory to start searching from
   * @returns Object containing paths to all discovered config types
   */
  public async getConfigurationSummary(startDir: string): Promise<{
    yaml: string | null;
    typescript: string | null;
    json: string | null;
    appwriteDirectory: string | null;
    functionsDirectory: string | null;
    selectedConfig: string | null;
    repoRoot: string;
  }> {
    const repoRoot = await this.findRepoRoot(startDir);

    return {
      yaml: await this.findYamlConfig(startDir, repoRoot),
      typescript: await this.findTypeScriptConfig(startDir, repoRoot),
      json: await this.findProjectConfig(startDir, repoRoot),
      appwriteDirectory: await this.findAppwriteDirectory(startDir),
      functionsDirectory: await this.findFunctionsDirectory(startDir),
      selectedConfig: await this.findConfig(startDir),
      repoRoot,
    };
  }
}
