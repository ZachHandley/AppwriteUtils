import { z } from "zod";
import yaml from "js-yaml";
import { readFile, readdir, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join, resolve } from "node:path";
import {
  FunctionSchema,
  SiteSchema,
  PerFunctionConfigSchema,
  PerSiteConfigSchema,
  type PerFunctionConfig,
  type PerSiteConfig,
  type OfficialFunction,
  type OfficialSite,
} from "appwrite-utils";

export interface DiscoveredPerFunctionConfig {
  /** $id from the YAML (NOT the dirname). */
  id: string;
  /** Absolute path of the per-function YAML/JSON file. */
  sidecarPath: string;
  /** Absolute path of the function's directory (parent of sidecarPath). */
  dir: string;
  /** Validated config (PerFunctionConfig). */
  parsed: PerFunctionConfig;
}

export interface DiscoveredPerSiteConfig {
  id: string;
  sidecarPath: string;
  dir: string;
  parsed: PerSiteConfig;
}

const CANDIDATE_FILENAMES = [
  "appwrite-utils.yaml",
  "appwrite-utils.yml",
  "appwrite-utils.json",
] as const;

type CandidateFilename = (typeof CANDIDATE_FILENAMES)[number];

interface FoundSidecar {
  sidecarPath: string;
  filename: CandidateFilename;
}

/** Resolve the first existing sidecar filename inside `dir`, or undefined. */
async function findSidecarInDir(dir: string): Promise<FoundSidecar | undefined> {
  for (const filename of CANDIDATE_FILENAMES) {
    const sidecarPath = join(dir, filename);
    try {
      const st = await stat(sidecarPath);
      if (st.isFile()) {
        return { sidecarPath, filename };
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw err;
      }
    }
  }
  return undefined;
}

/** Parse raw file content as YAML or JSON based on filename. */
function parseSidecarContent(
  filename: CandidateFilename,
  raw: string,
  filePath: string,
): unknown {
  try {
    if (filename === "appwrite-utils.json") {
      return JSON.parse(raw);
    }
    return yaml.load(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `perFunctionAggregator: failed to parse '${filePath}': ${message}`,
    );
  }
}

/** Format zod issues as one-per-line indented bullet list. */
function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `  - ${path}: ${issue.message}`;
    })
    .join("\n");
}

/** Generic discovery walker, parameterized by resource type. */
async function discoverConfigs<TParsed extends { $id: string }>(
  projectRoot: string,
  resourceDirName: "functions" | "sites",
  schema: z.ZodType<TParsed>,
  fnLabel: string,
): Promise<
  Array<{
    id: string;
    sidecarPath: string;
    dir: string;
    parsed: TParsed;
  }>
> {
  const resourceDir = resolve(projectRoot, resourceDirName);

  let entries: Dirent[];
  try {
    entries = (await readdir(resourceDir, { withFileTypes: true })) as Dirent[];
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      // Missing top-level resource dir is a non-error empty result.
      return [];
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `${fnLabel}: failed to read '${resourceDir}': ${message}`,
    );
  }

  const results: Array<{
    id: string;
    sidecarPath: string;
    dir: string;
    parsed: TParsed;
  }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(resourceDir, entry.name);
    const found = await findSidecarInDir(dir);
    if (!found) continue;

    const raw = await readFile(found.sidecarPath, "utf8");
    const data = parseSidecarContent(found.filename, raw, found.sidecarPath);
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      throw new Error(
        `perFunctionAggregator: '${found.sidecarPath}' does not match ${schema === (PerFunctionConfigSchema as unknown as z.ZodType<TParsed>) ? "PerFunctionConfigSchema" : "PerSiteConfigSchema"}:\n${formatIssues(parsed.error)}`,
      );
    }
    results.push({
      id: parsed.data.$id,
      sidecarPath: found.sidecarPath,
      dir,
      parsed: parsed.data,
    });
  }

  results.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return results;
}

/**
 * Walk `<projectRoot>/functions/*` and parse every per-function YAML/JSON.
 * Throws on parse/validation failure of any file — partial success isn't safe
 * for aggregation.
 *
 * Returns sorted by $id (alphabetical) for deterministic output.
 */
export async function discoverPerFunctionConfigs(
  projectRoot: string,
): Promise<DiscoveredPerFunctionConfig[]> {
  return discoverConfigs<PerFunctionConfig>(
    projectRoot,
    "functions",
    PerFunctionConfigSchema as unknown as z.ZodType<PerFunctionConfig>,
    "discoverPerFunctionConfigs",
  );
}

/**
 * Find a single per-function YAML by $id. Returns undefined if no matching
 * file exists. Throws if a matching file exists but fails validation.
 */
export async function discoverPerFunctionConfig(
  projectRoot: string,
  id: string,
): Promise<DiscoveredPerFunctionConfig | undefined> {
  const all = await discoverPerFunctionConfigs(projectRoot);
  return all.find((c) => c.id === id);
}

/**
 * From an array of per-function configs, produce the canonical official
 * functions array suitable for writing to `appwrite/functions.json`. Strips
 * AppwriteUtils-only extension fields (anything not in FunctionSchema.shape).
 */
export function buildAggregatedFunctionsJson(
  configs: DiscoveredPerFunctionConfig[],
): OfficialFunction[] {
  const officialOnly = z.object(FunctionSchema.shape);
  return configs.map((c) => officialOnly.parse(c.parsed) as OfficialFunction);
}

/**
 * Walk `<projectRoot>/sites/*` and parse every per-site YAML/JSON. Throws on
 * parse/validation failure of any file. Returns sorted by $id.
 */
export async function discoverPerSiteConfigs(
  projectRoot: string,
): Promise<DiscoveredPerSiteConfig[]> {
  return discoverConfigs<PerSiteConfig>(
    projectRoot,
    "sites",
    PerSiteConfigSchema as unknown as z.ZodType<PerSiteConfig>,
    "discoverPerSiteConfigs",
  );
}

/**
 * Find a single per-site YAML by $id. Returns undefined if no matching file
 * exists. Throws if a matching file exists but fails validation.
 */
export async function discoverPerSiteConfig(
  projectRoot: string,
  id: string,
): Promise<DiscoveredPerSiteConfig | undefined> {
  const all = await discoverPerSiteConfigs(projectRoot);
  return all.find((c) => c.id === id);
}

/**
 * From an array of per-site configs, produce the canonical official sites
 * array suitable for writing to `appwrite/sites.json`. Strips
 * AppwriteUtils-only extension fields (anything not in SiteSchema.shape).
 */
export function buildAggregatedSitesJson(
  configs: DiscoveredPerSiteConfig[],
): OfficialSite[] {
  const officialOnly = z.object(SiteSchema.shape);
  return configs.map((c) => officialOnly.parse(c.parsed) as OfficialSite);
}
