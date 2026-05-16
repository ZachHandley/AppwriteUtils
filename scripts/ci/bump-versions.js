import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const root = process.cwd();
const bumpType = (process.env.BUMP_TYPE || "minor").toLowerCase();
const PLACEHOLDER = "0.0.0-awu-dev";

if (bumpType !== "minor" && bumpType !== "major") {
  console.error(`Invalid BUMP_TYPE: ${bumpType}. Must be "minor" or "major".`);
  process.exit(1);
}

const packages = [
  { dir: "packages/appwrite-utils", name: "appwrite-utils" },
  { dir: "packages/appwrite-utils-helpers", name: "appwrite-utils-helpers" },
  { dir: "packages/appwrite-utils-cli", name: "appwrite-utils-cli" },
  { dir: "packages/appwrite-utils-mcp", name: "appwrite-utils-mcp" },
];

// Direct registry fetch bypasses npm CLI's local cache, which has bitten us
// when two `[release]` runs land within the same cache window. The `/latest`
// endpoint serves the dist-tag (atomically updated on publish, no staleness
// like `npm view` exhibits).
async function getRemoteLatest(pkgName) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkgName}/latest`, {
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      if (typeof data?.version === "string") return data.version;
    }
  } catch {
    // fall through to npm-view fallback
  }
  try {
    return execSync(`npm view ${pkgName} version --prefer-online`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "0.0.0";
  }
}

// Returns the full set of published versions for the package, used to confirm
// the proposed bump target isn't already taken (race with concurrent runs, or
// pathological CDN behaviour the /latest endpoint somehow missed).
async function getPublishedVersions(pkgName) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkgName}`, {
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      const versions = data?.versions;
      if (versions && typeof versions === "object") {
        return new Set(Object.keys(versions));
      }
    }
  } catch {
    // fall through
  }
  return new Set();
}

function bumpVersion(version, type) {
  const parts = version.split(".").map((n) => Number(n) || 0);
  const [major, minor, patch] = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  if (type === "major") {
    return `${major + 1}.0.0`;
  }
  return `${major}.${minor + 1}.0`;
}

function bumpPatch(version) {
  const parts = version.split(".").map((n) => Number(n) || 0);
  const [major, minor, patch] = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  return `${major}.${minor}.${patch + 1}`;
}

// Compute next free version: start from `bumpVersion(remote)`, then keep
// patch-bumping while the proposed version is already published. Bounded so
// we never loop forever on a misbehaving registry.
function findFreeVersion(remoteVersion, type, taken) {
  let candidate = bumpVersion(remoteVersion, type);
  let safety = 0;
  while (taken.has(candidate) && safety < 100) {
    candidate = bumpPatch(candidate);
    safety++;
  }
  if (safety > 0) {
    console.log(
      `  ! ${candidate} (skipped ${safety} already-published version(s))`,
    );
  }
  return candidate;
}

for (const pkg of packages) {
  const filePath = path.join(root, pkg.dir, "package.json");
  const remoteVersion = await getRemoteLatest(pkg.name);
  const taken = await getPublishedVersions(pkg.name);
  const newVersion = findFreeVersion(remoteVersion, bumpType, taken);

  let content = fs.readFileSync(filePath, "utf8");
  content = content.replace(PLACEHOLDER, newVersion);
  fs.writeFileSync(filePath, content);

  console.log(`${pkg.name}: ${remoteVersion} (npm) -> ${newVersion}`);
}
