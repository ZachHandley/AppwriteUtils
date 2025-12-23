# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- Push flow now uses explicit, manual selection for databases and tables/collections. No more auto-selecting all databases on `--push`.
- Adapter-first orchestration for schema updates. Attributes and indexes are compared and only created/updated when changed.
- Added clear summaries after attribute and index operations (create/update/skip counts).
- Improved index handling: existence check, tolerant duplicate handling, and availability polling.
- Multi-database targeting supported via `databaseIds` (alongside `databaseId`) on table/collection definitions.
- Per-function configuration discovery via `.fnconfig.yaml` anywhere in the repository. Relative `dirPath` resolves from the file’s directory; `~` expands to homedir.
- TablesDB/legacy detection is fetch-based; no additional SDK packages required.
- New: Python (Pydantic) model generation with modern typing (PEP 604 unions) and Appwrite alias mapping. Generates:
  - `base.py` (always overwritten) with aliased $id/$createdAt/$updatedAt/$permissions and helpers
  - One model per collection/table extending `BaseAppwriteModel`
  - Output directory selectable during interactive flow (absolute paths respected)
- Constants generator now supports selecting which categories to include (databases, collections/tables, buckets, functions).
- Bucket management: interactive create/delete commands with YAML persistence when active; selective push now diffs and updates bucket settings (name, permissions, security, limits).

## 1.8.8 - 2025-10-29

- Fix: Selective push processed state is tracked per database. Previously, pushing the same table to multiple databases could skip the second database with “already processed”; now each DB is handled independently.
- Fix: Clear in-memory processing state between databases during multi-DB pushes to prevent cross-database leakage of IDs and processed flags.
- Enhancement: Interactive selection adds “Use same selection as before” when choosing tables per database, speeding up multi-DB workflows.
- Behavior: Non-interactive `--push` with both `--dbIds` and `--collectionIds` is fully non-interactive. The provided IDs are applied as-is to every selected database and the confirmation summary is skipped.
- Improvement: Selective push reloads local config from disk before pushing to ensure the latest YAML/TS changes are used.
- Fix: Sync-from-Appwrite now captures function `scopes` and writes them to config; deployments use `scopes` from either central config or `.fnconfig.yaml`.
- Change: Removed global prompt to choose between central `config.yaml` and per-function `.fnconfig.yaml` during function deployments. The tool now prompts per function only when both sources exist for that function (with an option to merge where `.fnconfig` overrides).

## 1.8.9 - 2025-10-29

- Fix: Functions sync now fetches full details via `getFunction` per function to reliably capture `scopes` (prevents empty scopes in some environments).
- Confirmed schema: YAML `appwrite-config.schema.json` supports `functions[].dirPath`; writers preserve `dirPath` when present.
- Polish: Per-function config source selection is now applied at deploy time when both central and `.fnconfig.yaml` are present.
