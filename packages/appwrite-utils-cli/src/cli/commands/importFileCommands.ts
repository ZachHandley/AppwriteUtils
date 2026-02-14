import inquirer from "inquirer";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import Papa from "papaparse";
import { ID, Query } from "node-appwrite";
import pLimit from "p-limit";
import {
  MessageFormatter,
  tryAwaitWithRetry,
  delay,
} from "appwrite-utils-helpers";
import type { DatabaseAdapter } from "appwrite-utils-helpers";
import { ProgressManager } from "../../shared/progressManager.js";
import { fetchAllDatabases } from "../../databases/methods.js";
import type { InteractiveCLI } from "../../interactiveCLI.js";

// ── Schema helpers ──────────────────────────────────────────────────────

interface SchemaInfo {
  columnTypeMap: Map<string, string>;
  arrayColumns: Set<string>;
  enumElementsMap: Map<string, Set<string>>;
  hasRelationships: boolean;
}

const SYSTEM_FIELDS = new Set([
  "$databaseId",
  "$collectionId",
  "$tableId",
  "$sequence",
  "$tenant",
]);
const PASSTHROUGH_FIELDS = new Set(["$id", "$permissions", "$createdAt", "$updatedAt"]);

async function fetchSchema(
  adapter: DatabaseAdapter,
  databaseId: string,
  tableId: string
): Promise<SchemaInfo> {
  MessageFormatter.info(`Fetching schema for database="${databaseId}" table="${tableId}"`, { prefix: "Import" });
  const tableInfo = await adapter.getTable({ databaseId, tableId });
  const columns: any[] = (tableInfo.data as any)?.columns || (tableInfo.data as any)?.attributes || [];
  const availableColumns = columns.filter((col: any) => !col.status || col.status === "available");
  MessageFormatter.info(
    `Schema columns: ${availableColumns.map((c: any) => c.key || c.$id).join(", ")}`,
    { prefix: "Import" }
  );

  const columnTypeMap = new Map<string, string>();
  const enumElementsMap = new Map<string, Set<string>>();
  const arrayColumns = new Set<string>();
  const hasRelationships = availableColumns.some((col: any) => col.type === "relationship");

  for (const col of availableColumns) {
    const key = col.key || col.$id;
    if (!key) continue;
    columnTypeMap.set(key, col.type);
    if (col.array) arrayColumns.add(key);
    if (col.type === "enum" && Array.isArray(col.elements)) {
      enumElementsMap.set(key, new Set(col.elements as string[]));
    }
  }

  if (columnTypeMap.size > 0) {
    MessageFormatter.info(
      `Table schema: ${columns.length} columns detected, will cast values to match types`,
      { prefix: "Import" }
    );
  }

  return { columnTypeMap, arrayColumns, enumElementsMap, hasRelationships };
}

// ── Row cleaning ────────────────────────────────────────────────────────

