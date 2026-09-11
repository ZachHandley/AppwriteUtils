/**
 * Generate Zod v4 schemas from Appwrite's published OpenAPI specs.
 *
 * Reads three OpenAPI spec JSON files (client/server/console) from the
 * appwrite/appwrite repo, unions their `components.schemas`, rewrites
 * OpenAPI-style `$ref`s and `nullable: true` to JSON Schema 2020-12 forms,
 * then uses Zod v4's `z.fromJSONSchema` and `z.toJSONSchema` to emit one
 * self-contained Zod schema per Appwrite resource model under
 * `src/schemas/generated/`.
 *
 * Env:
 *   APPWRITE_SPEC_TAG     Git ref to pull from (default "main").
 *   APPWRITE_SPEC_REFRESH If set, bypass cache and re-fetch + re-emit.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const APPWRITE_SPEC_REF = process.env.APPWRITE_SPEC_TAG ?? "main";
const FORCE_REFRESH = process.env.APPWRITE_SPEC_REFRESH != null && process.env.APPWRITE_SPEC_REFRESH !== "";

const SPEC_FILES = [
  "open-api3-latest-client.json",
  "open-api3-latest-server.json",
  "open-api3-latest-console.json",
] as const;

const __filename = fileURLToPath(import.meta.url);
const PACKAGE_ROOT = resolve(dirname(__filename), "..");
const CACHE_DIR = join(PACKAGE_ROOT, ".cache", "openapi");
const OUTPUT_DIR = join(PACKAGE_ROOT, "src", "schemas", "generated");
const HASH_FILE = join(CACHE_DIR, "last-hash.json");

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

interface OpenApiDoc {
  components?: {
    schemas?: Record<string, JsonValue>;
  };
}

function isPlainObject(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fetchSpec(filename: string): Promise<{ raw: string; doc: OpenApiDoc } | null> {
  const cachePath = join(CACHE_DIR, filename);
  if (!FORCE_REFRESH && existsSync(cachePath)) {
    const raw = await readFile(cachePath, "utf8");
    try {
      return { raw, doc: JSON.parse(raw) as OpenApiDoc };
    } catch {
      // fall through to refetch
    }
  }
  const url = `https://raw.githubusercontent.com/appwrite/appwrite/${APPWRITE_SPEC_REF}/app/config/specs/${filename}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[generate-zod] WARN: ${filename} fetch failed (HTTP ${response.status}) — skipping.`);
      return null;
    }
    const raw = await response.text();
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cachePath, raw, "utf8");
    return { raw, doc: JSON.parse(raw) as OpenApiDoc };
  } catch (err) {
    console.warn(`[generate-zod] WARN: ${filename} fetch threw (${(err as Error).message}) — skipping.`);
    return null;
  }
}

/**
 * Rewrite a JSON Schema-ish node so that Zod v4's fromJSONSchema can read it:
 *  - `$ref`s of form `#/components/schemas/<name>` become `#/$defs/<PascalName>`.
 *  - OpenAPI 3.0 `nullable: true` is promoted to `type: [..., "null"]`,
 *    or wrapped in an `anyOf` when no concrete `type` is present.
 *  - Stray vendor extensions (`x-*`) are preserved as-is (Zod ignores them).
 */
function rewriteSchemaNode(node: JsonValue, refRename: Record<string, string>): JsonValue {
  if (Array.isArray(node)) {
    return node.map((item) => rewriteSchemaNode(item, refRename));
  }
  if (!isPlainObject(node)) {
    return node;
  }
  const out: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "$ref" && typeof value === "string" && refRename[value] !== undefined) {
      out.$ref = refRename[value]!;
      continue;
    }
    out[key] = rewriteSchemaNode(value, refRename);
  }

  if (out.nullable === true) {
    delete out.nullable;
    const t = out.type;
    if (typeof t === "string" && t !== "null") {
      out.type = [t, "null"];
    } else if (Array.isArray(t)) {
      if (!t.includes("null")) {
        out.type = [...t, "null"];
      }
    } else {
      // No concrete type — wrap whatever else is there in anyOf with null.
      const { description, title, ...rest } = out;
      const inner: Record<string, JsonValue> = { ...rest };
      const wrapped: Record<string, JsonValue> = {
        anyOf: [inner, { type: "null" }],
      };
      if (typeof description === "string") wrapped.description = description;
      if (typeof title === "string") wrapped.title = title;
      return wrapped;
    }
  }

  return out;
}

function toPascalCase(name: string): string {
  if (name.length === 0) return name;
  // Names from Appwrite OpenAPI are usually camelCase (e.g. "attributeString").
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function isValidIdentifier(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

/**
 * Some PascalCase names collide with reserved filenames in our output dir.
 * `Index` collides with the barrel `index.ts` on case-insensitive file systems
 * and even on Linux trips TypeScript's `forceConsistentCasingInFileNames`.
 */
function toFileBaseName(pascalName: string): string {
  if (pascalName.toLowerCase() === "index") return `${pascalName}_`;
  return pascalName;
}

function stableStringify(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k] as JsonValue)}`).join(",")}}`;
}

