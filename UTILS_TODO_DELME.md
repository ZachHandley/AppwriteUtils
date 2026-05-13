# AppwriteUtils ↔ Official Appwrite CLI Integration — Status & TODO

Transient working doc. Delete after the work ships.

Approved plan lives at `/home/zach/.claude/plans/hey-can-we-install-toasty-quasar.md`.

---

## Architecture (one paragraph)

AppwriteUtils now sits **on top of** the official `appwrite-cli` (v20.1.0, pinned), not next to it. Function/site deploys, push/pull, and auth delegate to the official CLI. AppwriteUtils keeps its YAML sidecar (`appwrite-utils.config.yaml`) as the human-author format and translates to the official `appwrite.config.json` (split via `includes` to `appwrite/<resource>.json`) at the moment we delegate. Three modes: **owned** (sidecar embeds inline `appwrite`), **referenced** (sidecar points at user's `appwrite.config.json`), **hybrid** (mix). Auth bridge: per-invocation try-and-store via `appwrite client --reset/--endpoint/--project-id/--key` once, then `~/.appwrite/prefs.json` short-circuits subsequent calls.

---

## Done

### Phase A — initial integration (pre-this-session)

- **Dependencies** (`appwrite-cli@^20.1.0` devDep): `packages/appwrite-utils-cli/package.json`, `packages/appwrite-utils-helpers/package.json`, `packages/appwrite-utils-mcp/package.json`. `execa@^9.5.2` in helpers. Root `package.json` has `overrides: { zod: "4.4.3" }` to unify the type identity (MCP SDK was pulling 4.1.12).
- **Auth bridge**: `packages/appwrite-utils-helpers/src/cli/appwriteCliRunner.ts` — exports `runAppwriteCli`, `injectCredentials`, `hasCliPrefsFor`, `resolveCredentialsFromEnv`. Try-and-store: `opts.credentials → APPWRITE_* env → hasCliPrefsFor short-circuit → injectCredentials writes prefs.json`. Handles 4 `prefs.json` layouts (flat / current-session / project-keyed / any-entry).
- **Auth wrappers**: `packages/appwrite-utils-helpers/src/cli/appwriteCliAuth.ts` — `appwriteWhoami`, `appwriteLogin`, `appwriteLogout`, `appwriteSetClient`. All use `skipAuthBridge: true`.
- **Config bridge**: `packages/appwrite-utils-helpers/src/cli/configBridge.ts` — `writeOfficialConfig` (monolithic/split layouts), `resolveIncludes` (reads + follows official `includes` map), `mergePulledConfig` (post-pull merge), `detectConfigMode` (owned/referenced/hybrid/none).
- **Sidecar loader**: `packages/appwrite-utils-helpers/src/config/extensionConfigLoader.ts` — `findExtensionConfig` (unbounded `find-up`), `loadExtensionConfig` (auto-resolves linked official config), `saveExtensionConfig` (atomic temp+rename).
- **Deploy helpers**: `packages/appwrite-utils-helpers/src/functions/cliFunctionDeploy.ts` (`deployFunctionViaCli`) + `packages/appwrite-utils-helpers/src/sites/cliSiteDeploy.ts` (`deploySiteViaCli`). Stage code at `<cwd>/appwrite/functions/<id>/`, write split-layout JSON, call `appwrite push function --function-id <id>` (or `--site-id`). One-method additions to `functionManager.ts` / `siteManager.ts`.
- **Schemas**: `packages/appwrite-utils/src/schemas/officialConfig.ts` (`AppwriteOfficialConfigSchema`, strict, mirrors `appwrite.config.json`) + `packages/appwrite-utils/src/schemas/utilsExtensionConfig.ts` (`AppwriteUtilsExtensionSchema`, passthrough, supersets official with per-resource extensions keyed by `$id`).
- **OpenAPI → Zod**: `packages/appwrite-utils/scripts/generate-zod-from-openapi.ts` — fetches Appwrite OpenAPI specs at pinned `APPWRITE_SPEC_TAG`, emits 179 schemas to `packages/appwrite-utils/src/schemas/generated/`. Wired into `prebuild`. Cache + hash-based skip.
- **CLI flags** in `packages/appwrite-utils-cli/src/main.ts`:
  - `--init` → `runInitFlow` (`packages/appwrite-utils-cli/src/cli/commands/initFlow.ts`)
  - `--upgradeConfig` → `runUpgradeConfigFlow` (`upgradeConfigFlow.ts`, currently a notice stub — see "Deferred")
  - `--passthrough -- <args>` → `runPassthrough` (`passthroughCommand.ts`)
  - Auth-bypass list at `main.ts:699` lets these three run without `controller.config`.
- **MCP tools**: `deploy_function_via_cli`, `deploy_site_via_cli` in `packages/appwrite-utils-mcp/src/tools/functions/index.ts` and `sites/index.ts`.

### Phase B — follow-up rollout (this session)

1. **`findProjectRoot` helper** — `packages/appwrite-utils-helpers/src/config/findProjectRoot.ts`. Unbounded walk-up checking sidecar names (`appwrite-utils.config.{yaml,yml,json}`, `.appwrite-utils.yaml`) then `appwrite.config.json`; falls back to `.git` (directory OR file — submodule-safe). Returns `{ root, anchor, anchorPath }`. Re-exported via `packages/appwrite-utils-helpers/src/config/index.ts:48-52`.
2. **Nested-dir fixes**:
   - `packages/appwrite-utils-cli/src/cli/commands/passthroughCommand.ts:25-32` — anchors via `findProjectRoot`, passes `cwd: root` to `runAppwriteCli` (previously inherited `process.cwd()` and failed from subdirs).
   - `packages/appwrite-utils-cli/src/cli/commands/initFlow.ts:44-102` — replaces literal `path.join(opts.cwd, "appwrite.config.json")` existence check with anchored walk-up via `findProjectRoot`. Try/catch fallback for the "no anchor anywhere" case.
3. **`resolveCliCredentials` helper** — `packages/appwrite-utils-helpers/src/cli/resolveCliCredentials.ts`. Pure function. Per-field precedence: `argv > APPWRITE_* env > sidecar ext.auth`. Wires the previously-dead `auth:` block as a real credential source. Empty-string is "not set". Re-exported via `cli/index.ts:21-22`.
4. **Per-function schemas + aggregator**:
   - `packages/appwrite-utils/src/schemas/utilsExtensionConfig.ts:125-148` — `PerFunctionConfigSchema` (spreads `FunctionSchema.shape` + `FunctionExtensionSchema.shape`, passthrough) and `PerSiteConfigSchema`. Types exported at lines 290-293.
   - `packages/appwrite-utils-helpers/src/cli/perFunctionAggregator.ts` — `discoverPerFunctionConfigs(projectRoot)`, `discoverPerFunctionConfig(projectRoot, id)`, `buildAggregatedFunctionsJson(configs)` + mirror set for sites. Discovers `<projectRoot>/functions/<dirname>/appwrite-utils.{yaml,yml,json}` (first-found wins). `$id` is read from YAML, NOT derived from dirname. Strips extension fields via `z.object(FunctionSchema.shape).parse()` (strip mode).
   - `packages/appwrite-utils/src/index.ts` — added barrel re-exports for `FunctionSchema`, `SiteSchema`, `PerFunctionConfigSchema`, `PerSiteConfigSchema`, types `OfficialFunction`, `OfficialSite`, `PerFunctionConfig*`, `PerSiteConfig*`.
5. **`--config <path>` flag wiring (new flows only)** — flag was registered at `main.ts:364` but inert. Now plumbed for `--init` and `--passthrough`:
   - `passthroughCommand.ts:8-15, 25-32` — accepts `configPath?: string`, uses `dirname(resolve(configPath))` as project root when set.
   - `initFlow.ts:14-22, 44-145` — same pattern; uses `configPath` as the explicit sidecar location, skips both `findProjectRoot` and `findExtensionConfig` walk-ups.
   - `main.ts:714, 735` — passes `argv.config` into both flow option objects.
   - **NOT wired** for legacy flows (`--push`, `--sync`, etc.) — see "Deferred".
6. **`--regen <target>` unified flag** — `packages/appwrite-utils-cli/src/cli/commands/regenFlow.ts`:
   - Targets: `all`, `functions[:<id>]`, `sites[:<id>]`. Plus `--no-deploy` modifier.
   - `regenAll` — aggregates per-function/site YAMLs (if any), writes `<projectRoot>/appwrite/{functions,sites}.json`, then `appwrite push all --force`.
   - `regenFunctions(id?)` — discovers per-function YAMLs (errors if none), aggregates, writes `appwrite/functions.json`, then `appwrite push function [--function-id <id>] [--all] --force`.
   - `regenSites(id?)` — same pattern.
   - **V1 explicit-out-of-scope**: `buckets`, `tablesDB`, `collections`, `tables`, `teams`, `webhooks`, `topics`, `messages`. Returns an actionable error pointing at `--regen all` or `--passthrough -- push <resource>`. **Not a stub** — documented scope decision.
   - Anchors via `findProjectRoot` (or `dirname(configPath)` if `--config` provided). Loads sidecar for `ext.auth`, merges via `resolveCliCredentials`.
   - `main.ts:90-91` (types), `main.ts:660-668` (yargs `.option`s), `main.ts:710` (auth-bypass list addition), `main.ts:754-764` (dispatch block).

---

## Left to do

Plan section §5–§9 of the follow-up plan + test coverage. Task IDs reference the in-session TaskList.

### #18 — `syncExtensionStubsFromOfficial` helper + `--sync-extensions` flag

Plan §5. When users add a new function/site/etc. to the official `appwrite/<resource>.json`, the sidecar's `extensions.<resource>` map (keyed by `$id`) doesn't auto-grow stubs for the new resources, so adding extension fields (importDefs, transforms) requires manual YAML edits. Fix:

- Pure helper in `packages/appwrite-utils-helpers/src/cli/configBridge.ts`:
  ```ts
  export function syncExtensionStubsFromOfficial(
    ext: AppwriteUtilsExtension,
    official: AppwriteOfficialConfig,
  ): { ext: AppwriteUtilsExtension; added: string[]; orphaned: string[] };
  ```
  For each `$id` in `official.{functions,sites,buckets,tablesDB,tables,teams,webhooks,topics,messages}` lacking a matching `ext.extensions.<resource>.<$id>`, add `{}`. For each entry under `ext.extensions.<resource>.<$id>` whose `$id` no longer exists in official, return it in `orphaned[]` (do NOT delete — preserves user data).
- New flow `packages/appwrite-utils-cli/src/cli/commands/syncExtensionsFlow.ts` — loads sidecar + resolves official, calls helper, writes YAML via `saveExtensionConfig`, prints added/orphaned counts.
- `main.ts` — register `--sync-extensions` (alias `--syncExtensions`) yargs flag, add to auth-bypass list, dispatch block. Pattern mirrors `--regen`.

### #19 — `--it` interactive auto-sync prompt

Plan §5. Wire `syncExtensionStubsFromOfficial` into `InteractiveCLI.run()` at startup. If `added.length > 0`, prompt the user before writing YAML. Entry point: `packages/appwrite-utils-cli/src/interactiveCLI.ts:96` (`async run()`).

### #20 — Stack B env-var parity fix

Plan §6. Stack A (CLI bridge) uses `APPWRITE_PROJECT_ID`; Stack B (`ConfigManager` → `ConfigMergeService`) uses `APPWRITE_PROJECT`. Additionally, `ConfigManager.loadConfig` never calls `mergeAllSources`, so env vars are dead-letter for Stack B today.

- `packages/appwrite-utils-helpers/src/config/services/ConfigMergeService.ts:179-208` (`mergeEnvironmentVariables`) — accept BOTH `APPWRITE_PROJECT` and `APPWRITE_PROJECT_ID`. On conflict, `APPWRITE_PROJECT_ID` wins (more specific).
- `packages/appwrite-utils-helpers/src/config/ConfigManager.ts:250-566` (`loadConfig`) — call `mergeService.mergeEnvironmentVariables(config)` BEFORE `applyOverrides`. This makes `--push` / `--sync` / etc. work from env vars in CI.

### #21 — Credential resolution test coverage

Plan tests 12-19. Unit tests for `resolveCliCredentials` covering each precedence level. Use temp dirs + mocked `env`.

| # | Scenario | Expected |
|---|----------|----------|
| 12 | argv beats env | `{ A, B, K1 }` |
| 13 | env beats sidecar | env values |
| 14 | sidecar fills gaps | mixed |
| 15 | sidecar alone | sidecar values |
| 16 | nothing | `undefined` |
| 17 | prefs.json short-circuit | no `injectCredentials` call (spy on `execa`) |
| 18 | prefs.json miss | 4 sequential `appwrite client` calls (spy on `execa`) |
| 19 | end-to-end with sidecar auth | injected from sidecar |

No existing test setup in the helpers package — first task is to set up `bun test` or jest config there. Check `packages/appwrite-utils-cli/jest.config.*` for the existing pattern (CLI package has `"test": "jest"` in scripts).

### #22 — Stack B env-var parity test coverage

Plan tests 20-22. Tests that follow once #20 lands.

| # | Scenario | Expected |
|---|----------|----------|
| 20 | `APPWRITE_PROJECT_ID` only | resolves through `ConfigManager` |
| 21 | `APPWRITE_PROJECT` only | resolves (backcompat) |
| 22 | Both | `APPWRITE_PROJECT_ID` wins |

---

## Deferred (out of scope unless re-asked)

- **`--config <path>` for legacy flows** (`--push`, `--sync`, etc. via `ConfigManager`). Different file format — sidecar YAML vs. legacy YAML/TS/JSON config — and the legacy `ConfigManager` doesn't understand the sidecar shape. Wiring `--config` through `controller.init` would need a content-sniffing step or a separate `--sidecar` flag. Discuss before implementing.
- **`--regen` for non-function/site resources** (`buckets`, `tablesDB`, `collections`, `tables`, `teams`, `webhooks`, `topics`, `messages`). V1 explicit scope decision. `collections`/`tables`/`tablesDB` are awkward because they need database context; the other five could be added via a thin `runAppwriteCli(["push", "<singular>", ...idFlag, "--force"])` wrapper if needed.
- **`runUpgradeConfigFlow` actually translating legacy YAML**. Currently at `packages/appwrite-utils-cli/src/cli/commands/upgradeConfigFlow.ts` it's a notice stub: detects legacy configs, tells the user automatic translation is a follow-up. Plan acknowledges this — no forced migration.
- **Legacy `findYamlConfig` callers** (`configCommands.ts:89,187`, `functionCommands.ts:120,220`, `siteCommands.ts:164,297`, `setupFiles.ts:140-141`, `interactiveCLI.ts:1187,1195`, `schemaGenerator.ts:263`, `utilsController.ts:255`). All walk only one parent up; all fail from nested dirs like `functions/funcA/`. Plan §7 explicitly leaves these as-is for this rollout.

---

## Open questions to resolve before merging

- Do we want a separate `--sidecar <path>` flag for the new flows, with `--config` reserved for legacy? Or keep `--config` as the single override and accept that legacy flows ignore it? Current implementation: `--config` is a no-op for legacy, override-for-new.
- Where do tests live in this monorepo? CLI package has jest; helpers package doesn't appear to. Likely set up `bun test` in helpers when starting #21.

---

## Verification matrix (when #18-22 land)

Plan verification §1-22. The big behavioral asks are:

1. `cd functions/funcA && pnpx appwrite-utils-cli --regen functions:funcA` — anchors on parent's sidecar / `.git`, regenerates `appwrite/functions.json` at project root, deploys via official CLI. **Should work today after Phase B.**
2. Multi-env: `--config ./appwrite-utils.staging.yaml --regen all` vs `--config ./appwrite-utils.prod.yaml --regen all`. **Should work today after Phase B.**
3. CI-only: `APPWRITE_ENDPOINT=... APPWRITE_PROJECT_ID=... APPWRITE_API_KEY=... bunx appwrite push all --force`. Doesn't need our layer at all. **Works today.**
4. Submodule: `pnpx appwrite-utils-cli --regen functions:funcA` from inside a submodule that has its own `.git` file. `findProjectRoot` walks past the submodule's `.git` file to find the parent sidecar. **Should work today after Phase B.**

Tests #12-22 from the plan are the proof. None written yet.

---

## File reference index

### New helpers (Phase B)
- `packages/appwrite-utils-helpers/src/config/findProjectRoot.ts`
- `packages/appwrite-utils-helpers/src/cli/resolveCliCredentials.ts`
- `packages/appwrite-utils-helpers/src/cli/perFunctionAggregator.ts`

### New CLI flows (Phase A + B)
- `packages/appwrite-utils-cli/src/cli/commands/initFlow.ts` (Phase A, fixed in B step 2)
- `packages/appwrite-utils-cli/src/cli/commands/upgradeConfigFlow.ts` (Phase A — stub notice)
- `packages/appwrite-utils-cli/src/cli/commands/passthroughCommand.ts` (Phase A, fixed in B step 2)
- `packages/appwrite-utils-cli/src/cli/commands/regenFlow.ts` (Phase B step 6)

### Modified (Phase B)
- `packages/appwrite-utils/src/schemas/utilsExtensionConfig.ts` — `PerFunctionConfigSchema`, `PerSiteConfigSchema` + types
- `packages/appwrite-utils/src/index.ts` — barrel re-exports for new schemas
- `packages/appwrite-utils-helpers/src/cli/index.ts` — barrels for `resolveCliCredentials`, `perFunctionAggregator`
- `packages/appwrite-utils-helpers/src/config/index.ts` — barrel for `findProjectRoot`
- `packages/appwrite-utils-cli/src/main.ts` — `regen`/`noDeploy` types (lines 90-91), yargs registration (660-668), auth-bypass list (710), regen dispatch (754-764), `configPath: argv.config` plumbed to init/passthrough (714, 735)

### Phase A foundation (referenced)
- `packages/appwrite-utils-helpers/src/cli/appwriteCliRunner.ts`
- `packages/appwrite-utils-helpers/src/cli/appwriteCliAuth.ts`
- `packages/appwrite-utils-helpers/src/cli/configBridge.ts`
- `packages/appwrite-utils-helpers/src/config/extensionConfigLoader.ts`
- `packages/appwrite-utils-helpers/src/functions/cliFunctionDeploy.ts`
- `packages/appwrite-utils-helpers/src/sites/cliSiteDeploy.ts`
- `packages/appwrite-utils/src/schemas/officialConfig.ts`
- `packages/appwrite-utils/scripts/generate-zod-from-openapi.ts`
- `packages/appwrite-utils/src/schemas/generated/` (179 files)

### To touch when picking up #18-22
- `packages/appwrite-utils-helpers/src/cli/configBridge.ts` (add `syncExtensionStubsFromOfficial`)
- `packages/appwrite-utils-cli/src/cli/commands/syncExtensionsFlow.ts` (NEW)
- `packages/appwrite-utils-cli/src/main.ts` (`--sync-extensions` flag)
- `packages/appwrite-utils-cli/src/interactiveCLI.ts` (`--it` auto-sync prompt)
- `packages/appwrite-utils-helpers/src/config/services/ConfigMergeService.ts` (#20 — env var parity)
- `packages/appwrite-utils-helpers/src/config/ConfigManager.ts` (#20 — wire `mergeEnvironmentVariables` into `loadConfig`)

---

## Build state

`bun run build` at monorepo root currently green across all four packages: `appwrite-utils`, `appwrite-utils-helpers`, `appwrite-utils-cli`, `appwrite-utils-mcp`. CLI `--help` shows `--regen`, `--noDeploy/--no-deploy`, `--init`, `--upgradeConfig`, `--passthrough`, `--config`.
