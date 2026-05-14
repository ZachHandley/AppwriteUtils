import { readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve as resolvePath } from "node:path";
import inquirer from "inquirer";
import chalk from "chalk";
import {
  MessageFormatter,
  findProjectRoot,
  loadExtensionConfig,
  resolveEndpoint,
  runAppwriteCli,
  type AppwriteCliCredentials,
} from "appwrite-utils-helpers";

export interface SelectivePullFlowOptions {
  projectRoot?: string;
  /** Explicit sidecar path from --config <path>. */
  configPath?: string;
  /** Credentials surfaced from argv. */
  credentials?: AppwriteCliCredentials;
}

type Category = "settings" | "functions" | "tables" | "buckets" | "teams";

interface ApiBucket {
  $id: string;
  name: string;
  [key: string]: unknown;
}

interface ApiTeam {
  $id: string;
  name: string;
  [key: string]: unknown;
}

interface NameGroup<T> {
  template: string;
  members: T[];
  sampleIds: string[];
}

/**
 * Replace ID-like tokens in a name with a literal `*` so similarly-named
 * auto-provisioned resources (`User 69ef91b1c4ea1840d79d Files`,
 * `Conversation 69ebe486001b8a7584c0`) collapse to one template. Detection
 * targets:
 *   - 16+ hex chars (covers Appwrite's 20-char $id snake hex)
 *   - 20-26 base32-ish chars (ULID-style)
 */
export function normalizeNameTemplate(name: string): string {
  return name
    .replace(/\b[a-f0-9]{16,}\b/gi, "*")
    .replace(/\b[0-9A-HJKMNP-TV-Z]{20,26}\b/gi, "*")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Group items by their name template. Groups with ≥ `threshold` members
 * collapse into a single representative row; smaller groups expand to
 * individual rows.
 */
export function groupByTemplate<T>(
  items: T[],
  getName: (item: T) => string,
  getId: (item: T) => string,
  threshold = 3
): { groups: NameGroup<T>[]; singletons: T[] } {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const template = normalizeNameTemplate(getName(item));
    const list = buckets.get(template) ?? [];
    list.push(item);
    buckets.set(template, list);
  }

  const groups: NameGroup<T>[] = [];
  const singletons: T[] = [];
  for (const [template, members] of buckets) {
    if (members.length >= threshold) {
      groups.push({
        template,
        members,
        sampleIds: members.slice(0, 2).map(getId),
      });
    } else {
      singletons.push(...members);
    }
  }

  groups.sort((a, b) => a.template.localeCompare(b.template));
  singletons.sort((a, b) => getName(a).localeCompare(getName(b)));
  return { groups, singletons };
}

interface OfficialConfigShape {
  projectId?: string;
  endpoint?: string;
  includes?: Record<string, string>;
  buckets?: ApiBucket[];
  teams?: ApiTeam[];
  [key: string]: unknown;
}

async function readOfficialConfig(projectRoot: string): Promise<{
  config: OfficialConfigShape;
  configPath: string;
} | undefined> {
  const configPath = join(projectRoot, "appwrite.config.json");
  try {
    const raw = await readFile(configPath, "utf8");
    return { config: JSON.parse(raw) as OfficialConfigShape, configPath };
  } catch {
    return undefined;
  }
}

/**
 * Replace `config[arrayKey]` with `value` on disk, honoring the official
 * CLI's `includes` map. When the key has an entry in `includes`, write the
 * array to that file (creating dirs as needed) and leave `appwrite.config.json`
 * unchanged. Otherwise inline the array on appwrite.config.json.
 */
async function writeResourceArray(
  projectRoot: string,
  arrayKey: "buckets" | "teams",
  value: unknown[]
): Promise<string> {
  const loaded = await readOfficialConfig(projectRoot);
  if (!loaded) {
    throw new Error(
      `Cannot write ${arrayKey}: appwrite.config.json not found at ${projectRoot}`
    );
  }
  const { config, configPath } = loaded;
  const includes = config.includes ?? {};
  const includeRel = includes[arrayKey];

  if (typeof includeRel === "string" && includeRel.length > 0) {
    const includeAbs = isAbsolute(includeRel)
      ? includeRel
      : resolvePath(projectRoot, includeRel);
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dirname(includeAbs), { recursive: true });
    await writeFile(includeAbs, JSON.stringify(value, null, 4), "utf8");
    return includeAbs;
  }

  // Inline: edit appwrite.config.json directly. Preserve top-level key order
  // by reading + spreading.
  const next: Record<string, unknown> = { ...config, [arrayKey]: value };
  await writeFile(configPath, JSON.stringify(next, null, 4), "utf8");
  return configPath;
}

