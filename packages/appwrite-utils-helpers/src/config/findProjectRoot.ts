import { basename, dirname, isAbsolute, resolve as resolvePath } from "node:path";
import { findUp } from "find-up";

export type ProjectRootAnchor = "sidecar" | "official-config" | "git";

export interface ProjectRootResult {
  /** Absolute path of the project root directory. */
  root: string;
  /** Which file/directory matched (in priority order). */
  anchor: ProjectRootAnchor;
  /** Absolute path of the matching anchor file or directory. */
  anchorPath: string;
}

const SIDECAR_NAMES = [
  "appwrite-utils.config.yaml",
  "appwrite-utils.config.yml",
  "appwrite-utils.config.json",
  ".appwrite-utils.yaml",
] as const;

const OFFICIAL_CONFIG_NAME = "appwrite.config.json";

export async function findProjectRoot(
  startDir?: string
): Promise<ProjectRootResult> {
  const cwd = isAbsolute(startDir ?? "")
    ? (startDir as string)
    : resolvePath(startDir ?? process.cwd());

  // First pass: sidecar names take priority over the official config; with
  // a combined list, find-up walks each level checking all names in array
  // order before moving up, so basename() tells us which kind matched.
  const configMatch = await findUp(
    [...SIDECAR_NAMES, OFFICIAL_CONFIG_NAME],
    { cwd }
  );

  if (configMatch) {
    const anchor: ProjectRootAnchor =
      basename(configMatch) === OFFICIAL_CONFIG_NAME
        ? "official-config"
        : "sidecar";
    return {
      root: dirname(configMatch),
      anchor,
      anchorPath: configMatch,
    };
  }

  // Second pass: .git can be a directory (normal repo) or a regular file
  // (submodule / worktree). Closest ancestor wins; if both match at the
  // same level, directory wins.
  const [gitDir, gitFile] = await Promise.all([
    findUp(".git", { cwd, type: "directory" }),
    findUp(".git", { cwd, type: "file" }),
  ]);

  let gitMatch: string | undefined;
  if (gitDir && gitFile) {
    gitMatch = gitFile.length < gitDir.length ? gitFile : gitDir;
  } else {
    gitMatch = gitDir ?? gitFile;
  }

  if (gitMatch) {
    return {
      root: dirname(gitMatch),
      anchor: "git",
      anchorPath: gitMatch,
    };
  }

  throw new Error(
    `findProjectRoot: could not locate project root from '${cwd}' — no sidecar, no appwrite.config.json, no .git ancestor`
  );
}