function hashJson(value: JsonValue): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

interface CollectedSchemas {
  /** Original camelCase name -> rewritten JSON Schema fragment (with $refs rewritten). */
  byOriginal: Record<string, JsonValue>;
  /** PascalCase name -> original name (for collision detection). */
  pascalToOriginal: Record<string, string>;
  /** Map of `#/components/schemas/<name>` -> `#/$defs/<PascalName>`. */
  refRename: Record<string, string>;
  /** Per-spec input raw hashes, for cache validation. */
  inputHash: string;
  /** Specs that were actually used. */
  loadedSpecs: string[];
}

async function collectSchemas(): Promise<CollectedSchemas> {
  const loadedSpecs: string[] = [];
  const raws: Record<string, string> = {};
  const merged: Record<string, JsonValue> = {};
  // We need refRename before rewriting, but it requires knowing every model
  // name first. So collect raw schemas first, then build refRename, then
  // rewrite.
  for (const filename of SPEC_FILES) {
    const result = await fetchSpec(filename);
    if (!result) continue;
    raws[filename] = result.raw;
    loadedSpecs.push(filename);
    const schemas = result.doc.components?.schemas;
    if (!schemas) {
      console.warn(`[generate-zod] WARN: ${filename} has no components.schemas — skipping.`);
      continue;
    }
    // Last-write-wins union across specs (server/client/console overlap).
    for (const [name, schema] of Object.entries(schemas)) {
      merged[name] = schema as JsonValue;
    }
  }

  if (loadedSpecs.length === 0) {
    throw new Error("All Appwrite OpenAPI specs failed to load — cannot continue.");
  }

  const pascalToOriginal: Record<string, string> = {};
  const refRename: Record<string, string> = {};
  for (const name of Object.keys(merged)) {
    const pascal = toPascalCase(name);
    if (pascalToOriginal[pascal] !== undefined && pascalToOriginal[pascal] !== name) {
      // Two camelCase names collapse to the same PascalCase (e.g. `User` and `user`).
      // Keep the first one to remain deterministic and warn.
      console.warn(
        `[generate-zod] WARN: PascalCase collision for ${pascal} ` +
          `(already from "${pascalToOriginal[pascal]}", ignoring "${name}").`,
      );
      continue;
    }
    pascalToOriginal[pascal] = name;
    refRename[`#/components/schemas/${name}`] = `#/$defs/${pascal}`;
  }

  const byOriginal: Record<string, JsonValue> = {};
  for (const [name, schema] of Object.entries(merged)) {
    const pascal = toPascalCase(name);
    if (pascalToOriginal[pascal] !== name) continue; // skipped due to collision
    byOriginal[name] = rewriteSchemaNode(schema, refRename);
  }

  // Stable input hash across all loaded raws + spec ref.
  const hashInput: JsonValue = {
    ref: APPWRITE_SPEC_REF,
    specs: Object.fromEntries(
      Object.entries(raws).map(([k, v]) => [k, createHash("sha256").update(v).digest("hex")]),
    ),
  };
  const inputHash = hashJson(hashInput);

  return { byOriginal, pascalToOriginal, refRename, inputHash, loadedSpecs };
}

async function readLastHash(): Promise<string | null> {
  if (!existsSync(HASH_FILE)) return null;
  try {
    const raw = await readFile(HASH_FILE, "utf8");
    const parsed = JSON.parse(raw) as { inputHash?: string };
    return parsed.inputHash ?? null;
  } catch {
    return null;
  }
}

