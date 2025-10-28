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
