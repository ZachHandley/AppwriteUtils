import fs from "fs";
import path from "path";

const root = process.cwd();
const bumpType = (process.env.BUMP_TYPE || "minor").toLowerCase();

if (bumpType !== "minor" && bumpType !== "major") {
  console.error(`Invalid BUMP_TYPE: ${bumpType}. Must be "minor" or "major".`);
  process.exit(1);
}

const packages = [
  "packages/appwrite-utils/package.json",
  "packages/appwrite-utils-helpers/package.json",
  "packages/appwrite-utils-cli/package.json",
  "packages/appwrite-utils-mcp/package.json",
];

for (const rel of packages) {
  const filePath = path.join(root, rel);
  const pkg = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const [major, minor, patch] = pkg.version.split(".").map(Number);

  const oldVersion = pkg.version;
  if (bumpType === "major") {
    pkg.version = `${major + 1}.0.0`;
  } else {
    pkg.version = `${major}.${minor + 1}.0`;
  }

  fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`${pkg.name}: ${oldVersion} -> ${pkg.version}`);
}