async function listResourceJson<T>(
  cwd: string,
  args: string[],
  topKey: string
): Promise<T[]> {
  try {
    const result = await runAppwriteCli<{ [k: string]: unknown }>(args, {
      cwd,
      json: true,
      force: false,
      stream: false,
    });
    const data = result.data ?? {};
    const list = (data as Record<string, unknown>)[topKey];
    return Array.isArray(list) ? (list as T[]) : [];
  } catch (err) {
    MessageFormatter.warning(
      `Failed to list ${topKey} (${args.join(" ")}): ${
        err instanceof Error ? err.message : String(err)
      }`,
      { prefix: "Pull" }
    );
    return [];
  }
}

/**
 * Filter + group + multi-select UI for buckets or teams. Returns the
 * subset of items the user wants to write to appwrite.config.json.
 */
async function selectFilteredItems<T>(
  label: string,
  items: T[],
  getName: (item: T) => string,
  getId: (item: T) => string
): Promise<T[]> {
  if (items.length === 0) {
    MessageFormatter.info(`No ${label} found in remote project.`, { prefix: "Pull" });
    return [];
  }

  const { filter } = await inquirer.prompt<{ filter: string }>([
    {
      type: "input",
      name: "filter",
      message: chalk.blue(
        `Filter ${label} by name substring (or press Enter for all):`
      ),
      default: "",
    },
  ]);

  const needle = filter.trim().toLowerCase();
  const filtered = needle
    ? items.filter((item) => {
        const name = getName(item).toLowerCase();
        const id = getId(item).toLowerCase();
        const template = normalizeNameTemplate(getName(item)).toLowerCase();
        return (
          name.includes(needle) ||
          id.includes(needle) ||
          template.includes(needle)
        );
      })
    : items;

  if (filtered.length === 0) {
    MessageFormatter.info(`No ${label} match filter '${filter}'.`, { prefix: "Pull" });
    return [];
  }

  const { groups, singletons } = groupByTemplate(filtered, getName, getId, 3);

  type Choice = {
    name: string;
    value: { kind: "singleton"; item: T } | { kind: "group"; group: NameGroup<T> };
    checked?: boolean;
  };

  const choices: Array<Choice | InstanceType<typeof inquirer.Separator>> = [];
  for (const item of singletons) {
    choices.push({
      name: getName(item),
      value: { kind: "singleton", item },
      checked: true,
    });
  }
  if (groups.length > 0) {
    choices.push(
      new inquirer.Separator(
        chalk.gray("── grouped (toggle includes all members) ──")
      )
    );
    for (const group of groups) {
      const preview = group.sampleIds
        .map((id) => id.slice(0, 8) + "…")
        .join(", ");
      choices.push({
        name: `${group.template}  ${chalk.gray(
          `(${group.members.length} matching: ${preview}…)`
        )}`,
        value: { kind: "group", group },
        checked: false,
      });
    }
  }

  const { picked } = await inquirer.prompt<{
    picked: Array<Choice["value"]>;
  }>([
    {
      type: "checkbox",
      name: "picked",
      message: chalk.blue(`Select ${label} to pull:`),
      choices,
      pageSize: 15,
      loop: false,
    },
  ]);

  const result: T[] = [];
  const selectedGroups: NameGroup<T>[] = [];
  for (const choice of picked) {
    if (choice.kind === "singleton") {
      result.push(choice.item);
    } else {
      selectedGroups.push(choice.group);
    }
  }

  // For each selected group, optionally drill in to pick individuals.
  for (const group of selectedGroups) {
    const { expand } = await inquirer.prompt<{ expand: boolean }>([
      {
        type: "confirm",
        name: "expand",
        message: chalk.yellow(
          `Expand '${group.template}' (${group.members.length} members) to pick individually?`
        ),
        default: false,
      },
    ]);
    if (!expand) {
      result.push(...group.members);
      continue;
    }
    const { sub } = await inquirer.prompt<{ sub: T[] }>([
      {
        type: "checkbox",
        name: "sub",
        message: chalk.blue(`Pick ${group.template} members to include:`),
        choices: group.members.map((m) => ({
          name: `${getName(m)}  ${chalk.gray(`(${getId(m)})`)}`,
          value: m,
          checked: true,
        })),
        pageSize: 15,
        loop: false,
      },
    ]);
    result.push(...sub);
  }

  return result;
}