function cleanRow(row: any, schema: SchemaInfo): any {
  const { columnTypeMap, arrayColumns } = schema;
  const clean: any = {};

  for (const [key, value] of Object.entries(row)) {
    if (SYSTEM_FIELDS.has(key)) continue;

    if (PASSTHROUGH_FIELDS.has(key)) {
      if (value === null || value === undefined || value === "null" || value === "undefined" || value === "") continue;

      if (key === "$permissions") {
        if (Array.isArray(value)) {
          clean[key] = value;
        } else if (typeof value === "string" && value.trim()) {
          clean[key] = value.match(/[a-z]+\([^)]*\)/g) || [];
        }
      } else if (key === "$createdAt" || key === "$updatedAt") {
        const str = value instanceof Date ? value.toISOString() : String(value).trim();
        // Only set if it looks like a valid ISO datetime
        if (str && !isNaN(Date.parse(str))) {
          clean[key] = str;
        }
      } else {
        clean[key] = value;
      }
      continue;
    }

    if (columnTypeMap.size > 0 && !columnTypeMap.has(key)) continue;
    if (value === null || value === undefined || value === "null") continue;

    const colType = columnTypeMap.get(key);
    if (colType === "relationship") continue;

    // Array columns
    if (arrayColumns.has(key)) {
      let arr: any[];
      if (Array.isArray(value)) {
        arr = value;
      } else if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed || trimmed === "[]") {
          clean[key] = [];
          continue;
        }
        if (trimmed.startsWith("[")) {
          try {
            arr = JSON.parse(trimmed);
          } catch {
            arr = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
          }
        } else {
          arr = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
        }
      } else {
        arr = [value];
      }
      // Cast elements to scalar type
      if (colType === "integer") {
        arr = arr.map((v) => typeof v === "number" ? Math.round(v) : parseInt(String(v), 10)).filter((v) => !isNaN(v));
      } else if (colType === "float" || colType === "double") {
        arr = arr.map((v) => typeof v === "number" ? v : parseFloat(String(v))).filter((v) => !isNaN(v));
      } else if (colType === "boolean") {
        arr = arr.map((v) => {
          if (typeof v === "boolean") return v;
          const s = String(v).toLowerCase().trim();
          return s === "true" || s === "1" || s === "yes";
        });
      } else {
        arr = arr.map((v) => String(v));
      }
      clean[key] = arr;
      continue;
    }

    // Scalar casting
    if (colType === "enum") {
      clean[key] = String(value);
    } else if (colType === "boolean") {
      if (typeof value === "boolean") {
        clean[key] = value;
      } else if (typeof value === "string") {
        const lower = value.toLowerCase().trim();
        if (lower === "true" || lower === "1" || lower === "yes") {
          clean[key] = true;
        } else if (lower === "false" || lower === "0" || lower === "no" || lower === "") {
          clean[key] = false;
        } else {
          clean[key] = Boolean(value);
        }
      } else if (typeof value === "number") {
        clean[key] = value !== 0;
      } else {
        clean[key] = Boolean(value);
      }
    } else if (colType === "integer") {
      if (typeof value === "number") {
        clean[key] = Math.round(value);
      } else if (typeof value === "string" && value.trim() !== "") {
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed)) clean[key] = parsed;
      }
    } else if (colType === "float" || colType === "double") {
      if (typeof value === "number") {
        clean[key] = value;
      } else if (typeof value === "string" && value.trim() !== "") {
        const parsed = parseFloat(value);
        if (!isNaN(parsed)) clean[key] = parsed;
      }
    } else if (typeof value === "string" && value === "") {
      // Skip empty strings — let database use defaults
      continue;
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

// ── Upsert helpers ──────────────────────────────────────────────────────

function makeUpsertRow(
  adapter: DatabaseAdapter,
  databaseId: string,
  tableId: string
) {
  return async (row: any) => {
    const { $id, $permissions, ...data } = row;
    const rowId = $id || ID.unique();
    const permissions = Array.isArray($permissions) ? $permissions : undefined;
    try {
      await adapter.createRow({ databaseId, tableId, id: rowId, data, permissions });
    } catch (error: any) {
      const code = error?.originalError?.code || error?.code;
      if (code === 409) {
        await adapter.updateRow({ databaseId, tableId, id: rowId, data, permissions });
      } else {
        throw error;
      }
    }
  };
}

interface FlushStats {
  created: number;
  errors: number;
  firstError: string | null;
}

// Track the max working bulk size across calls so we don't retry sizes that already failed
let effectiveBulkMax = 2500;

async function flushBatch(
  batch: any[],
  adapter: DatabaseAdapter,
  databaseId: string,
  tableId: string,
  schema: SchemaInfo,
  useBulk: boolean,
  upsertRow: (row: any) => Promise<void>
): Promise<FlushStats> {
  let created = 0;
  let errors = 0;
  let firstError: string | null = null;

  if (useBulk) {
    // Deduplicate by $id within the batch — keep last occurrence
    const deduped = new Map<string, any>();
    for (const row of batch) {
      const id = row.$id || ID.unique();
      if (!row.$id) row.$id = id;
      deduped.set(id, row);
    }
    const dedupedRows = Array.from(deduped.values());

    // Split into sub-batches of effectiveBulkMax and run up to 5 concurrently
    const subBatches: any[][] = [];
    for (let i = 0; i < dedupedRows.length; i += effectiveBulkMax) {
      subBatches.push(dedupedRows.slice(i, i + effectiveBulkMax));
    }
    const bulkLimit = pLimit(500);
    const results = await Promise.all(
      subBatches.map((sub) =>
        bulkLimit(async () => {
          try {
            const result = await tryAwaitWithRetry(async () =>
              adapter.bulkUpsertRows!({ databaseId, tableId, rows: sub })
            );
            return { created: (result as any)?.total || (result as any)?.rows?.length || sub.length, errors: 0, firstError: null as string | null };
          } catch (error: any) {
            const msg = error?.message || error?.originalError?.message || String(error);
            const isSizeError = /too many|payload too large|batch.*size|limit|no longer than \d+ items|array.*\d+ items/i.test(msg)
              || error?.originalError?.code === 413
              || error?.code === 413
              || error?.originalError?.type === "general_argument_invalid";

            if (isSizeError && sub.length > 50) {
              const newMax = Math.floor(sub.length / 2);
              if (newMax < effectiveBulkMax) {
                effectiveBulkMax = newMax;
                MessageFormatter.warning(`Bulk batch too large, reducing to ${effectiveBulkMax} per call`, { prefix: "Import" });
              }
              // Retry halved sequentially within this slot
              const mid = Math.ceil(sub.length / 2);
              const halves = [sub.slice(0, mid), sub.slice(mid)];
              let hCreated = 0, hErrors = 0;
              let hFirst: string | null = null;
              for (const half of halves) {
                try {
                  const r = await tryAwaitWithRetry(async () =>
                    adapter.bulkUpsertRows!({ databaseId, tableId, rows: half })
                  );
                  hCreated += (r as any)?.total || (r as any)?.rows?.length || half.length;
                } catch (e: any) {
                  hErrors += half.length;
                  if (!hFirst) hFirst = e?.message || String(e);
                }
              }
              return { created: hCreated, errors: hErrors, firstError: hFirst };
            }
            return { created: 0, errors: sub.length, firstError: msg };
          }
        })
      )
    );
    for (const r of results) {
      created += r.created;
      errors += r.errors;
      if (r.firstError && !firstError) firstError = r.firstError;
    }
  } else {
    const limit = pLimit(500);
    const promises = batch.map((row) =>
      limit(async () => {
        try {
          await upsertRow(row);
          created++;
        } catch (error: any) {
          errors++;
          const msg = error?.message || error?.originalError?.message || String(error);
          if (!firstError) firstError = msg;
        }
      })
    );
    await Promise.all(promises);
  }

  return { created, errors, firstError };
}

// ── Streaming CSV/TSV importer ──────────────────────────────────────────

async function countLines(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let count = 0;
    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    stream.on("data", (chunk: string | Buffer) => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      for (let i = 0; i < buf.length; i++) {
        if (buf[i] === 0x0a) count++;
      }
    });
    stream.on("end", () => resolve(count)); // header line means count ≈ data rows
    stream.on("error", reject);
  });
}

