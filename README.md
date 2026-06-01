# cloudtak-plugin-caltopo-sync

A [CloudTAK](https://github.com/dfpc-coe/CloudTAK) frontend plugin that pairs a Caltopo Map with a TAK Mission and lets the user trigger bidirectional delta sync on demand.

> Status: **Phase 2 scaffold — UI surface complete; Node-RED subflow lives in [`nodered/`](./nodered) (separate ship).**

## Architecture (v1)

```
┌──────────────────────────┐         ┌────────────────────────┐         ┌──────────┐
│ CloudTAK browser plugin  │ ──HTTP─▶│ Node-RED sync engine   │ ──API──▶│ Caltopo  │
│ (this repo)              │         │ (separate Docker host) │ ──API──▶│ TAK Srv  │
│                          │ ◀───────│  + PostGIS state cache │ ◀───────│          │
└──────────────────────────┘         └────────────────────────┘         └──────────┘
       │ Settings panel                       │ Existing flow lives in
       │ Pair manager                         │ node-red-sarops-docker
       │ "Sync Now" button                    │ This repo ships only the
       │ Sync result viewer                   │ thin HTTP-In subflow in nodered/
       └──────────────────                    └──────────────────
```

**Sync model:** delta sync (diff against PostGIS state cache), **last-write-wins** per feature, conflict counts surfaced in the response. Manual trigger only — no background job.

## Layout

```
src/                  Vue/TypeScript plugin source
  index.ts            Plugin entry; registers menu + route
  types.ts            Shared types (Pair, SyncResult, HealthCheck…)
  api/                Typed HTTP client for the Node-RED contract
  components/         Settings panel, pair manager, sync trigger, result viewer
  stores/             Pinia store for plugin-local state
nodered/              Importable HTTP-In subflow + contract docs
docs/                 Architecture, auth, conflict policy, discovery reports
scripts/dev-link.sh   Symlink helper for local development against a CloudTAK checkout
test/                 Reserved for Phase 4
```

## Install (operator)

CloudTAK plugins are **compile-time vendored** — there is no runtime upload UI. To ship this plugin to a CloudTAK deployment:

1. Clone this repo somewhere reachable by the operator's build host.
2. Symlink (or copy) `src/` into `CloudTAK/api/web/plugins/caltopo-sync` **before** running `npm run build` in the host.
3. Operate the Node-RED side per [`nodered/README.md`](./nodered) — the plugin's "Settings" panel only configures the Node-RED base URL.

## Develop

Prerequisites: a local CloudTAK checkout and a running Node-RED instance with the CalTAKsync subflow imported.

```bash
git clone <this-repo>
cd cloudtak-plugin-caltopo-sync
npm install
bash scripts/dev-link.sh /path/to/CloudTAK
cd /path/to/CloudTAK/api/web
npm run serve   # Vite HMR; restart once after first symlink so the glob picks us up
```

`scripts/dev-link.sh` creates `<CloudTAK>/api/web/plugins/caltopo-sync` as a symlink to this repo's **root**. Idempotent — safe to re-run. (It links the root, not `src/`, so the dev layout matches how the production Docker build clones the repo into `plugins/caltopo-sync/` via `WEB_PLUGINS`. That clone places the plugin at `plugins/caltopo-sync/src/...`, which is why cross-host imports use `../../../../src/...`.)

To lint in this repo (full coverage, runs standalone):

```bash
npm run lint      # eslint src
```

For full type verification, the plugin must be symlinked into the host first — its components import host internals via `../../../../src/...` paths that only resolve when the repo root lives at `host/api/web/plugins/caltopo-sync/` (so the components sit at `plugins/caltopo-sync/src/components/...`). The production typecheck path is:

```bash
bash scripts/dev-link.sh /path/to/CloudTAK
cd /path/to/CloudTAK/api/web
npm run check     # host's vue-tsc, sees the symlinked plugin
```

`npm run check` in this repo (standalone) catches in-source bugs but reports cross-host imports as missing modules — that's expected and not a defect. The Vite dev server (`npm run serve` in the host) is the canonical compile-time check.

`@tak-ps/cloudtak` is a peer dep (types only). The `devDependency` `file:../../CloudTAK/api/web` is for IDE convenience; if your checkout lives elsewhere, edit the path in `package.json`.

## Node-RED side — environment variables

The Caltopo credentials and TAK destination live entirely in the Node-RED instance; the browser plugin never sees them. See [`nodered/README.md`](./nodered) for the full list — at minimum:

- `CALTOPO_CREDENTIAL_ID`
- `CALTOPO_CREDENTIAL_KEY`
- PostGIS connection details for the state cache
- TAK server URL / cert paths used by the existing flow

The plugin's "Health" tab calls `GET /sync/health` on the configured Node-RED base URL — green checks here mean the engine is wired up; red means fix Node-RED first.

## Screenshots

_TODO: add screenshots of Settings, Pairs, and Health tabs once the host build is verified._

## License

[AGPL-3.0](./LICENSE) — matching CloudTAK.