export async function runSelectivePullFlow(
  opts: SelectivePullFlowOptions = {}
): Promise<void> {
  // 1. Resolve project root.
  let projectRoot: string;
  if (opts.projectRoot) {
    projectRoot = opts.projectRoot;
  } else if (opts.configPath) {
    const abs = isAbsolute(opts.configPath)
      ? opts.configPath
      : resolvePath(process.cwd(), opts.configPath);
    projectRoot = dirname(abs);
  } else {
    try {
      const r = await findProjectRoot();
      projectRoot = r.root;
    } catch {
      projectRoot = process.cwd();
    }
  }

  const loaded = await readOfficialConfig(projectRoot);
  if (!loaded) {
    MessageFormatter.error(
      `appwrite.config.json not found at ${projectRoot}. Run --link first to bootstrap the link.`,
      undefined,
      { prefix: "Pull" }
    );
    return;
  }

  MessageFormatter.banner("Selective Pull", `Project root: ${projectRoot}`);

  // 2. Ensure endpoint is pre-configured for subsequent appwrite CLI calls.
  let sidecarAuth:
    | { endpoint?: string; projectId?: string; apiKey?: string; sessionCookie?: string }
    | undefined;
  try {
    const ext = await loadExtensionConfig({ cwd: projectRoot, resolveOfficial: false });
    sidecarAuth = (ext.ext as { auth?: typeof ext.ext.auth }).auth;
  } catch {
    sidecarAuth = undefined;
  }
  const resolvedCreds = resolveEndpoint({
    argv: opts.credentials,
    sidecarAuth,
  });
  if (resolvedCreds) {
    MessageFormatter.info(
      `Configuring appwrite client → ${resolvedCreds.endpoint}`,
      { prefix: "Pull" }
    );
  }
  const cliBaseOpts = {
    cwd: projectRoot,
    credentials: resolvedCreds ?? opts.credentials,
  } as const;

  // 3. Probe remote counts in parallel so the category prompt is informative.
  MessageFormatter.info("Counting remote resources...", { prefix: "Pull" });
  const [databasesList, functionsList, bucketsAll, teamsAll] = await Promise.all([
    listResourceJson<{ $id: string; name: string }>(
      projectRoot,
      ["databases", "list"],
      "databases"
    ),
    listResourceJson<{ $id: string; name: string }>(
      projectRoot,
      ["functions", "list"],
      "functions"
    ),
    listResourceJson<ApiBucket>(
      projectRoot,
      ["storage", "list-buckets"],
      "buckets"
    ),
    listResourceJson<ApiTeam>(projectRoot, ["teams", "list"], "teams"),
  ]);

  const counts = {
    databases: databasesList.length,
    functions: functionsList.length,
    buckets: bucketsAll.length,
    teams: teamsAll.length,
  };

  // 4. Categories prompt.
  const categoryChoices: Array<
    { name: string; value: Category; checked?: boolean }
    | InstanceType<typeof inquirer.Separator>
  > = [
    {
      name: "Settings (project name, services, auth)",
      value: "settings",
      checked: true,
    },
    {
      name: `Functions  ${chalk.gray(`(${counts.functions} found)`)}`,
      value: "functions",
      checked: counts.functions > 0,
    },
    {
      name: `Databases + Tables  ${chalk.gray(`(${counts.databases} databases)`)}`,
      value: "tables",
      checked: counts.databases > 0,
    },
    {
      name: `Buckets  ${chalk.gray(`(${counts.buckets} found — you'll filter next)`)}`,
      value: "buckets",
      checked: counts.buckets > 0,
    },
    new inquirer.Separator(
      chalk.gray("── pull these only if you really need to ──")
    ),
    {
      name: `Teams  ${chalk.gray(`(${counts.teams} found — usually skip)`)}`,
      value: "teams",
      checked: false,
    },
  ];

  const { categories } = await inquirer.prompt<{ categories: Category[] }>([
    {
      type: "checkbox",
      name: "categories",
      message: chalk.yellow(
        "What should we pull from this project? (Space to toggle, Enter to confirm)"
      ),
      choices: categoryChoices,
      pageSize: 10,
      loop: false,
    },
  ]);

  if (categories.length === 0) {
    MessageFormatter.info("Nothing selected — exiting.", { prefix: "Pull" });
    return;
  }

  // 5. Upfront function source code question.
  let pullFunctionSource = false;
  if (categories.includes("functions") && counts.functions > 0) {
    const { srcAns } = await inquirer.prompt<{ srcAns: boolean }>([
      {
        type: "confirm",
        name: "srcAns",
        message: chalk.blue(
          "Pull function source code too? (Most projects keep functions as git submodules; default No)"
        ),
        default: false,
      },
    ]);
    pullFunctionSource = srcAns;
  }

  // 6. Filtered selection UIs for buckets / teams.
  let selectedBuckets: ApiBucket[] = [];
  let selectedTeams: ApiTeam[] = [];

  if (categories.includes("buckets")) {
    selectedBuckets = await selectFilteredItems<ApiBucket>(
      "buckets",
      bucketsAll,
      (b) => b.name,
      (b) => b.$id
    );
  }
  if (categories.includes("teams")) {
    selectedTeams = await selectFilteredItems<ApiTeam>(
      "teams",
      teamsAll,
      (t) => t.name,
      (t) => t.$id
    );
  }

  // 7. Summary + confirm.
  const summaryLines: string[] = [];
  if (categories.includes("settings")) summaryLines.push("  • Settings");
  if (categories.includes("functions"))
    summaryLines.push(
      `  • Functions: ${counts.functions} ${
        pullFunctionSource ? "(with source)" : "(metadata only)"
      }`
    );
  if (categories.includes("tables"))
    summaryLines.push(
      `  • Tables across ${counts.databases} database(s)`
    );
  if (categories.includes("buckets"))
    summaryLines.push(`  • Buckets: ${selectedBuckets.length} selected`);
  if (categories.includes("teams"))
    summaryLines.push(`  • Teams: ${selectedTeams.length} selected`);

  MessageFormatter.info("Pull plan:\n" + summaryLines.join("\n"), { prefix: "Pull" });

  const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
    {
      type: "confirm",
      name: "confirmed",
      message: chalk.green("Proceed with this pull?"),
      default: true,
    },
  ]);
  if (!confirmed) {
    MessageFormatter.info("Cancelled.", { prefix: "Pull" });
    return;
  }

  // 8. Execute.
  if (categories.includes("settings")) {
    MessageFormatter.info("Pulling settings...", { prefix: "Pull" });
    await runAppwriteCli(["pull", "settings"], {
      ...cliBaseOpts,
      stream: true,
      force: true,
    });
  }
  if (categories.includes("functions") && counts.functions > 0) {
    MessageFormatter.info(
      pullFunctionSource
        ? "Pulling functions (with source)..."
        : "Pulling functions metadata (--no-code)...",
      { prefix: "Pull" }
    );
    const fnArgs = pullFunctionSource
      ? ["pull", "functions"]
      : ["pull", "functions", "--no-code"];
    await runAppwriteCli(fnArgs, { ...cliBaseOpts, stream: true, force: true });
  }
  if (categories.includes("tables")) {
    MessageFormatter.info("Pulling tables...", { prefix: "Pull" });
    await runAppwriteCli(["pull", "tables"], {
      ...cliBaseOpts,
      stream: true,
      force: true,
    });
  }
  if (categories.includes("buckets")) {
    const target = await writeResourceArray(projectRoot, "buckets", selectedBuckets);
    MessageFormatter.success(
      `Wrote ${selectedBuckets.length} bucket(s) to ${target}`,
      { prefix: "Pull" }
    );
  }
  if (categories.includes("teams")) {
    const target = await writeResourceArray(projectRoot, "teams", selectedTeams);
    MessageFormatter.success(
      `Wrote ${selectedTeams.length} team(s) to ${target}`,
      { prefix: "Pull" }
    );
  }

  MessageFormatter.success("Selective pull complete.", { prefix: "Pull" });
}