async function importCsvStream(
  adapter: DatabaseAdapter,
  filePath: string,
  databaseId: string,
  tableId: string,
  schema: SchemaInfo,
  delimiter?: string
): Promise<void> {
  const useBulk = false; // individual upserts with high concurrency
  const BATCH_SIZE = 500;
  const upsertRow = makeUpsertRow(adapter, databaseId, tableId);

  if (schema.hasRelationships) {
    MessageFormatter.info("Table has relationships — using individual upserts (25 concurrent)", { prefix: "Import" });
  }
  if (useBulk) {
    MessageFormatter.info("Using bulk upsert", { prefix: "Import" });
  }

  // Get approximate row count for progress
  const lineCount = await countLines(filePath);
  MessageFormatter.info(`~${lineCount} rows detected (streaming)`, { prefix: "Import" });

  const progress = ProgressManager.create(`import-${tableId}`, lineCount, {
    title: `Importing into ${tableId}`,
  });

  let totalCreated = 0;
  let totalErrors = 0;
  let firstError: string | null = null;
  let buffer: any[] = [];
  let headerLogged = false;

  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: "utf8" });

    Papa.parse(stream, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
      delimiter,
      step: async (result: any, parser: any) => {
        if (result.errors?.length > 0) {
          const critical = result.errors.filter((e: any) => e.type !== "FieldMismatch");
          if (critical.length > 0 && !firstError) {
            firstError = critical[0].message;
          }
        }

        const cleaned = cleanRow(result.data, schema);

        if (!headerLogged && cleaned) {
          MessageFormatter.info(`Columns: ${Object.keys(cleaned).join(", ")}`, { prefix: "Import" });
          headerLogged = true;
        }

        buffer.push(cleaned);

        if (buffer.length >= BATCH_SIZE) {
          parser.pause();
          const batch = buffer.splice(0, buffer.length);
          const stats = await flushBatch(batch, adapter, databaseId, tableId, schema, useBulk, upsertRow);
          totalCreated += stats.created;
          totalErrors += stats.errors;
          if (stats.firstError && !firstError) firstError = stats.firstError;
          progress.update(totalCreated + totalErrors);
          parser.resume();
        }
      },
      complete: async () => {
        // Flush remaining rows
        if (buffer.length > 0) {
          const stats = await flushBatch(buffer, adapter, databaseId, tableId, schema, useBulk, upsertRow);
          totalCreated += stats.created;
          totalErrors += stats.errors;
          if (stats.firstError && !firstError) firstError = stats.firstError;
        }
        resolve();
      },
      error: (error: any) => {
        reject(error);
      },
    });
  });

  progress.setTotal(totalCreated + totalErrors);
  progress.stop();

  if (firstError) {
    MessageFormatter.error(`Sample error: ${firstError}`, undefined, { prefix: "Import" });
  }
  if (totalErrors > 0) {
    MessageFormatter.warning(
      `Imported ${totalCreated} rows with ${totalErrors} errors into ${tableId}`,
      { prefix: "Import" }
    );
  } else {
    MessageFormatter.success(
      `Successfully imported ${totalCreated} rows into ${tableId}`,
      { prefix: "Import" }
    );
  }
}

