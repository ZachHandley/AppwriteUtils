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

