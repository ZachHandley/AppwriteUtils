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

function getRemoteVersion(pkgName) {
  try {
    return execSync(`npm view ${pkgName} version`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "0.0.0";
  }
}

function bumpVersion(version, type) {
  const [major, minor] = version.split(".").map(Number);
  if (type === "major") {
    return `${major + 1}.0.0`;
  }
  return `${major}.${minor + 1}.0`;
}

for (const pkg of packages) {
  const filePath = path.join(root, pkg.dir, "package.json");
  const remoteVersion = getRemoteVersion(pkg.name);
  const newVersion = bumpVersion(remoteVersion, bumpType);

  let content = fs.readFileSync(filePath, "utf8");
  content = content.replace(PLACEHOLDER, newVersion);
  fs.writeFileSync(filePath, content);

  console.log(`${pkg.name}: ${remoteVersion} (npm) -> ${newVersion}`);
}