// ── Streaming JSONL importer ────────────────────────────────────────────

async function importJsonlStream(
  adapter: DatabaseAdapter,
  filePath: string,
  databaseId: string,
  tableId: string,
  schema: SchemaInfo
): Promise<void> {
  const useBulk = false; // individual upserts with high concurrency
  const BATCH_SIZE = 500;
  const upsertRow = makeUpsertRow(adapter, databaseId, tableId);

  if (useBulk) MessageFormatter.info("Using bulk upsert", { prefix: "Import" });

  const lineCount = await countLines(filePath);
  MessageFormatter.info(`~${lineCount} rows detected (streaming)`, { prefix: "Import" });

  const progress = ProgressManager.create(`import-${tableId}`, lineCount, {
    title: `Importing into ${tableId}`,
  });

  let totalCreated = 0;
  let totalErrors = 0;
  let firstError: string | null = null;
  let buffer: any[] = [];
  let headerLogged = false;

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let row: any;
    try {
      row = JSON.parse(trimmed);
    } catch {
      totalErrors++;
      if (!firstError) firstError = `Invalid JSON line: ${trimmed.slice(0, 80)}`;
      continue;
    }

    const cleaned = cleanRow(row, schema);
    if (!headerLogged && cleaned) {
      MessageFormatter.info(`Columns: ${Object.keys(cleaned).join(", ")}`, { prefix: "Import" });
      headerLogged = true;
    }

    buffer.push(cleaned);

    if (buffer.length >= BATCH_SIZE) {
      const batch = buffer.splice(0, buffer.length);
      const stats = await flushBatch(batch, adapter, databaseId, tableId, schema, useBulk, upsertRow);
      totalCreated += stats.created;
      totalErrors += stats.errors;
      if (stats.firstError && !firstError) firstError = stats.firstError;
      progress.update(totalCreated + totalErrors);
    }
  }

  // Flush remaining
  if (buffer.length > 0) {
    const stats = await flushBatch(buffer, adapter, databaseId, tableId, schema, useBulk, upsertRow);
    totalCreated += stats.created;
    totalErrors += stats.errors;
    if (stats.firstError && !firstError) firstError = stats.firstError;
  }

  progress.setTotal(totalCreated + totalErrors);
  progress.stop();

  if (firstError) {
    MessageFormatter.error(`Sample error: ${firstError}`, undefined, { prefix: "Import" });
  }
  if (totalErrors > 0) {
    MessageFormatter.warning(
      `Imported ${totalCreated} rows with ${totalErrors} errors into ${tableId}`,
      { prefix: "Import" }
    );
  } else {
    MessageFormatter.success(
      `Successfully imported ${totalCreated} rows into ${tableId}`,
      { prefix: "Import" }
    );
  }
}