async function writeLastHash(inputHash: string, loadedSpecs: string[], schemaCount: number): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const payload = {
    inputHash,
    appwriteSpecRef: APPWRITE_SPEC_REF,
    loadedSpecs,
    schemaCount,
    generatedAt: new Date().toISOString(),
  };
  await writeFile(HASH_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function emitSchemaFile(pascalName: string, jsonSchema: JsonValue): string {
  const body = JSON.stringify(jsonSchema, null, 2);
  return [
    `// AUTO-GENERATED from Appwrite OpenAPI spec at ${APPWRITE_SPEC_REF}. DO NOT EDIT.`,
    `// Source: https://github.com/appwrite/appwrite/tree/${APPWRITE_SPEC_REF}/app/config/specs`,
    `import { z } from "zod";`,
    "",
    `const ${pascalName}JsonSchema = ${body} as const;`,
    "",
    `export const ${pascalName}Schema = z.fromJSONSchema(${pascalName}JsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);`,
    `export type ${pascalName} = z.infer<typeof ${pascalName}Schema>;`,
    "",
  ].join("\n");
}

function emitIndexFile(pascalNames: string[]): string {
  const sorted = [...pascalNames].sort();
  const lines = [
    `// AUTO-GENERATED. DO NOT EDIT.`,
    `// Source: https://github.com/appwrite/appwrite/tree/${APPWRITE_SPEC_REF}/app/config/specs`,
    "",
  ];
  for (const name of sorted) {
    lines.push(`export { ${name}Schema, type ${name} } from "./${toFileBaseName(name)}.js";`);
  }
  lines.push("");
  return lines.join("\n");
}

async function clearOutputDir(): Promise<void> {
  if (!existsSync(OUTPUT_DIR)) return;
  const entries = await readdir(OUTPUT_DIR);
  await Promise.all(
    entries.map((entry) => rm(join(OUTPUT_DIR, entry), { recursive: true, force: true })),
  );
}

async function main(): Promise<void> {
  const outputExists = existsSync(OUTPUT_DIR);
  const indexExists = existsSync(join(OUTPUT_DIR, "index.ts"));

  let collected: CollectedSchemas;
  try {
    collected = await collectSchemas();
  } catch (err) {
    // The generated schemas are committed, so an unreachable spec source (appwrite/appwrite
    // stopped tracking app/config/specs in git) must not block a build that only needs them.
    // Only a forced refresh, or a checkout with no committed output, still has to fail.
    if (!FORCE_REFRESH && outputExists && indexExists) {
      console.warn(`[generate-zod] WARN: ${(err as Error).message} Using the committed schemas in ${OUTPUT_DIR}.`);
      process.exit(0);
    }
    throw err;
  }
  const previousHash = await readLastHash();

  if (!FORCE_REFRESH && previousHash === collected.inputHash && outputExists && indexExists) {
    // No work needed.
    process.exit(0);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  await clearOutputDir();

  let emitted = 0;
  const emittedNames: string[] = [];
  let fallbackCount = 0;

  // The rewriter turned every `#/components/schemas/<name>` into `#/$defs/<Pascal>`,
  // so we need `$defs` keyed by PascalCase for refs to resolve.
  const defsByPascal: Record<string, JsonValue> = {};
  for (const [originalName, schema] of Object.entries(collected.byOriginal)) {
    defsByPascal[toPascalCase(originalName)] = schema;
  }

  for (const [originalName, rewritten] of Object.entries(collected.byOriginal)) {
    const pascalName = toPascalCase(originalName);
    if (!isValidIdentifier(pascalName)) {
      console.warn(`[generate-zod] WARN: skipping schema "${originalName}" — invalid TS identifier "${pascalName}".`);
      continue;
    }

    // Inline all defs so each emitted file is self-contained.
    const input = isPlainObject(rewritten)
      ? { ...rewritten, $defs: defsByPascal }
      : { $defs: defsByPascal, value: rewritten };

    let denormalized: JsonValue;
    try {
      const zodSchema = z.fromJSONSchema(input as unknown as Parameters<typeof z.fromJSONSchema>[0]);
      denormalized = z.toJSONSchema(zodSchema) as JsonValue;
    } catch (err) {
      console.warn(
        `[generate-zod] WARN: z.fromJSONSchema failed for "${originalName}" ` +
          `(${(err as Error).message}); emitting z.any() fallback.`,
      );
      fallbackCount += 1;
      const fileSource = [
        `// AUTO-GENERATED from Appwrite OpenAPI spec at ${APPWRITE_SPEC_REF}. DO NOT EDIT.`,
        `// FALLBACK: z.fromJSONSchema could not handle this schema.`,
        `import { z } from "zod";`,
        "",
        `export const ${pascalName}Schema = z.any();`,
        `export type ${pascalName} = z.infer<typeof ${pascalName}Schema>;`,
        "",
      ].join("\n");
      await writeFile(join(OUTPUT_DIR, `${toFileBaseName(pascalName)}.ts`), fileSource, "utf8");
      emittedNames.push(pascalName);
      emitted += 1;
      continue;
    }

    const fileSource = emitSchemaFile(pascalName, denormalized);
    await writeFile(join(OUTPUT_DIR, `${toFileBaseName(pascalName)}.ts`), fileSource, "utf8");
    emittedNames.push(pascalName);
    emitted += 1;
  }

  await writeFile(join(OUTPUT_DIR, "index.ts"), emitIndexFile(emittedNames), "utf8");
  await writeLastHash(collected.inputHash, collected.loadedSpecs, emitted);

  const summary = [
    `[generate-zod] Spec ref: ${APPWRITE_SPEC_REF}`,
    `[generate-zod] Specs used: ${collected.loadedSpecs.join(", ")}`,
    `[generate-zod] Schemas emitted: ${emitted}`,
  ];
  if (fallbackCount > 0) summary.push(`[generate-zod] z.any() fallbacks: ${fallbackCount}`);
  console.log(summary.join("\n"));
}

main().catch((err) => {
  console.error(`[generate-zod] FATAL: ${(err as Error).stack ?? (err as Error).message}`);
  process.exit(1);
});
