/**
 * Standalone repro for the `Cannot convert object to primitive value` crash
 * inside inquirer 9.3.8's CheckboxPrompt.
 *
 * Run from a project root that has a local `.appwrite/config.yaml`:
 *
 *   bunx tsx packages/appwrite-utils-cli/scripts/repro-inquirer-crash.ts
 *
 * For each candidate object the production code would have stuffed into
 * `value: f` on a checkbox choice, this script attempts the exact primitive
 * coercion inquirer does (`String([f])` ≡ `"" + [f]`) and reports which
 * element fails and why — including the offending property's name +
 * constructor name. Use the output to decide whether the bug is in our
 * synthesized local function shape, in node-appwrite's remote response
 * shape, or in the merge.
 *
 * Pure investigation script. Doesn't get bundled, doesn't ship.
 */

import { UtilsController } from "../src/utilsController.js";
import { listFunctions } from "../src/functions/methods.js";
import { ulid } from "ulidx";
import { DateTime } from "luxon";

async function main() {
  const controller = UtilsController.getInstance(process.cwd());
  await controller.init();

  if (!controller.appwriteServer) {
    console.error("[repro] No Appwrite server initialized — is auth configured for this CWD?");
    process.exit(2);
  }

  const local = (controller.config?.functions ?? []).map((f: any) => ({
    $id: f.$id || ulid(),
    $createdAt: DateTime.now().toISO(),
    $updatedAt: DateTime.now().toISO(),
    name: f.name,
    runtime: f.runtime,
    execute: f.execute || ["any"],
    events: f.events || [],
    schedule: f.schedule || "",
    timeout: f.timeout || 15,
    enabled: f.enabled !== false,
    logging: f.logging !== false,
    entrypoint: f.entrypoint || "src/main.ts",
    commands: f.commands || "npm install",
    scopes: f.scopes || [],
    path: f.dirPath || `functions/${f.name}`,
  }));

  const remote = await listFunctions(controller.appwriteServer);
  const allFunctions = [
    ...local,
    ...(remote.functions ?? []).filter(
      (rf: any) => !local.some((lf) => lf.name === rf.name || lf.$id === rf.$id)
    ),
  ];

  console.error(`[repro] testing ${allFunctions.length} function objects (${local.length} local, ${allFunctions.length - local.length} remote-only)`);

  let failed = 0;
  for (const [i, f] of allFunctions.entries()) {
    const label = `#${i} ${(f as any).name} (${(f as any).$id})`;
    try {
      // Exact coercion inquirer does: `string + [obj]` → Array.toString() → Array.join(',') → String(obj) per element.
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      "" + [f];
    } catch (e) {
      failed++;
      console.error(`[repro] ✗ ${label} FAILED primitive coercion: ${(e as Error).message}`);

      // Probe each own property to find the offender.
      for (const [k, v] of Object.entries(f as Record<string, unknown>)) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          "" + [v];
        } catch (inner) {
          const ctor =
            v && typeof v === "object" ? (v as object).constructor?.name : typeof v;
          console.error(
            `      → property "${k}" of type ${typeof v} (ctor=${ctor}) trips coercion: ${(inner as Error).message}`
          );
          if (Array.isArray(v)) {
            for (const [j, elem] of (v as unknown[]).entries()) {
              try {
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                "" + [elem];
              } catch (e2) {
                const eCtor = elem && typeof elem === "object" ? (elem as object).constructor?.name : typeof elem;
                console.error(`        [${j}] (ctor=${eCtor}) keys=${elem && typeof elem === "object" ? Object.keys(elem as object).join(",") : "(n/a)"}: ${(e2 as Error).message}`);
                // Drill one more layer
                if (elem && typeof elem === "object") {
                  for (const [k2, v2] of Object.entries(elem as Record<string, unknown>)) {
                    try {
                      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                      "" + [v2];
                    } catch (e3) {
                      const sCtor = v2 && typeof v2 === "object" ? (v2 as object).constructor?.name : typeof v2;
                      console.error(`            → ${k2} (ctor=${sCtor}, typeof=${typeof v2}): ${(e3 as Error).message}`);
                    }
                  }
                }
              }
            }
          } else if (v && typeof v === "object") {
            try {
              console.error(`        keys: ${Object.keys(v as object).join(", ")}`);
            } catch {
              /* ignore */
            }
          }
        }
      }
      continue;
    }
    console.error(`[repro] ✓ ${label} coerces fine`);
  }

  console.error(
    `[repro] done: ${allFunctions.length - failed}/${allFunctions.length} passed primitive coercion`
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("[repro] fatal:", err);
  process.exit(3);
});