// ── JSON importer (non-streaming, for .json files) ──────────────────────

async function importJsonFile(
  adapter: DatabaseAdapter,
  filePath: string,
  databaseId: string,
  tableId: string,
  schema: SchemaInfo
): Promise<void> {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);

  let rows: any[];
  if (Array.isArray(parsed)) {
    rows = parsed;
  } else if (typeof parsed === "object" && parsed !== null) {
    const arrayKey = Object.keys(parsed).find((k) => Array.isArray(parsed[k]));
    if (arrayKey) {
      MessageFormatter.info(
        `Using "${arrayKey}" array from JSON (${parsed[arrayKey].length} items)`,
        { prefix: "Import" }
      );
      rows = parsed[arrayKey];
    } else {
      throw new Error("JSON file must be an array or an object containing an array");
    }
  } else {
    throw new Error("JSON file must be an array or an object containing an array");
  }

  if (!rows.length) {
    MessageFormatter.warning("No rows found in file", { prefix: "Import" });
    return;
  }

  MessageFormatter.info(`Parsed ${rows.length} rows`, { prefix: "Import" });

  const useBulk = false; // individual upserts with high concurrency
  const BATCH_SIZE = 500;
  const upsertRow = makeUpsertRow(adapter, databaseId, tableId);

  if (useBulk) MessageFormatter.info("Using bulk upsert", { prefix: "Import" });
  if (schema.hasRelationships) {
    MessageFormatter.info("Table has relationships — using individual upserts (25 concurrent)", { prefix: "Import" });
  }

  const cleanedRows = rows.map((row) => cleanRow(row, schema));

  MessageFormatter.info(`Columns: ${Object.keys(cleanedRows[0]).join(", ")}`, { prefix: "Import" });

  const progress = ProgressManager.create(`import-${tableId}`, cleanedRows.length, {
    title: `Importing into ${tableId}`,
  });

  let totalCreated = 0;
  let totalErrors = 0;
  let firstError: string | null = null;

  // Process in batches
  for (let i = 0; i < cleanedRows.length; i += BATCH_SIZE) {
    const batch = cleanedRows.slice(i, i + BATCH_SIZE);
    const stats = await flushBatch(batch, adapter, databaseId, tableId, schema, useBulk, upsertRow);
    totalCreated += stats.created;
    totalErrors += stats.errors;
    if (stats.firstError && !firstError) firstError = stats.firstError;
    progress.update(totalCreated + totalErrors);
  }

  progress.setTotal(totalCreated + totalErrors);
  progress.stop();

  if (firstError) {
    MessageFormatter.error(`Sample error: ${firstError}`, undefined, { prefix: "Import" });
  }
  if (totalErrors > 0) {
    MessageFormatter.warning(
      `Imported ${totalCreated} rows with ${totalErrors} errors into ${tableId}`,
      { prefix: "Import" }
    );
  } else {
    MessageFormatter.success(
      `Successfully imported ${totalCreated} rows into ${tableId}`,
      { prefix: "Import" }
    );
  }
}

// ── Main entry point ────────────────────────────────────────────────────

export async function importFileFromPath(
  adapter: DatabaseAdapter,
  filePath: string,
  databaseId: string,
  tableId: string
): Promise<void> {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    MessageFormatter.error(`File not found: ${resolvedPath}`, undefined, {
      prefix: "Import",
    });
    return;
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  const supported = new Set([".csv", ".tsv", ".json", ".jsonl"]);
  if (!supported.has(ext)) {
    MessageFormatter.error(
      `Unsupported file format: ${ext}. Use .csv, .tsv, .json, or .jsonl`,
      undefined,
      { prefix: "Import" }
    );
    return;
  }

  const stat = fs.statSync(resolvedPath);
  const sizeMB = (stat.size / 1024 / 1024).toFixed(1);
  MessageFormatter.info(`Importing ${path.basename(resolvedPath)} (${sizeMB} MB)`, { prefix: "Import" });

  const schema = await fetchSchema(adapter, databaseId, tableId);

  try {
    if (ext === ".csv" || ext === ".tsv") {
      await importCsvStream(adapter, resolvedPath, databaseId, tableId, schema, ext === ".tsv" ? "\t" : undefined);
    } else if (ext === ".jsonl") {
      await importJsonlStream(adapter, resolvedPath, databaseId, tableId, schema);
    } else {
      await importJsonFile(adapter, resolvedPath, databaseId, tableId, schema);
    }
  } catch (error: any) {
    MessageFormatter.error(
      `Failed to import file: ${error.message}`,
      error,
      { prefix: "Import" }
    );
  }
}

