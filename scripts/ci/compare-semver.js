function splitVersion(version) {
  const [main, pre = ""] = String(version).trim().split("-", 2);
  const mainParts = main.split(".").map((part) => {
    const num = Number.parseInt(part, 10);
    return Number.isNaN(num) ? 0 : num;
  });
  const preParts = pre ? pre.split(".") : [];
  return { mainParts, preParts, hasPre: preParts.length > 0 };
}

function compareParts(aParts, bParts) {
  const maxLen = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < maxLen; i += 1) {
    const a = aParts[i] ?? 0;
    const b = bParts[i] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

function comparePre(aPre, bPre) {
  const maxLen = Math.max(aPre.length, bPre.length);
  for (let i = 0; i < maxLen; i += 1) {
    const a = aPre[i];
    const b = bPre[i];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    const aNum = Number.parseInt(a, 10);
    const bNum = Number.parseInt(b, 10);
    const aIsNum = !Number.isNaN(aNum) && String(aNum) === a;
    const bIsNum = !Number.isNaN(bNum) && String(bNum) === b;
    if (aIsNum && bIsNum) {
      if (aNum > bNum) return 1;
      if (aNum < bNum) return -1;
      continue;
    }
    if (aIsNum && !bIsNum) return -1;
    if (!aIsNum && bIsNum) return 1;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

function compareSemver(a, b) {
  const aParts = splitVersion(a);
  const bParts = splitVersion(b);
  const mainCompare = compareParts(aParts.mainParts, bParts.mainParts);
  if (mainCompare !== 0) return mainCompare;
  if (aParts.hasPre && !bParts.hasPre) return -1;
  if (!aParts.hasPre && bParts.hasPre) return 1;
  if (!aParts.hasPre && !bParts.hasPre) return 0;
  return comparePre(aParts.preParts, bParts.preParts);
}

const localVersion = process.argv[2];
const remoteVersion = process.argv[3];

if (!localVersion || !remoteVersion) {
  console.error("Usage: compare-semver.js <localVersion> <remoteVersion>");
  process.exit(2);
}

const result = compareSemver(localVersion, remoteVersion);
process.stdout.write(String(result));
