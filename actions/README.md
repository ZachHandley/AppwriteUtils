# Appwrite Utils GitHub Actions

Reusable composite actions that run [`appwrite-utils-cli`](https://www.npmjs.com/package/appwrite-utils-cli)
in CI. They install and run the CLI via **`bunx`**, which executes dependency build
scripts (esbuild, pulled in transitively by the CLI's runtime `tsx` dependency)
**non-interactively** — so there is no `pnpm`-style "Choose which packages to build"
prompt to hang your pipeline.

All three actions share one dependency-free orchestration script
(`actions/_shared/run.ts`) that bun runs directly — no build step, no bundled
`dist/`. The Appwrite API key is forwarded to the CLI through the environment only,
never on the command line, so it never appears in a logged command.

## Actions

| Action | CLI command | Purpose |
| --- | --- | --- |
| `actions/deploy-functions` | `--deployFunctions` | Deploy one or more Appwrite Functions. |
| `actions/push-schema` | `--push` | Deploy local config (tables, columns, indexes) to Appwrite. |
| `actions/appwrite-migrate` | _(raw args)_ | Run `appwrite-migrate` with any arguments (sync, import, generate, backup, regen, …). |

## Deploy functions (matrix example)

```yaml
jobs:
  deploy:
    strategy:
      matrix:
        fn: [fn-a, fn-b, fn-c]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: zachhandley/AppwriteUtils/actions/deploy-functions@dev
        with:
          endpoint: ${{ secrets.APPWRITE_ENDPOINT }}
          project-id: ${{ secrets.APPWRITE_PROJECT_ID }}
          api-key: ${{ secrets.APPWRITE_API_KEY }}
          function-ids: ${{ matrix.fn }}
```

Omit `function-ids` to deploy every function discovered from `.fnconfig.yaml`
files and `config.yaml`'s `functions[]`.

## Push schema

```yaml
      - uses: zachhandley/AppwriteUtils/actions/push-schema@dev
        with:
          endpoint: ${{ secrets.APPWRITE_ENDPOINT }}
          project-id: ${{ secrets.APPWRITE_PROJECT_ID }}
          api-key: ${{ secrets.APPWRITE_API_KEY }}
```

## Generic (any command)

```yaml
      - uses: zachhandley/AppwriteUtils/actions/appwrite-migrate@dev
        with:
          endpoint: ${{ secrets.APPWRITE_ENDPOINT }}
          project-id: ${{ secrets.APPWRITE_PROJECT_ID }}
          api-key: ${{ secrets.APPWRITE_API_KEY }}
          args: "--sync"
```

## Common inputs

- `endpoint`, `project-id`, `api-key` — Appwrite credentials. The CLI also accepts
  `APPWRITE_ENDPOINT` / `APPWRITE_PROJECT_ID` / `APPWRITE_API_KEY`; these actions set
  those for you from the inputs.
- `working-directory` (default `.`) — where the CLI runs (your config and function
  source live here; remember `actions/checkout` first).
- `cli-version` (default `latest`) — the npm dist-tag or exact version of
  `appwrite-utils-cli` to run.

`deploy-functions` additionally exposes `function-ids`, `function-path`,
`build-concurrency`, `config`, and single-function overrides (`runtime`,
`entrypoint`, `commands`, `schedule`, `timeout`, `scopes`, `events`, `execute`,
`enabled`, `logging`). The overrides only apply when exactly one function is
targeted.

## Installing the CLI directly with pnpm (without these actions)

If you install `appwrite-utils-cli` yourself with **pnpm 10+**, pnpm will pause on
an interactive prompt to approve `esbuild`'s build script. The old
`pnpm.onlyBuiltDependencies` field in `package.json` is ignored by pnpm 10+; the
allowlist now lives in `pnpm-workspace.yaml`:

```yaml
# pnpm-workspace.yaml
onlyBuiltDependencies:
  - esbuild
```

Using the actions above avoids this entirely (they install via bun).