// ── Prompt for missing targetDb / targetTable ───────────────────────────

export async function importFilePromptMissing(
  adapter: DatabaseAdapter,
  database: any,
  filePath: string,
  targetDb?: string,
  targetTable?: string
): Promise<void> {
  let databaseId = targetDb;
  let tableId = targetTable;

  if (!databaseId) {
    const allDatabases = await fetchAllDatabases(database);
    if (allDatabases.length === 0) {
      MessageFormatter.error("No databases found", undefined, { prefix: "Import" });
      return;
    }
    const { selectedDb } = await inquirer.prompt([
      {
        type: "list",
        name: "selectedDb",
        message: "Select target database:",
        choices: allDatabases.map((db) => ({
          name: `${db.name} (${db.$id})`,
          value: db.$id,
        })),
      },
    ]);
    databaseId = selectedDb;
  }

  if (!tableId) {
    const tablesResponse = await adapter.listTables({
      databaseId: databaseId!,
      queries: [Query.limit(500)],
    });
    const tables: any[] = tablesResponse.tables || tablesResponse.data || [];
    if (tables.length === 0) {
      MessageFormatter.error("No tables found in selected database", undefined, { prefix: "Import" });
      return;
    }
    const { selectedTable } = await inquirer.prompt([
      {
        type: "list",
        name: "selectedTable",
        message: "Select target table:",
        choices: tables.map((t: any) => ({
          name: `${t.name} (${t.$id})`,
          value: t.$id,
        })),
      },
    ]);
    tableId = selectedTable;
  }

  await importFileFromPath(adapter, filePath, databaseId!, tableId!);
}

// ── Interactive wrapper ─────────────────────────────────────────────────

export const importFileCommands = {
  async importFile(cli: InteractiveCLI): Promise<void> {
    const controller = (cli as any).controller!;
    const adapter = controller.adapter as DatabaseAdapter;
    const database = controller.database!;

    // 1. Prompt for file path
    const { filePath } = await inquirer.prompt([
      {
        type: "input",
        name: "filePath",
        message: "Path to CSV or JSON file:",
        validate: (input: string) => {
          if (!input || !input.trim()) return "Please provide a file path";
          const resolved = path.resolve(input.trim());
          if (!fs.existsSync(resolved))
            return `File not found: ${resolved}`;
          const ext = path.extname(resolved).toLowerCase();
          if (![".csv", ".tsv", ".json", ".jsonl"].includes(ext))
            return "Supported formats: .csv, .tsv, .json, .jsonl";
          return true;
        },
      },
    ]);

    // 2. Select database
    const allDatabases = await fetchAllDatabases(database);
    if (allDatabases.length === 0) {
      MessageFormatter.error("No databases found", undefined, {
        prefix: "Import",
      });
      return;
    }

    const { selectedDb } = await inquirer.prompt([
      {
        type: "list",
        name: "selectedDb",
        message: "Select target database:",
        choices: allDatabases.map((db) => ({
          name: `${db.name} (${db.$id})`,
          value: db.$id,
        })),
      },
    ]);

    // 3. Select table
    const tablesResponse = await adapter.listTables({
      databaseId: selectedDb,
      queries: [Query.limit(500)],
    });
    const tables: any[] = tablesResponse.tables || tablesResponse.data || [];

    if (tables.length === 0) {
      MessageFormatter.error(
        "No tables found in selected database",
        undefined,
        { prefix: "Import" }
      );
      return;
    }

    const { selectedTable } = await inquirer.prompt([
      {
        type: "list",
        name: "selectedTable",
        message: "Select target table:",
        choices: tables.map((t: any) => ({
          name: `${t.name} (${t.$id})`,
          value: t.$id,
        })),
      },
    ]);

    // 4. Import
    await importFileFromPath(adapter, filePath.trim(), selectedDb, selectedTable);
  },
};
